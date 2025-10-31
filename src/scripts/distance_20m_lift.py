import json
import math
import requests
from geopy import Point
from geopy.distance import geodesic
from pathlib import Path
import time
import random

# ディレクトリのパス
before_dir = Path("../data/resorts-temporary/lift_before")
after_dir = Path("../data/resorts-temporary/lift_20m")

# .geojsonファイルの一覧を取得
before_files = sorted(f for f in before_dir.glob("*.geojson"))
after_files = {f.name for f in after_dir.glob("*.geojson")}

# 処理対象のファイルを選定（after_dirに存在しないもの）
targets = [f for f in before_files if f.name not in after_files]

def sample_line(coords, interval):
    """20m間隔で補間"""
    sampled_coords = []
    prev_point = Point(coords[0][1], coords[0][0])
    sampled_coords.append((prev_point.latitude, prev_point.longitude))
    distance_accumulator = 0.0
    next_target_distance = interval

    for i in range(1, len(coords)):
        start = Point(coords[i - 1][1], coords[i - 1][0])
        end = Point(coords[i][1], coords[i][0])
        segment_distance = geodesic(start, end).meters

        while distance_accumulator + segment_distance >= next_target_distance:
            remaining_distance = next_target_distance - distance_accumulator
            fraction = remaining_distance / segment_distance
            lat = start.latitude + (end.latitude - start.latitude) * fraction
            lon = start.longitude + (end.longitude - start.longitude) * fraction
            sampled_coords.append((lat, lon))
            next_target_distance += interval

        distance_accumulator += segment_distance

    if sampled_coords[-1] != (coords[-1][1], coords[-1][0]):
        sampled_coords.append((coords[-1][1], coords[-1][0]))

    return sampled_coords, distance_accumulator

def get_elevations(sampled_coords, interval):
    """標高取得"""
    elevated_points = []
    for lat, lon in sampled_coords:
        url = f"https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon={lon}&lat={lat}&outtype=JSON"
        try:
            time.sleep(0.15)
            res = requests.get(url)
            data = res.json()
            elev = float(data.get("elevation"))
        except:
            elev = None
            print(f"❌ Error fetching elevation for {lat}, {lon}")
        elevated_points.append((lat, lon, elev))
    cource_dist = 0
    for i in range(1, len(elevated_points)):
        elevation_diff = elevated_points[i][2]-elevated_points[i-1][2]
        if (i == len(elevated_points)-1):
            start = Point(elevated_points[i-1][0], elevated_points[i-1][1])
            end = Point(elevated_points[i][0], elevated_points[i][1])
            segment_distance = geodesic(start, end).meters
            cource_dist += math.sqrt(segment_distance**2 + elevation_diff**2)
        else:
            cource_dist += math.sqrt(interval**2 + elevation_diff**2)
    cource_elevation_diff = abs(elevated_points[-1][2]-elevated_points[0][2])
    return elevated_points, cource_dist, cource_elevation_diff

for input_file in targets:
    output_file = after_dir / input_file.name
    with open(input_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    interval = 20.0
    output_features = []

    for feature in data["features"]:
        name = feature["properties"]["name"]
        coords = feature["geometry"]["coordinates"]
        # 10m間隔で補間
        sampled, horizontal_distance = sample_line(coords, interval)

        # 標高を取得
        elevated, cource_distance, elevation_diff = get_elevations(sampled, interval)
        start_elev = elevated[0][2]
        end_elev = elevated[-1][2]
        # geometry.coordinates 用の [lon, lat, elevation] リストを作成
        coordinates_with_elevation = [[pt[1], pt[0], pt[2]] for pt in elevated]

        mid_point_prop = feature["properties"].get("midstation")
        if mid_point_prop:
            print("midstation found in properties, fetching elevation...")
            lon_m, lat_m = mid_point_prop      # 読み込みは [経度, 緯度]
            # 標高取得
            url = f"https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon={lon_m}&lat={lat_m}&outtype=JSON"
            try:
                mid_res = requests.get(url)
                mid_data = mid_res.json()
                mid_elev = float(mid_data.get("elevation"))
            except Exception:
                mid_elev = None
            # 書き込み用に [緯度, 経度, 標高] の順番で用意
            midstation = [lat_m, lon_m, mid_elev]
        else:
            midstation = None


        output_features.append({
            "type": "Feature",
            "properties": {
                "name": name,
                "horizontal_dist_map": int(horizontal_distance),
                "slope_dist_map": int(cource_distance),
                "elevation_diff_map": round(elevation_diff, 1),
                "midstation": midstation,
            },
            "geometry": {
                "type": "LineString",
                "coordinates": coordinates_with_elevation
            }
        })
        
        print(f"✅コース名: {name}, 水平距離: {int(horizontal_distance)}m, リフト長: {int(cource_distance)}m, 標高差: {round(elevation_diff, 1)}m, 山麓標高: {start_elev}m, 山頂標高: {end_elev}m")

    result = {
        "type": "FeatureCollection",
        "features": output_features
    }


    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"✅ Done! Output saved to {output_file}")