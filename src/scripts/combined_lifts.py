from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple


BASE = Path("../data/resorts-temporary")
OUT  = Path("../data/resorts-finalized/lifts")


def find_files(folder: Path, target: str, ext: str):
    # ① folder.glob(f"*.{ext}") で拡張子が .ext のファイルを列挙
    # ② p.stem（拡張子を除いたファイル名）に、targetと一致しているかどうかを判定
    matches = [p for p in folder.glob(f"*.{ext}") if p.stem == target]
    if len(matches) == 0:
        sys.exit(f"❌ No {ext.upper()} file found for '{target}' in {folder}")
    elif len(matches) > 1:
        sys.exit(f"❌ Multiple {ext.upper()} files found for '{target}' in {folder}: {[p.name for p in matches]}")
    return matches[0]

def load_json(path: Path):
    with path.open(encoding="utf-8") as fp:
        return json.load(fp)

def main():
    if len(sys.argv) < 2:
        print("Usage: python combined_lifts.py <スキー場名>")
        sys.exit(1)

    target = sys.argv[1].strip()
    if not target:
        print("❌ Resort name is an empty string.")
        print("Usage: python combined_lifts.py <スキー場名>")
        sys.exit(1)

    print(f"🔍 Searching for '{target}'...")

    # 1) lift_detail の検索
    detail_folder = BASE / "lift_detail"
    detail_files = find_files(detail_folder, target, "json")
    if not detail_files:
        sys.exit(f"❌ No JSON found in lift_detail for '{target}'")

    detail_lookup: Dict[str, Dict[str, Any]] = {}
    items = load_json(detail_files)
    for item in items:
        name = item.get("name")
        if name:
            detail_lookup[name] = item
    seen_images = {}
    for name, item in detail_lookup.items():
        image_url = item.get("image")
        if image_url:
            if image_url in seen_images:
                prev_name = seen_images[image_url]
                print(f"❌ Duplicate image URL '{image_url}' found in: '{prev_name}' and '{name}'", file=sys.stderr)
            else:
                seen_images[image_url] = name

    # 2) latest_data の検索
    status_lookup: Dict[str, Dict[str, Any]] = {}
    latest_dir = BASE / "latest_data" / target
    if latest_dir.exists() and latest_dir.is_dir():
        json_files = list(latest_dir.glob("*.json"))
    if json_files:
        # 更新日時で最も新しいファイルを選ぶ
        latest_file = max(json_files, key=lambda f: f.stat().st_mtime)
        data = load_json(latest_file)
        for course in data.get("lifts", []):
            name = course.get("name")
            if name:
                status_lookup[name] = course
    
    # 3) lift_20m の検索とマージ
    lift20_folder = BASE / "lift_20m"
    geo_files = find_files(lift20_folder, target, "geojson")
    if not geo_files:
        sys.exit(f"❌ No GeoJSON found in lift_20m for '{target}'")
    
    segments: Dict[str,  List[Dict[str, Any]]] = {}
    gj = load_json(geo_files)
    for feature in gj["features"]:
        geojson_name = feature["properties"].get("name")
        if geojson_name:
            segments[geojson_name]=feature
    
    features: List[Dict[str, Any]] = []
    for name, feat in segments.items():
        # 「正規化名 → ベース名」の順で探す
        detail = detail_lookup.get(name)
        if not detail:
            print(f"⚠️ lift_detail not found: {name}", file=sys.stderr)

        status = status_lookup.get(name)
        if not status:
            print(f"⚠️ Crawled data not found: {name}", file=sys.stderr)
        
        if detail:
            detail_dist = detail.get("distance")
            map_dist = feat["properties"].get("slope_dist_map")
            if detail_dist != "" and map_dist != "":
                try:
                    d1 = float(detail_dist)
                    d2 = float(map_dist)
                    # 差分が 4% を超え, かつ差分が30m以上だったら警告
                    if abs(d1 - d2) / d1 > 0.04 and abs(d1 - d2) > 30:
                        print(f"⚠️ Distance mismatch for '{name}': official: {d1}, map: {d2}", file=sys.stderr)
                except (ValueError, TypeError):
                    print(f"⚠️ Could not parse distances for '{name}': detail {detail_dist}, slope_dist_map {map_dist}", file=sys.stderr)
            detail_vertical = detail.get("vertical")
            map_vertical = feat["properties"].get("elevation_diff_map")
            if detail_vertical != "" and map_vertical != "":
                try:
                    v1 = float(detail_vertical)
                    v2 = float(map_vertical)
                    # 差分が 4% を超え, かつ差分が10m以上だったら警告
                    if abs(v1 - v2) / v1 > 0.04 and abs(v1 - v2) > 10:
                        print(f"⚠️ Vertical mismatch for '{name}': official: {v1}, map: {v2}", file=sys.stderr)
                except (ValueError, TypeError):
                    print(f"⚠️ Could not parse verticals for '{name}': detail {detail_vertical}, elevation_diff_map {map_vertical}", file=sys.stderr)

        
        props = feat["properties"].copy()
        if detail:
            valid_values = {"○", "△", "×"}
            must_be_valid = ("hood", "footrest", "oilShield")
            must_be_non_empty = ("speed", "type", "capacity", "searchWord")

            for key in must_be_valid + must_be_non_empty:
                value = detail.get(key)
                if value is None or value == "":
                    print(f"❌ '{key}' is empty in lift_detail: {name}", file=sys.stderr)
                elif key in must_be_valid and value not in valid_values:
                    print(f"❌ Invalid value for '{key}' in lift_detail: {name} → {value}", file=sys.stderr)
            props.update({k: v for k, v in detail.items() if k != "name"})


        if status:
            status_renamed = {
                ("latest_note" if k == "note" else k): v
                for k, v in status.items() if k != "name"
            }
            props.update(status_renamed)
        
        features.append({
            "type": "Feature",
            "geometry": feat["geometry"],
            "properties": props,
        })

    out_name = latest_file.stem + ".geojson"
    out_path = OUT /target/out_name
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as fp:
        json.dump({"type": "FeatureCollection", "features": features},
                fp, ensure_ascii=False, indent=2)

    print("✅ Merged output written to ", out_path.resolve())

if __name__ == "__main__":
    main()