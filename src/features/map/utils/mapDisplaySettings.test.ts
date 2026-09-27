import assert from "node:assert/strict";
import { test } from "node:test";
import { getRasterTone } from "../maplibre/baseStyle";
import {
  createFinalizedLayers,
  EMPTY_STYLE_STATE,
  FINALIZED_LAYER,
  getLineColor,
  getLineOpacity,
} from "../maplibre/finalizedLayers";
import {
  COURSE_STATUS_OPTIONS,
  DEFAULT_MAP_DISPLAY_SETTINGS,
  isCourseStatusVisible,
  OPEN_COURSE_STATUSES,
} from "./mapDisplaySettings";

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

test("営業中のみ・非圧雪表示の設定でリフトの全レイヤーを変えない", () => {
  const off = createFinalizedLayers(EMPTY_STYLE_STATE, 24).filter(layer =>
    layer.id.includes("lift"),
  );
  const on = createFinalizedLayers(
    { ...EMPTY_STYLE_STATE, showOpenOnly: true, showUngroomed: false },
    24,
  ).filter(layer => layer.id.includes("lift"));
  assert.deepEqual(on, off);
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
    "#94A3B8",
    ["get", "color"],
  ]);
  assert.deepEqual(getLineOpacity(state, "course"), [
    "case",
    ["literal", false],
    0.4,
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
