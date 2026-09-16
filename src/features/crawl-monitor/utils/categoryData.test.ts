import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeStatus,
  parseCommentValue,
  parseOperationItems,
  parseWeatherPoints,
  summarizeOperationItems,
} from "./categoryData";

test("comment values are read from both the object and a bare string", () => {
  assert.equal(parseCommentValue({ value: "本日営業中" }), "本日営業中");
  assert.equal(parseCommentValue("本日営業中"), "本日営業中");
  assert.equal(parseCommentValue({ value: null }), null);
  assert.equal(parseCommentValue({ value: "   " }), null);
  assert.equal(parseCommentValue(null), null);
});

test("weather points keep numeric values and drop malformed entries", () => {
  const points = parseWeatherPoints({
    山頂: {
      update: "09:00",
      weather: "晴れ",
      temperature: -3,
      snowDepth: 120,
      snowfall: null,
      condition: "パウダー",
      windSpeed: "弱",
    },
    壊れた地点: "文字列",
  });
  assert.equal(points.length, 1);
  assert.deepEqual(points[0], {
    point: "山頂",
    update: "09:00",
    weather: "晴れ",
    temperature: "-3",
    snowDepth: "120",
    snowfall: null,
    condition: "パウダー",
    windSpeed: "弱",
  });
});

test("operation items require a name", () => {
  const items = parseOperationItems([
    { name: "第1ペア", status: "○", update: "09:00", note: null },
    { status: "×" },
    "壊れた行",
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.name, "第1ペア");
  assert.deepEqual(parseOperationItems({ not: "an array" }), []);
});

test("status marks with different code points are counted together", () => {
  for (const mark of ["○", "◯", "〇"]) {
    assert.equal(normalizeStatus(mark), "open");
  }
  assert.equal(normalizeStatus("△"), "hold");
  assert.equal(normalizeStatus("×"), "closed");
  assert.equal(normalizeStatus("✕"), "closed");
  assert.equal(normalizeStatus(null), "unknown");

  assert.deepEqual(
    summarizeOperationItems([
      { name: "a", status: "◯", update: null, note: null },
      { name: "b", status: "×", update: null, note: null },
      { name: "c", status: null, update: null, note: null },
    ]),
    { open: 1, hold: 0, closed: 1, unknown: 1 },
  );
});
