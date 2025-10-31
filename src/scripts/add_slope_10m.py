import json
import math
import requests
from geopy import Point
from geopy.distance import geodesic
from pathlib import Path

before_dir = Path("../data/resorts-temporary/slope_before")
after_dir = Path("../data/resorts-temporary/slope_10m")

# スキー場名を指定（例: "myresort.geojson"）
target_resort_name = "sol-fa-oda.geojson"

input_file = before_dir / target_resort_name
output_file = after_dir / target_resort_name

if not input_file.exists():
    raise FileNotFoundError(f"{input_file} が存在しません")

# 既存のデータを読み込む（もし存在すれば）
if output_file.exists():
    with open(output_file, "r", encoding="utf-8") as f:
        existing_data = json.load(f)
    existing_course_names = {feat["properties"]["name"] for feat in existing_data["features"]}
    output_features = existing_data["features"]
else:
    existing_course_names = set()
    output_features = []

def sample_line(coords, interval):
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
    elevated_points = []
    for lat, lon in sampled_coords:
        url = f"https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon={lon}&lat={lat}&outtype=JSON"
        try:
            res = requests.get(url)
            data = res.json()
            elev = float(data.get("elevation"))
        except:
            elev = None
        elevated_points.append((lat, lon, elev))

    cource_dist = 0
    for i in range(1, len(elevated_points)):
        elevation_diff = elevated_points[i][2] - elevated_points[i-1][2]
        if i == len(elevated_points)-1:
            start = Point(elevated_points[i-1][0], elevated_points[i-1][1])
            end = Point(elevated_points[i][0], elevated_points[i][1])
            segment_distance = geodesic(start, end).meters
            cource_dist += math.sqrt(segment_distance**2 + elevation_diff**2)
        else:
            cource_dist += math.sqrt(interval**2 + elevation_diff**2)

    cource_elevation_diff = elevated_points[0][2] - elevated_points[-1][2]
    return elevated_points, cource_dist, cource_elevation_diff

def compute_slopes(elevated_points, segment_length=40.0, interval=10.0):
    slopes = []
    segment_points = int(segment_length / (2 * interval))

    for i in range(len(elevated_points)):
        if i - segment_points >= 0 and i + segment_points < len(elevated_points)-1:
            start = elevated_points[i - segment_points]
            end = elevated_points[i + segment_points]
            elev_start, elev_end = start[2], end[2]

            if elev_start is None or elev_end is None:
                slope_deg = None
            else:
                slope_rad = math.atan((elev_start - elev_end) / segment_length)
                slope_deg = math.degrees(slope_rad)
        else:
            slope_deg = slopes[-1]["slope_deg"] if slopes else None

        slopes.append({
            "lat": elevated_points[i][0],
            "lon": elevated_points[i][1],
            "elevation": elevated_points[i][2],
            "slope_deg": slope_deg
        })

    for i in range(min(segment_points, len(slopes))):
        slopes[i]["slope_deg"] = slopes[segment_points]["slope_deg"]

    return slopes

# 元データを開く
with open(input_file, "r", encoding="utf-8") as f:
    data = json.load(f)

interval = 10.0

# 各コースを処理
for feature in data["features"]:
    name = feature["properties"]["name"]
    if name in existing_course_names:
        print(f"⏩ 既に存在するためスキップ: {name}")
        continue

    if feature["geometry"]["type"] != "LineString":
        print(f"❌ Invalid geometry type for {name}: {feature['geometry']['type']}")
        continue

    coords = feature["geometry"]["coordinates"]
    sampled, horizontal_distance = sample_line(coords, interval)
    elevated, cource_distance, elevation_diff = get_elevations(sampled, interval)
    slopes = compute_slopes(elevated)

    coordinates_with_elevation = [[pt["lon"], pt["lat"], pt["elevation"]] for pt in slopes]
    slope_list = [pt["slope_deg"] for pt in slopes]
    max_slope_deg = max(slope_list)
    avg_slope_deg = math.degrees(math.atan(elevation_diff / cource_distance))

    output_features.append({
        "type": "Feature",
        "properties": {
            "name": name,
            "slope_deg": slope_list,
            "horizontal_dist_map": int(horizontal_distance),
            "slope_dist_map": int(cource_distance),
            "elevation_diff_map": round(elevation_diff, 1),
            "avg_slope_deg_map": round(avg_slope_deg, 1),
            "max_slope_deg_map": round(max_slope_deg, 1)
        },
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates_with_elevation
        }
    })

    print(f"✅ 追加: {name}, 平均斜度: {round(avg_slope_deg,1)}度, 最大斜度: {round(max_slope_deg,1)}度")

# 書き出し
result = {
    "type": "FeatureCollection",
    "features": output_features
}

with open(output_file, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"✅ 完了: {output_file} に保存しました")
