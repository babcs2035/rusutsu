import json
import pandas as pd
import re

# JSONファイルを読み込む
json_file_path = "SkiResorts.json"

with open(json_file_path, "r", encoding="utf-8") as file:
    ski_data = json.load(file)

# スキー場ごとにExcelファイルを作成
output_files = []

for resort in ski_data:
    # スキー場の基本情報
    resort_id = resort.get("id", "不明")

    # コース情報を取得
    courses_list = []
    courses = resort.get("courses", {}).get("details", [])
    if courses:
        for course in courses:
            courses_list.append({
                "resort": resort_id,
                "name": course.get("name", ""),
                "level": course.get("difficulty", ""),
                "distance": course.get("distance", ""),
                "maxWidth": "",
                "minWidth": "",
                "avg": course.get("angle", ""),
                "max": "",
                "piste": "",
                "snowboard": course.get("snowboard", ""),
                "note": course.get("note", ""),
                "image": "",
                "searchWord": ""
            })
    else:
        # courses が空の場合、resort_id だけ入れた1行を作成
        courses_list.append({
            "resort": resort_id,
            "name": "",
            "level": "",
            "distance": "",
            "maxWidth": "",
            "minWidth": "",
            "avg": "",
            "max": "",
            "piste": "",
            "snowboard": "",
            "note": "",
            "image": "",
            "searchWord": ""
        })

    # リフト情報を取得
    lifts_list = []
    lifts = resort.get("lifts", {}).get("details", [])
    if lifts:
        for lift in lifts:
            lifts_list.append({
                "resort": resort_id,
                "name": lift.get("name", ""),
                "speed": "", #高速か低速か
                "type": "",
                "hood": lift.get("hood", ""),
                "capacity": lift.get("capacity", ""),
                "distance": lift.get("length", ""),
                "vertical": "",
                "top": "",
                "bottom": "",
                "footrest": "",
                "towers": "",
                "signal": "",
                "oilShield": "",
                "note": lift.get("note", ""),
                "searchWord": ""
            })
    else:
        # lifts が空の場合、resort_id だけ入れた1行を作成
        lifts_list.append({
            "resort": resort_id,
            "name": "",
            "speed": "", #高速か低速か
            "type": "",
            "hood": "",
            "capacity": "",
            "distance": "",
            "vertical": "",
            "top": "",
            "bottom": "",
            "footrest": "",
            "towers": "",
            "signal": "",
            "oilShield": "",
            "note": "",
            "searchWord": ""
        })

    # データフレームを作成
    df_courses = pd.DataFrame(courses_list)
    df_lifts = pd.DataFrame(lifts_list)

    # スキー場ごとのExcelファイルを作成
    output_file = f"resorts/{resort_id}.xlsx"
    with pd.ExcelWriter(output_file) as writer:
        df_courses.to_excel(writer, sheet_name="Courses", index=False)
        df_lifts.to_excel(writer, sheet_name="Lifts", index=False)

    output_files.append(output_file)

# 完成したExcelファイルの一覧を出力
output_files
