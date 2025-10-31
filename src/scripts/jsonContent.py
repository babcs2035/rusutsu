import json
import sys
import os

def extract_and_print_course_metrics(geojson_path):
    with open(geojson_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 対象のキーと対応する出力名
    map_keys = [
        "horizontal_dist_map",
        "slope_dist_map",
        "elevation_diff_map",
        "avg_slope_deg_map",
        "max_slope_deg_map"
    ]

    for feature in data.get("features", []):
        props = feature.get("properties", {})
        name = props.get("name", "unknown")
        print(f"--- {name} ---")
        for src_key in map_keys:
            print(f"{src_key}: {props[src_key]}")
        print()  # 空行で区切り

def main():
    if len(sys.argv) != 3:
        print("Usage: python jsonContent.py <slope_type> <resort_name>")
        print("Example: python jsonContent.py slope_10m daisen-white-resort")
        sys.exit(1)
    
    slope_type = sys.argv[1]
    resort_name = sys.argv[2]
    
    # パスを構築（.geojsonを自動付与）
    geojson_path = f"../data/resorts-temporary/{slope_type}/{resort_name}.geojson"
    
    # ファイルの存在チェック
    if not os.path.exists(geojson_path):
        print(f"Error: File not found: {geojson_path}")
        sys.exit(1)
    
    # メトリクス抽出・表示を実行
    extract_and_print_course_metrics(geojson_path)

if __name__ == "__main__":
    main()