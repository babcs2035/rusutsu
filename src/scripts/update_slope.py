import json
import math

new_segment_length = 40.0  # ここで斜度計算の範囲を変更できる
interval = 10.0  # 元の補間間隔と同じにしておく

# 入出力ファイル
input_file = "../data/resorts-temporary/slope_10m/kiroro-snow-world_updated.geojson"
output_file = "../data/resorts-temporary/slope_10m/kiroro-snow-world2.geojson"

def compute_slopes(elevated_points, segment_length, interval=10.0):
    slopes = []
    segment_points = int(segment_length / (2 * interval))

    for i in range(len(elevated_points)-1): 
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
    
    for i in range(1, min(segment_points+1, len(slopes))):
        slopes[-i]["slope_deg"] = slopes[-segment_points]["slope_deg"]

    return slopes


with open(input_file, "r", encoding="utf-8") as f:
    data = json.load(f)

for feature in data["features"]:
    name = feature["properties"]["name"]
    coords = feature["geometry"]["coordinates"]  # [lon, lat, elev]

    # 緯度経度標高付きデータを読み込み
    elevated = [(pt[1], pt[0], pt[2]) for pt in coords]  # [(lat, lon, elev), ...]

    # 新しい斜度を計算
    slopes = compute_slopes(elevated, segment_length=new_segment_length, interval=interval)

    # slope_degのリストを更新
    slope_list = [pt["slope_deg"] for pt in slopes]
    feature["properties"]["slope_deg"] = slope_list

    max_slope_deg = max(filter(lambda x: x is not None, slope_list), default=0)
    elevation_diff = elevated[0][2] - elevated[-1][2]
    total_distance = feature["properties"]["slope_dist_map"]
    avg_slope_deg = math.degrees(math.atan(elevation_diff / total_distance)) if total_distance != 0 else 0

    feature["properties"]["avg_slope_deg_map"] = round(avg_slope_deg, 1)
    feature["properties"]["max_slope_deg_map"] = round(max_slope_deg, 1)

    print(f"✅ Updated: {name}, 平均斜度: {round(avg_slope_deg, 1)}度, 最大斜度: {round(max_slope_deg, 1)}度")

# 保存
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"🎉 Done! Updated file saved to {output_file}")
