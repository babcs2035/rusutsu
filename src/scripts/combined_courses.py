from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple


BASE = Path("../data/resorts-temporary")
OUT  = Path("../data/resorts-finalized/courses")

_SPECIAL_PARTS  = {"上部", "中部", "下部"} 

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

def normalize(name: str) -> str:
    """
    "白樺ゲレンデ 上部"→"白樺ゲレンデ_#上部"
    "白樺ゲレンデ上部" → "白樺ゲレンデ_#上部"
    "白樺ゲレンデ" → "白樺ゲレンデ"
    "HAPPO PARK" → "HAPPO PARK"
    "HAPPO PARK 上部" → "HAPPO PARK_#上部"
    """
    # 全角→半角空白
    text = name.replace("　", " ").strip()

    # "白樺ゲレンデ 上部"→"白樺ゲレンデ_#上部"
    for part in _SPECIAL_PARTS:
        if text.endswith(f" {part}"):
            base = text[:-(len(part) + 1)].strip()
            return f"{base}_#{part}"

    # "白樺ゲレンデ上部" → "白樺ゲレンデ_#上部"
    for part in _SPECIAL_PARTS:
        if text.endswith(part):
            base = text[:-len(part)]
            return f"{base}_#{part}"

    return text

def add_marker(name: str) -> str:
    """
    "白樺ゲレンデ_上部" → "白樺ゲレンデ_#上部"
    """
    return re.sub(r'_(?!#)', '_#', name)

def canonical_base(name: str) -> str:
    """
    "白樺ゲレンデ南_#上部"→ "白樺ゲレンデ南"
    "スカイライン_尾根筋コース"→ "スカイライン"
    """
    return name.split("_")[0]


def remove_suffix_index_if_multi_part(name: str) -> str:
    """
    名前が複数の区切り（_）を含む場合に、末尾の _数字 を削除する。
    """
    if name.count("_") >= 2:
        return re.sub(r'_\d+$', '', name)
    return name

def adjust_name(name: str) -> str:
    """
    "無名_1"→ "無名"
    "無名_連絡"→ "連絡"
    "白樺ゲレンデ南_#上部"→ 白樺ゲレンデ南_#上部
    "ウスバ_下部"→ "ウスバ下部"
    "スカイライン_尾根筋コース"→ "スカイライン (尾根筋コース)"
    "スカイライン_2"→ "スカイライン_2"
    "スカイライン_#上部_2"→ "スカイライン_2"
    """
    parts = name.split("_")
    if len(parts) == 2:
        base, suffix = parts
        if base == "無名":
            return base if suffix.isdigit() else suffix
        if suffix.isdigit():
            return name
        elif suffix.startswith("#"):
            return name
        elif suffix.startswith("上部") or suffix.startswith("中部") or suffix.startswith("下部"):
            return f"{base}{suffix}"
        else:
            return f"{base} ({suffix})"
    elif len(parts) == 3:
        base, mid, suffix = parts
        if mid.startswith("#"):
            return f"{base}_{suffix}"
        else:
            return f"{base}{mid}_{suffix}"

    return name

def main():
    if len(sys.argv) < 2:
        print("Usage: python combined_courses.py <スキー場名>")
        sys.exit(1)

    target = sys.argv[1].strip()
    if not target:
        print("❌ Resort name is an empty string.")
        print("Usage: python combined_courses.py <スキー場名>")
        sys.exit(1)

    print(f"🔍 Searching for '{target}'...")

    # 1) slope_detail の検索
    detail_folder = BASE / "slope_detail"
    detail_files = find_files(detail_folder, target, "json")
    if not detail_files:
        sys.exit(f"❌ No JSON found in slope_detail for '{target}'")

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
                canonical_name = canonical_base(name)
                canonical_prev_name = canonical_base(prev_name)
                if canonical_name != canonical_prev_name:
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
        for course in data.get("courses", []):
            raw = course.get("name")
            name = normalize(raw) # クローリングの結果だけ修正
            if name:
                status_lookup[name] = course
    
    # 3) slope_10m の検索とマージ
    slope10_folder = BASE / "slope_10m"
    geo_files = find_files(slope10_folder, target, "geojson")
    if not geo_files:
        sys.exit(f"❌ No GeoJSON found in slope_10m for '{target}'")
    
    segments: Dict[str,  List[Dict[str, Any]]] = {}
    gj = load_json(geo_files)
    for feature in gj["features"]:
        geojson_name = feature["properties"].get("name")
        if geojson_name:
            segments[geojson_name]=feature
    
    features: List[Dict[str, Any]] = []
    for norm_name, feat in segments.items():
        base = canonical_base(norm_name)
        # 「正規化名 → ベース名」の順で探す
        detail = detail_lookup.get(norm_name) or detail_lookup.get(base)
        if not detail:
            print(f"⚠️ slope_detail not found: {norm_name}", file=sys.stderr)

        status_name = remove_suffix_index_if_multi_part(norm_name)
        add_marker_norm_name = add_marker(status_name)
        status = status_lookup.get(status_name) or status_lookup.get(base) or status_lookup.get(add_marker_norm_name)


        if not status and base != "無名":
            # print(status_lookup)
            print(f"⚠️ Crawled data not found: {norm_name}", file=sys.stderr)
        
        
        
        props = feat["properties"].copy()
        props["name"] = adjust_name(norm_name)
        if detail:
            valid_values = {"○", "△", "×"}
            for key in ("piste", "snowboard"):
                value = detail.get(key)
                if value is None or value == "":
                    print(f"❌ '{key}' is empty in slope_detail: {norm_name}", file=sys.stderr)
                elif value not in valid_values:
                    print(f"❌ Invalid value for '{key}' in slope_detail: {norm_name} → {value}", file=sys.stderr)
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