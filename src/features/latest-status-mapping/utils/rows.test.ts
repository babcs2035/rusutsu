import assert from "node:assert/strict";
import { test } from "node:test";
import type { LatestStatusMappingRow } from "../types";
import {
  assignGeojsonName,
  buildGeojsonOrderByCrawledItems,
  compactMappingRows,
  createSuggestedRows,
  listUnmappedCrawledNames,
  reconcileSavedRows,
} from "./rows";

test("コース名の既存規則から初期対応を提案する", () => {
  assert.deepEqual(
    createSuggestedRows(
      "courses",
      ["白樺ゲレンデ上部", "未登録コース"],
      ["白樺ゲレンデ_#上部", "地図だけ"],
    ),
    [
      {
        crawledName: "白樺ゲレンデ上部",
        geojsonName: "白樺ゲレンデ_#上部",
      },
      { crawledName: "未登録コース", geojsonName: "地図だけ" },
    ],
  );
});

test("左右に分かれた未対応行を空欄なしの1行へ詰める", () => {
  assert.deepEqual(
    compactMappingRows([
      { crawledName: null, geojsonName: "甲" },
      { crawledName: "A", geojsonName: null },
      { crawledName: null, geojsonName: "乙" },
      { crawledName: "B", geojsonName: null },
    ]),
    [
      { crawledName: "A", geojsonName: "甲" },
      { crawledName: "B", geojsonName: "乙" },
    ],
  );
});

test("無名コースと余ったクローラー項目は対応なしのまま分離する", () => {
  assert.deepEqual(createSuggestedRows("courses", ["公式コース"], ["無名_1"]), [
    { crawledName: null, geojsonName: "無名_1" },
    { crawledName: "公式コース", geojsonName: null },
  ]);
});

test("完全一致しない名前は共通部分が多い組み合わせから並べる", () => {
  assert.deepEqual(
    createSuggestedRows(
      "courses",
      ["ファミリーコース", "ダイナミックコース"],
      ["ファミリーゲレンデ", "ダイナミック_上部"],
    ),
    [
      {
        crawledName: "ダイナミックコース",
        geojsonName: "ダイナミック_上部",
      },
      {
        crawledName: "ファミリーコース",
        geojsonName: "ファミリーゲレンデ",
      },
    ],
  );
});

test("保存済みで無名と結ばれていても読み込み時に分離する", () => {
  assert.deepEqual(
    compactMappingRows([{ crawledName: "公式コース", geojsonName: "無名_2" }]),
    [
      { crawledName: null, geojsonName: "無名_2" },
      { crawledName: "公式コース", geojsonName: null },
    ],
  );
});

test("保存済みの並びを維持して新しい名前を末尾へ足す", () => {
  assert.deepEqual(
    reconcileSavedRows(
      [{ crawledName: "A", geojsonName: "甲" }],
      ["A", "B"],
      ["甲", "乙"],
    ),
    [
      { crawledName: "A", geojsonName: "甲" },
      { crawledName: "B", geojsonName: "乙" },
    ],
  );
});

test("対応済みコースをクローラー取得順に並べ、未対応は末尾に残す", () => {
  assert.deepEqual(
    buildGeojsonOrderByCrawledItems(
      ["クローラーB", "クローラーA"],
      [
        { crawledName: "クローラーA", geojsonName: "コース甲" },
        { crawledName: "クローラーB", geojsonName: "コース乙_上部" },
        { crawledName: "クローラーB", geojsonName: "コース乙_下部" },
        { crawledName: null, geojsonName: "未対応コース" },
      ],
      ["コース甲", "未対応コース", "コース乙_上部", "コース乙_下部"],
    ),
    ["コース乙_上部", "コース乙_下部", "コース甲", "未対応コース"],
  );
});

test("同じクローラーコースの線は本体、数値サフィックス順に並べる", () => {
  assert.deepEqual(
    buildGeojsonOrderByCrawledItems(
      ["クローラーA"],
      [
        { crawledName: "クローラーA", geojsonName: "コースA_10" },
        { crawledName: "クローラーA", geojsonName: "コースA_2" },
        { crawledName: "クローラーA", geojsonName: "コースA" },
        { crawledName: "クローラーA", geojsonName: "コースA_1" },
      ],
      ["コースA_10", "コースA_2", "コースA", "コースA_1"],
    ),
    ["コースA", "コースA_1", "コースA_2", "コースA_10"],
  );
});

test("assignGeojsonName は空いている行へ入れて、行の順番を保つ", () => {
  const rows = [
    { crawledName: "第1ゲレンデ", geojsonName: null },
    { crawledName: "第2ゲレンデ", geojsonName: null },
    { crawledName: null, geojsonName: "メロディ" },
  ];
  const next = assignGeojsonName(rows, "メロディ", "第2ゲレンデ");
  assert.deepEqual(next, [
    { crawledName: "第1ゲレンデ", geojsonName: null },
    { crawledName: "第2ゲレンデ", geojsonName: "メロディ" },
  ]);
});

test("assignGeojsonName で外したあと、別の名前へ付け替えられる", () => {
  let rows: LatestStatusMappingRow[] = [
    { crawledName: "第1ゲレンデ", geojsonName: "メロディ" },
    { crawledName: "第2ゲレンデ", geojsonName: null },
  ];
  rows = assignGeojsonName(rows, "メロディ", null);
  rows = assignGeojsonName(rows, "メロディ", "第2ゲレンデ");
  assert.deepEqual(
    rows.filter(row => row.geojsonName === "メロディ"),
    [{ crawledName: "第2ゲレンデ", geojsonName: "メロディ" }],
  );
});

test("assignGeojsonName は前の対応を外してから割り当てる", () => {
  const rows = [
    { crawledName: "第1ゲレンデ", geojsonName: "メロディ" },
    { crawledName: "第2ゲレンデ", geojsonName: null },
  ];
  const next = assignGeojsonName(rows, "メロディ", "第2ゲレンデ");
  assert.equal(
    next.filter(row => row.geojsonName === "メロディ").length,
    1,
    "同じ線が 2 行に入らない",
  );
  assert.equal(
    next.find(row => row.geojsonName === "メロディ")?.crawledName,
    "第2ゲレンデ",
  );
});

test("assignGeojsonName に null を渡すと対応を外す", () => {
  const rows = [{ crawledName: "第1ゲレンデ", geojsonName: "メロディ" }];
  const next = assignGeojsonName(rows, "メロディ", null);
  assert.equal(
    next.some(
      row =>
        row.crawledName === "第1ゲレンデ" && row.geojsonName === "メロディ",
    ),
    false,
  );
  assert.ok(next.some(row => row.geojsonName === "メロディ"));
  assert.ok(next.some(row => row.crawledName === "第1ゲレンデ"));
});

test("assignGeojsonName は既知でないクロール名でも行を足す", () => {
  const next = assignGeojsonName([], "メロディ", "新しい名前");
  assert.deepEqual(next, [
    { crawledName: "新しい名前", geojsonName: "メロディ" },
  ]);
});

test("listUnmappedCrawledNames は割り当て済みを除く", () => {
  const rows = [
    { crawledName: "第1ゲレンデ", geojsonName: "メロディ" },
    { crawledName: "第2ゲレンデ", geojsonName: null },
  ];
  assert.deepEqual(
    listUnmappedCrawledNames(
      ["第1ゲレンデ", "第2ゲレンデ", "第3ゲレンデ"],
      rows,
    ),
    ["第2ゲレンデ", "第3ゲレンデ"],
  );
});
