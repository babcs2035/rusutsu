import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMappingGaps,
  compareWithMapping,
  extractCrawledNames,
  parseMappingExpectedNames,
} from "./mappingCoverage";

test("crawled names are de-duplicated and blank names dropped", () => {
  assert.deepEqual(
    extractCrawledNames([
      { name: "第1ペア" },
      { name: " 第1ペア " },
      { name: "  " },
      { name: 3 },
      "壊れた行",
      { name: "ゴンドラ" },
    ]),
    ["第1ペア", "ゴンドラ"],
  );
  assert.deepEqual(extractCrawledNames({ not: "array" }), []);
});

test("the mapping file yields the names the crawler should produce", () => {
  const expected = parseMappingExpectedNames(
    JSON.stringify({
      version: 1,
      courses: {
        sourceFile: "2026_0409_231030.json",
        updatedAt: "2026-08-31T13:46:41.040Z",
        rows: [
          { crawledName: "ダイナミック", geojsonName: "ダイナミック_#上部" },
          { crawledName: "ダイナミック", geojsonName: "ダイナミック_#下部" },
          { crawledName: null, geojsonName: "無名_1" },
          { crawledName: "パノラマ", geojsonName: "パノラマ" },
        ],
      },
      lifts: {
        sourceFile: "x",
        updatedAt: "y",
        rows: [{ crawledName: "第1ペア" }],
      },
    }),
  );
  // 1つの名前が複数のGeoJSONへ割り当てられていても、期待する名前は1つ。
  assert.deepEqual(expected?.COURSES, ["ダイナミック", "パノラマ"]);
  assert.deepEqual(expected?.LIFTS, ["第1ペア"]);
});

test("a missing, unparsable or empty mapping is treated as no mapping", () => {
  assert.equal(parseMappingExpectedNames(null), null);
  assert.equal(parseMappingExpectedNames("{"), null);
  assert.equal(parseMappingExpectedNames(JSON.stringify({ version: 1 })), null);
  assert.equal(
    parseMappingExpectedNames(
      JSON.stringify({ courses: { rows: [{ crawledName: null }] } }),
    ),
    null,
  );
});

test("names in the mapping but not crawled are reported as missing", () => {
  const gap = compareWithMapping(
    "LIFTS",
    ["第1ペア", "第2ペア", "ゴンドラ"],
    ["第1ペア", "新リフト"],
  );
  assert.deepEqual(gap, {
    kind: "LIFTS",
    expected: 3,
    crawled: 2,
    missing: ["第2ペア", "ゴンドラ"],
    unexpected: ["新リフト"],
  });
});

test("only kinds present in the mapping are compared", () => {
  const gaps = buildMappingGaps(
    { COURSES: ["A"], LIFTS: [] },
    { COURSES: [], LIFTS: ["第1ペア"] },
  );
  assert.deepEqual(
    gaps.map(gap => [gap.kind, gap.missing]),
    [["COURSES", ["A"]]],
  );
});
