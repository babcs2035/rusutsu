import json
import math
import requests
from geopy import Point
from geopy.distance import geodesic



def get_elevation(lat, lon):
    url = f"https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon={lon}&lat={lat}&outtype=JSON"
    try:
        res = requests.get(url)
        data = res.json()
        return float(data["results"][0]["elevation"])
    except Exception as e:
        print(f"Error at ({lat},{lon}): {e}")
        return None

def recompute_elevations_and_slopes(coords, interval=10.0, segment_length=40.0):
    elevated_points = []
    for lon, lat, _ in coords:
        elev = get_open_elevation(lat, lon)
        elevated_points.append((lat, lon, elev))

    slopes = []
    segment_points = int(segment_length / (2 * interval))

    for i in range(len(elevated_points) - 1):
        if i - segment_points >= 0 and i + segment_points < len(elevated_points) - 1:
            start = elevated_points[i - segment_points]
            end = elevated_points[i + segment_points]
            if start[2] is None or end[2] is None:
                slope_deg = None
            else:
                slope_rad = math.atan((start[2] - end[2]) / segment_length)
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
    for i in range(1, min(segment_points + 1, len(slopes))):
        slopes[-i]["slope_deg"] = slopes[-segment_points]["slope_deg"]

    return slopes

def replace_course_in_geojson(input_file, output_file, target_course_name):
    with open(input_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    interval = 10.0
    new_features = []

    for feature in data["features"]:
        name = feature["properties"].get("name")
        if name == target_course_name:
            coords = feature["geometry"]["coordinates"]
            slopes = recompute_elevations_and_slopes(coords, interval)

            coordinates_with_elevation = [[pt["lon"], pt["lat"], pt["elevation"]] for pt in slopes]
            slope_list = [pt["slope_deg"] for pt in slopes]

            # 距離と標高差の再計算
            horizontal_distance = 0.0
            for i in range(1, len(slopes)):
                p1 = Point(slopes[i-1]["lat"], slopes[i-1]["lon"])
                p2 = Point(slopes[i]["lat"], slopes[i]["lon"])
                horizontal_distance += geodesic(p1, p2).meters

            elevation_diff = slopes[0]["elevation"] - slopes[-1]["elevation"]
            slope_distance = math.sqrt(horizontal_distance**2 + elevation_diff**2)
            avg_slope_deg = math.degrees(math.atan(elevation_diff / slope_distance))
            max_slope_deg = max(s for s in slope_list if s is not None)

            feature["properties"].update({
                "slope_deg": slope_list,
                "horizontal_dist_map": int(horizontal_distance),
                "slope_dist_map": int(slope_distance),
                "elevation_diff_map": round(elevation_diff, 1),
                "avg_slope_deg_map": round(avg_slope_deg, 1),
                "max_slope_deg_map": round(max_slope_deg, 1)
            })

            feature["geometry"]["coordinates"] = coordinates_with_elevation
            print(f"✅ コース '{name}'  標高差: {round(elevation_diff, 1)} 平均斜度: {round(avg_slope_deg, 1)}度, 最大斜度: {round(max_slope_deg, 1)}度")
        new_features.append(feature)

    result = {
        "type": "FeatureCollection",
        "features": new_features
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"✅ 出力を {output_file} に保存しました")

# === 実行 ===
target_course = "朝里ダイナミック"  # ← ここに更新したいコース名を入れる
input_geojson = "../data/resorts-temporary/slope_10m/kiroro-snow-world.geojson"
output_geojson = "../data/resorts-temporary/slope_10m/kiroro-snow-world_updated.geojson"

replace_course_in_geojson(input_geojson, output_geojson, target_course)
