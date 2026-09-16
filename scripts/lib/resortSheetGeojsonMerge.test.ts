import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  type GeoJsonFeatureCollection,
  isLinkableSheetRow,
  mergeSheetRowsIntoBefore,
  syncBeforePropertiesToMeasured,
} from "./resortSheetGeojsonMerge";
import type { SheetRow } from "./xlsxReader";
import { readXlsxSheets } from "./xlsxReader";

const collection = (
  properties: Record<string, unknown>,
): GeoJsonFeatureCollection => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties,
      geometry: {
        type: "LineString",
        coordinates: [
          [139, 36],
          [139.01, 36.01],
        ],
      },
    },
  ],
});

test("rows require a name and at least one detail field", () => {
  assert.equal(
    isLinkableSheetRow({ name: "リフト", capacity: "4", searchWord: "" }),
    true,
  );
  assert.equal(isLinkableSheetRow({ name: "リフト", resort: "test" }), false);
  assert.equal(
    isLinkableSheetRow({ name: "コース", piste: "○", searchWord: "" }),
    true,
  );
  assert.equal(
    isLinkableSheetRow({ name: "リフト", piste: "", searchWord: "検索" }),
    true,
  );
  assert.equal(
    isLinkableSheetRow({ name: "除外", piste: " ", searchWord: "" }),
    false,
  );
  assert.equal(
    isLinkableSheetRow({ name: "", piste: "○", searchWord: "検索" }),
    false,
  );
});

test("Nozawa workbook links every identically named lift without search words", () => {
  const rows =
    readXlsxSheets(
      readFileSync("src/private/data/resorts/nozawa-onsen.xlsx"),
    ).get("Lifts") ?? [];
  assert.equal(rows.length, 15);
  const before = JSON.parse(
    readFileSync(
      "src/private/data/resorts-temporary/lift_before/nozawa-onsen.geojson",
      "utf8",
    ),
  ) as GeoJsonFeatureCollection;
  const geometry = {
    ...before,
    features: before.features.map(feature => ({
      ...feature,
      properties: { name: feature.properties?.name },
    })),
  };
  const result = mergeSheetRowsIntoBefore(geometry, rows, "lift");
  assert.equal(result.eligibleRows, 15);
  assert.equal(result.matchedRows, 12);
  const gondola = result.collection.features.find(
    feature => feature.properties?.name === "長坂ゴンドラ",
  );
  assert.equal(gondola?.properties?.capacity, 10);
  assert.equal(gondola?.properties?.distance, 3129);
  assert.equal(gondola?.properties?.maker, "日本ケーブル");
  assert.equal(
    mergeSheetRowsIntoBefore(result.collection, rows, "lift").changedFeatures,
    0,
  );
});

test("duplicate sheet names are left unmatched instead of choosing the last row", () => {
  const result = mergeSheetRowsIntoBefore(
    collection({ name: "ペア" }),
    [
      { name: "ペア", capacity: "2" },
      { name: "ペア", capacity: "4" },
    ],
    "lift",
  );
  assert.equal(result.changedFeatures, 0);
  assert.deepEqual(result.unmatchedRowNames, ["ペア"]);
});

test("Excel fills empty before fields without replacing curated values", () => {
  const rows: SheetRow[] = [
    {
      resort: "test-resort",
      name: "白樺コース",
      level: "初級",
      distance: "1200.0",
      piste: "○",
      searchWord: "テスト 白樺",
    },
  ];
  const result = mergeSheetRowsIntoBefore(
    collection({ name: "白樺", level: "中級", searchWord: "" }),
    rows,
    "course",
  );

  assert.equal(result.matchedRows, 1);
  assert.equal(result.changedFeatures, 1);
  assert.deepEqual(result.collection.features[0]?.properties, {
    name: "白樺",
    level: "中級",
    searchWord: "テスト 白樺",
    resort: "test-resort",
    distance: 1200,
    piste: "○",
  });
});

test("course details are merged even without piste and searchWord", () => {
  const result = mergeSheetRowsIntoBefore(
    collection({ name: "連絡コース" }),
    [
      {
        name: "連絡コース",
        level: "初級",
        piste: "",
        searchWord: "",
      },
    ],
    "course",
  );

  assert.equal(result.eligibleRows, 1);
  assert.equal(result.skippedRows, 0);
  assert.equal(result.changedFeatures, 1);
  assert.deepEqual(result.collection.features[0]?.properties, {
    name: "連絡コース",
    level: "初級",
  });
});

test("before properties reach measured data while measurements stay intact", () => {
  const before = collection({
    name: "メロディ",
    level: "初級",
    distance: 350,
    searchWord: "GALA メロディ",
  });
  const measured = collection({
    name: "メロディ",
    level: "旧値",
    horizontal_dist_map: 315,
    slope_dist_map: 320,
    midstation: [139, 36, 800],
  });
  const result = syncBeforePropertiesToMeasured(measured, before, "course");

  assert.equal(result.matchedFeatures, 1);
  assert.equal(result.changedFeatures, 1);
  assert.deepEqual(result.collection.features[0]?.properties, {
    name: "メロディ",
    level: "初級",
    horizontal_dist_map: 315,
    slope_dist_map: 320,
    midstation: [139, 36, 800],
    distance: 350,
    searchWord: "GALA メロディ",
  });
});

test("measured data accepts unique full-width and resort-prefix name variants", () => {
  const before: GeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features: [
      collection({ name: "余市第1エクスプレス", searchWord: "キロロ 余市" })
        .features[0],
      collection({ name: "ルスツ イゾラ第5ペア", capacity: 2 }).features[0],
    ].filter(feature => feature !== undefined),
  };
  const measured: GeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features: [
      collection({ name: "余市第１エクスプレス", horizontal_dist_map: 1700 })
        .features[0],
      collection({ name: "イゾラ第5ペア", horizontal_dist_map: 480 })
        .features[0],
    ].filter(feature => feature !== undefined),
  };

  const result = syncBeforePropertiesToMeasured(measured, before, "lift");

  assert.equal(result.matchedFeatures, 2);
  assert.deepEqual(result.unmatchedFeatureNames, []);
  assert.equal(
    result.collection.features[0]?.properties?.searchWord,
    "キロロ 余市",
  );
  assert.equal(result.collection.features[1]?.properties?.capacity, 2);
});
