import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCourseFeature } from "@/lib/finalizedResortGeojson";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { getRasterTone } from "../maplibre/baseStyle";
import {
  createFinalizedLayers,
  EMPTY_STYLE_STATE,
  FINALIZED_LAYER,
  getFlowDashFrames,
  getFlowDashLevel,
  getLineColor,
  getLineOpacity,
} from "../maplibre/finalizedLayers";
import {
  COURSE_STATUS_OPTIONS,
  DEFAULT_MAP_DISPLAY_SETTINGS,
  getCourseDisplayStatuses,
  hasCourseOperatingData,
  isCourseStatusVisible,
  isOpenOnlyCourseSelection,
  OPEN_COURSE_STATUSES,
} from "./mapDisplaySettings";

test("営業中のみは○・△の両方だけを表示する条件で、×のみや不明を含む条件ではない", () => {
  for (let mask = 0; mask < 16; mask++) {
    const courseStatuses = Object.fromEntries(
      COURSE_STATUS_OPTIONS.map(({ value }, index) => [
        value,
        Boolean(mask & (1 << index)),
      ]),
    ) as typeof OPEN_COURSE_STATUSES;
    const settings = { ...DEFAULT_MAP_DISPLAY_SETTINGS, courseStatuses };
    assert.equal(isOpenOnlyCourseSelection(settings), mask === 3);
    assert.equal(
      isOpenOnlyCourseSelection({ ...settings, showCourses: false }),
      false,
    );
  }
});

test("比較の絞り込みは未取得のコースを残し、取得済みの不明は選択条件に従う", () => {
  const course = normalizeCourseFeature(
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [140, 43, 500],
          [140.01, 43.01, 400],
        ],
      },
      properties: { name: "テストコース", status: "不明" },
    },
    0,
  );
  assert.ok(course);
  const data: FinalizedResortMapData = {
    courses: {
      source: "slope_before",
      baseSource: "slope_before",
      fileName: "test.geojson",
      features: [course],
      sourceUrls: [],
    },
    lifts: null,
  };
  const settings = {
    ...DEFAULT_MAP_DISPLAY_SETTINGS,
    courseStatuses: OPEN_COURSE_STATUSES,
  };
  assert.equal(hasCourseOperatingData(null), false);
  assert.equal(hasCourseOperatingData(data), false);
  assert.equal(getCourseDisplayStatuses(data, settings).unknown, true);
  assert.ok(data.courses);
  data.courses.sourceUrls = ["https://example.com/courses"];
  assert.equal(hasCourseOperatingData(data), true);
  assert.equal(getCourseDisplayStatuses(data, settings).unknown, false);
  assert.equal(
    getCourseDisplayStatuses(data, {
      ...settings,
      courseStatuses: { ...OPEN_COURSE_STATUSES, unknown: true },
    }).unknown,
    true,
  );
  data.courseStatusSummary = {
    total: 1,
    open: 0,
    partial: 0,
    closed: 0,
    unknown: 1,
    observedAt: null,
    sourceUrls: [],
    updates: [],
  };
  assert.equal(hasCourseOperatingData(data), false);
});

test("通常時は全状態、営業中のみは初期○・△、不明は選択したときだけ表示する", () => {
  const visible = (statuses = DEFAULT_MAP_DISPLAY_SETTINGS.courseStatuses) =>
    COURSE_STATUS_OPTIONS.filter(option =>
      isCourseStatusVisible(option.value, statuses),
    ).map(option => option.value);
  assert.deepEqual(visible(), ["open", "limited", "closed", "unknown"]);
  assert.deepEqual(visible(OPEN_COURSE_STATUSES), ["open", "limited"]);
  assert.deepEqual(visible({ ...OPEN_COURSE_STATUSES, closed: true }), [
    "open",
    "limited",
    "closed",
  ]);
  assert.deepEqual(visible({ ...OPEN_COURSE_STATUSES, unknown: true }), [
    "open",
    "limited",
    "unknown",
  ]);
  assert.deepEqual(
    visible({
      open: false,
      limited: false,
      closed: false,
      unknown: false,
    }),
    [],
  );
  assert.deepEqual(
    visible({
      open: false,
      limited: false,
      closed: true,
      unknown: false,
    }),
    ["closed"],
  );
});

test("営業中のみでもリフトのレイヤーは変えず、縞は運行中とそれ以外で分ける", () => {
  const off = createFinalizedLayers(EMPTY_STYLE_STATE, 24).filter(layer =>
    layer.id.includes("lift"),
  );
  const on = createFinalizedLayers(
    { ...EMPTY_STYLE_STATE, showOpenOnly: true, showUngroomed: false },
    24,
  ).filter(layer => layer.id.includes("lift"));
  // 止める・流すはコマ送りで切り替えるので、レイヤー自体は同じまま
  assert.deepEqual(on, off);
  const flowFilters = off
    .filter(layer => layer.id.includes("lift-flow"))
    .map(layer => JSON.stringify("filter" in layer ? layer.filter : null));
  assert.equal(flowFilters.length, 6);
  assert.equal(
    flowFilters.filter(text => text.includes('["==",["get","status"],"open"]'))
      .length,
    3,
  );
  assert.equal(
    flowFilters.filter(text => text.includes('["!=",["get","status"],"open"]'))
      .length,
    3,
  );
  const masks = [true, false].map(showUngroomed =>
    createFinalizedLayers({ ...EMPTY_STYLE_STATE, showUngroomed }, 24).find(
      layer => layer.id === FINALIZED_LAYER.courseUngroomedMask,
    ),
  );
  assert.notDeepEqual(masks[0], masks[1]);
});

test("標準・航空写真とも、斜度表示や詳細画面でもカラー・白黒の指定を優先する", () => {
  for (const variant of ["pale", "photo"] as const) {
    const params = {
      variant,
      isDetailView: true,
      courseColorMode: "slope" as const,
      hasCourses: true,
    };
    assert.equal(getRasterTone({ ...params, monochrome: true }).saturation, -1);
    assert.ok(getRasterTone({ ...params, monochrome: false }).saturation > -1);
  }
});

test("通常の斜度モードはコース全状態で元の色と不透明度を使用する", () => {
  const state = { ...EMPTY_STYLE_STATE, courseColorMode: "slope" as const };
  assert.deepEqual(getLineColor(state, "course"), [
    "case",
    ["literal", false],
    "#64748B",
    ["get", "color"],
  ]);
  assert.deepEqual(getLineOpacity(state, "course"), [
    "case",
    ["literal", false],
    0.72,
    1,
  ]);
  assert.deepEqual(
    getLineColor({ ...state, showOpenOnly: true }, "course"),
    getLineColor(state, "course"),
  );
});

test("営業中のみでもコースの濃さは変えない", () => {
  assert.deepEqual(
    getLineOpacity({ ...EMPTY_STYLE_STATE, showOpenOnly: true }, "course"),
    getLineOpacity(EMPTY_STYLE_STATE, "course"),
  );
});

test("流れる縞の長さは整数ズームをまたぐ所でだけ変わり、拡大するほど長くなる", () => {
  // 拡大の途中で付け直すと縞が始点側へずれて見えるので、整数ズームの間は同じ段階
  for (const zoom of [12, 14, 15, 16]) {
    assert.equal(getFlowDashLevel(zoom), getFlowDashLevel(zoom + 0.99));
  }
  const periods = [13, 14, 15, 16, 17].map(zoom =>
    getFlowDashFrames(getFlowDashLevel(zoom))[0].reduce((a, b) => a + b, 0),
  );
  assert.equal(periods[0], periods[1]);
  for (let index = 2; index < periods.length; index++) {
    assert.ok(periods[index] > periods[index - 1]);
  }
  // どのコマも [塗り, 隙間, 塗り, 隙間] の 4 要素で、負の値や細い切れ端がない
  for (const level of [0, 1, 2, 3]) {
    for (const frame of getFlowDashFrames(level)) {
      assert.equal(frame.length, 4);
      assert.ok(frame.every(value => value === 0 || value >= 0.01));
    }
  }
});
