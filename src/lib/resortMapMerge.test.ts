import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addSectionMarker,
  adjustCourseName,
  canonicalBase,
  mergeCourseFeatures,
  mergeLiftFeatures,
  normalizeCrawledName,
  type RawGeoFeature,
  removeSuffixIndexIfMultiPart,
} from "./resortMapMerge";

const line = (
  name: string,
  properties: Record<string, unknown> = {},
): RawGeoFeature => ({
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: [
      [140, 40, 1000],
      [140.01, 40.01, 900],
    ],
  },
  properties: { name, ...properties },
});

test("fixed IDs keep same-name attributes and explicit unmapped status separate", () => {
  const result = mergeCourseFeatures({
    geometryFeatures: [
      line("X", { entityId: "a" }),
      line("X", { entityId: "b" }),
      line("", { entityId: "c" }),
    ],
    baseItems: [
      { entityId: "b", name: "X", level: "初級" },
      { entityId: "a", name: "X", level: "上級" },
    ],
    statusItems: [{ name: "上", status: "○" }],
    statusMapping: {
      configured: true,
      sourceFile: "test",
      byGeojsonName: new Map(),
      byGeometryId: new Map([
        ["a", "上"],
        ["b", null],
        ["c", "上"],
      ]),
    },
    baseSourceLabel: "before",
    hasStatusSource: true,
    validateBaseFields: false,
  });
  assert.equal(result.features[0].properties.level, "上級");
  assert.equal(result.features[1].properties.level, "初級");
  assert.equal(result.features[0].properties.status, "○");
  assert.notEqual(result.features[1].properties.status, "○");
  assert.equal(result.features[2].properties.status, "○");
});

test("クロール名は GeoJSON 側の区切りに寄せる", () => {
  assert.equal(normalizeCrawledName("白樺ゲレンデ上部"), "白樺ゲレンデ_#上部");
  assert.equal(normalizeCrawledName("白樺ゲレンデ 上部"), "白樺ゲレンデ_#上部");
  assert.equal(
    normalizeCrawledName("白樺ゲレンデ　上部"),
    "白樺ゲレンデ_#上部",
  );
  assert.equal(normalizeCrawledName("HAPPO PARK"), "HAPPO PARK");
  // すでに区切りがある名前は触らない
  assert.equal(normalizeCrawledName("白樺ゲレンデ_上部"), "白樺ゲレンデ_上部");
});

test("名前の整形は Python 版と同じ結果になる", () => {
  assert.equal(adjustCourseName("無名_1"), "無名");
  assert.equal(adjustCourseName("無名_連絡"), "連絡");
  assert.equal(
    adjustCourseName("白樺ゲレンデ南_#上部"),
    "白樺ゲレンデ南_#上部",
  );
  assert.equal(adjustCourseName("ウスバ_下部"), "ウスバ下部");
  assert.equal(
    adjustCourseName("スカイライン_尾根筋コース"),
    "スカイライン (尾根筋コース)",
  );
  assert.equal(adjustCourseName("スカイライン_2"), "スカイライン_2");
  assert.equal(adjustCourseName("スカイライン_#上部_2"), "スカイライン_2");
});

test("補助関数", () => {
  assert.equal(addSectionMarker("白樺_上部"), "白樺_#上部");
  assert.equal(addSectionMarker("白樺_#上部"), "白樺_#上部");
  assert.equal(canonicalBase("スカイライン_尾根筋コース"), "スカイライン");
  assert.equal(removeSuffixIndexIfMultiPart("A_#上部_2"), "A_#上部");
  assert.equal(removeSuffixIndexIfMultiPart("A_2"), "A_2");
});

test("コースは基本情報と当日の状況を重ねる", () => {
  const result = mergeCourseFeatures({
    geometryFeatures: [line("白樺ゲレンデ_#上部", { avg_slope_deg_map: "12" })],
    baseItems: [
      {
        name: "白樺ゲレンデ",
        level: "中級",
        piste: "○",
        snowboard: "○",
        searchWord: "テスト　白樺ゲレンデ",
      },
    ],
    statusItems: [{ name: "白樺ゲレンデ上部", status: "○", note: "圧雪" }],
    baseSourceLabel: "slope_detail",
    hasStatusSource: true,
    validateBaseFields: true,
  });

  const properties = result.features[0]?.properties;
  assert.equal(properties?.name, "白樺ゲレンデ_#上部");
  assert.equal(properties?.level, "中級");
  assert.equal(properties?.status, "○");
  // 基本情報の note と混ざらないよう latest_note に移す
  assert.equal(properties?.latest_note, "圧雪");
  assert.deepEqual(result.issues, []);
});

test("コースは管理画面の明示対応を自動対応より優先する", () => {
  const result = mergeCourseFeatures({
    geometryFeatures: [line("白樺ゲレンデ_#上部")],
    baseItems: [],
    statusItems: [
      { name: "白樺ゲレンデ上部", status: "○" },
      { name: "公式表記の別名", status: "×", note: "明示対応" },
    ],
    statusMapping: {
      configured: true,
      sourceFile: "2026_0101_000000.json",
      byGeojsonName: new Map([["白樺ゲレンデ_#上部", "公式表記の別名"]]),
    },
    baseSourceLabel: "slope_before",
    hasStatusSource: true,
    validateBaseFields: false,
  });

  assert.equal(result.features[0]?.properties.status, "×");
  assert.equal(result.features[0]?.properties.latest_note, "明示対応");
  assert.deepEqual(result.issues, []);
});

test("明示的に対応なしにしたコースへ営業情報を自動結合しない", () => {
  const result = mergeCourseFeatures({
    geometryFeatures: [line("白樺ゲレンデ_#上部")],
    baseItems: [],
    statusItems: [{ name: "白樺ゲレンデ上部", status: "○" }],
    statusMapping: {
      configured: true,
      sourceFile: "2026_0101_000000.json",
      byGeojsonName: new Map([["白樺ゲレンデ_#上部", null]]),
    },
    baseSourceLabel: "slope_before",
    hasStatusSource: true,
    validateBaseFields: false,
  });

  assert.equal(result.features[0]?.properties.status, undefined);
  assert.deepEqual(result.issues, []);
});

test("コースは足りない情報を Python と同じ文言で報告する", () => {
  const result = mergeCourseFeatures({
    geometryFeatures: [line("ダウンヒル")],
    baseItems: [{ name: "別のコース", piste: "", snowboard: "◎" }],
    statusItems: [{ name: "どこか", status: "○" }],
    baseSourceLabel: "slope_detail",
    hasStatusSource: true,
    validateBaseFields: true,
  });

  assert.deepEqual(
    result.issues.map(issue => issue.message),
    [
      "⚠️ slope_detail not found: ダウンヒル",
      "⚠️ Crawled data not found: ダウンヒル",
    ],
  );
});

test("整備前のスキー場では欠損を数え上げない", () => {
  const result = mergeCourseFeatures({
    geometryFeatures: [line("ダウンヒル"), line("")],
    baseItems: [],
    statusItems: [],
    baseSourceLabel: "slope_before",
    hasStatusSource: false,
    validateBaseFields: false,
  });

  assert.deepEqual(result.issues, []);
  // 名前が無い線も落とさない
  assert.equal(result.features.length, 2);
});

test("リフトは公表値と地図の測定値のずれを報告する", () => {
  const result = mergeLiftFeatures({
    geometryFeatures: [
      line("第1ペア", { slope_dist_map: "1200", elevation_diff_map: "300" }),
    ],
    baseItems: [
      {
        name: "第1ペア",
        distance: 1000,
        vertical: 300,
        hood: "×",
        footrest: "○",
        oilShield: "×",
        speed: "低速",
        type: "ペアリフト",
        capacity: 2,
        searchWord: "テスト　第1ペア",
      },
    ],
    statusItems: [{ name: "第1ペア", status: "×" }],
    baseSourceLabel: "lift_detail",
    hasStatusSource: true,
    validateBaseFields: true,
  });

  assert.deepEqual(
    result.issues.map(issue => issue.message),
    ["⚠️ Distance mismatch for '第1ペア': official: 1000.0, map: 1200.0"],
  );
  assert.equal(result.features[0]?.properties.status, "×");
});

test("リフトは別名の明示対応を使う", () => {
  const result = mergeLiftFeatures({
    geometryFeatures: [line("第1ペアリフト")],
    baseItems: [],
    statusItems: [{ name: "第1ペア", status: "○" }],
    statusMapping: {
      configured: true,
      sourceFile: "2026_0101_000000.json",
      byGeojsonName: new Map([["第1ペアリフト", "第1ペア"]]),
    },
    baseSourceLabel: "lift_before",
    hasStatusSource: true,
    validateBaseFields: false,
  });

  assert.equal(result.features[0]?.properties.status, "○");
  assert.deepEqual(result.issues, []);
});

test("公式の一括名に対応したA線・B線は旧データの各線の状態を使う", () => {
  const result = mergeLiftFeatures({
    geometryFeatures: [
      line("第1トリプルA線", { entityId: "a" }),
      line("第1トリプルB線", { entityId: "b" }),
    ],
    baseItems: [],
    statusItems: [
      { name: "第1トリプルパラレルA線", status: "○", note: "A線の情報" },
      { name: "第1トリプルパラレルB線", status: "×", note: "B線の情報" },
    ],
    statusMapping: {
      configured: true,
      sourceFile: "wayback.json",
      byGeojsonName: new Map(),
      byGeometryId: new Map([
        ["a", "第1トリプルパラレル"],
        ["b", "第1トリプルパラレル"],
      ]),
    },
    baseSourceLabel: "lift_before",
    hasStatusSource: true,
    validateBaseFields: false,
  });
  assert.deepEqual(
    result.features.map(feature => feature.properties.status),
    ["○", "×"],
  );
  assert.deepEqual(result.issues, []);
});

for (const scenario of [
  {
    label: "公式の地図記号が追加されても保存済み対応を使う",
    geometry: "第1トリプルA線",
    mapped: "第1トリプルパラレル",
    items: [{ name: "M 第1トリプルパラレル", status: "○" }],
    expected: "○",
  },
  {
    label: "同名に異なる地図記号がある場合は推測しない",
    geometry: "第1トリプルA線",
    mapped: "第1トリプルパラレル",
    items: [
      { name: "M 第1トリプルパラレル", status: "○" },
      { name: "N 第1トリプルパラレル", status: "×" },
    ],
    expected: undefined,
  },
  {
    label: "旧対応のA線から現在の公式一括名を参照できる",
    geometry: "第1トリプルA線",
    mapped: "第1トリプルパラレルA線",
    items: [{ name: "第1トリプルパラレル", status: "○" }],
    expected: "○",
  },
  {
    label: "全角英数字と空白の違いを吸収する",
    geometry: "第１トリプル Ａ線",
    mapped: "第１トリプルパラレル",
    items: [{ name: "第1トリプルパラレルA線", status: "○" }],
    expected: "○",
  },
  {
    label: "一致した公式一括名を優先する",
    geometry: "第1トリプルA線",
    mapped: "第1トリプルパラレル",
    items: [
      { name: "第1トリプルパラレル", status: "×" },
      { name: "第1トリプルパラレルA線", status: "○" },
    ],
    expected: "×",
  },
  {
    label: "公式一括名の不明を旧A線の運行で埋めない",
    geometry: "第1トリプルA線",
    mapped: "第1トリプルパラレル",
    items: [
      { name: "第1トリプルパラレル", status: null },
      { name: "第1トリプルパラレルA線", status: "○" },
    ],
    expected: null,
  },
  {
    label: "線の指定なしではA線を推測しない",
    geometry: "第1トリプル",
    mapped: "第1トリプルパラレル",
    items: [{ name: "第1トリプルパラレルA線", status: "○" }],
    expected: undefined,
  },
  {
    label: "A線が欠けてもB線の状態を使わない",
    geometry: "第1トリプルA線",
    mapped: "第1トリプルパラレル",
    items: [{ name: "第1トリプルパラレルB線", status: "○" }],
    expected: undefined,
  },
  {
    label: "正規化後に複数の候補が残るときは推測しない",
    geometry: "第1トリプルA線",
    mapped: "第1トリプルパラレル",
    items: [
      { name: "第1トリプルパラレルA線", status: "○" },
      { name: "第１トリプルパラレルＡ線", status: "×" },
    ],
    expected: undefined,
  },
  {
    label: "明示的な未対応を自動で対応付けない",
    geometry: "第1トリプルA線",
    mapped: null,
    items: [{ name: "第1トリプルA線", status: "○" }],
    expected: undefined,
  },
]) {
  test(scenario.label, () => {
    const result = mergeLiftFeatures({
      geometryFeatures: [line(scenario.geometry)],
      baseItems: [],
      statusItems: scenario.items,
      statusMapping: {
        configured: true,
        sourceFile: "saved.json",
        byGeojsonName: new Map([[scenario.geometry, scenario.mapped]]),
      },
      baseSourceLabel: "lift_before",
      hasStatusSource: true,
      validateBaseFields: false,
    });
    assert.equal(result.features[0]?.properties.status, scenario.expected);
    assert.equal(
      result.issues.length,
      scenario.expected === undefined && scenario.mapped !== null ? 1 : 0,
    );
  });
}

for (const [label, merge] of [
  ["コース", mergeCourseFeatures],
  ["リフト", mergeLiftFeatures],
] as const) {
  test(`${label}の保存済み別名から現在の取得名を選び、複数一致は不明にする`, () => {
    const options = {
      geometryFeatures: [line("地図", { entityId: "id" })],
      baseItems: [],
      statusMapping: {
        configured: true,
        sourceFile: "old",
        byGeojsonName: new Map<string, string | null>(),
        byGeometryId: new Map([["id", "旧名"]]),
        namesByGeometryId: new Map([["id", ["旧名", "新名"]]]),
      },
      baseSourceLabel: "before",
      hasStatusSource: true,
      validateBaseFields: false,
    };
    const matched = merge({
      ...options,
      statusItems: [{ name: "新名", status: "×" }],
    });
    assert.equal(matched.features[0].properties.status, "×");
    assert.deepEqual(matched.issues, []);
    const ambiguous = merge({
      ...options,
      statusItems: [
        { name: "旧名", status: "○" },
        { name: "新名", status: "×" },
      ],
    });
    assert.equal(ambiguous.features[0].properties.status, undefined);
    assert(
      ambiguous.issues.some(issue => issue.message.includes("Multiple mapped")),
    );
  });
}
