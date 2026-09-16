import assert from "node:assert/strict";
import test from "node:test";
import type { FinalizedCourseFeature } from "@/lib/finalizedResortGeojsonShared";
import { slopeDistribution, sumKnown } from "./courseDistribution";
import {
  conditionsFromCapture,
  conditionText,
  sourceUrls,
} from "./currentConditions";
import { getCourseGroupStatus } from "./detailMetrics";

const feature = (
  coordinates: FinalizedCourseFeature["coordinates"],
  status: string | null = null,
) => ({ coordinates, properties: { status } }) as FinalizedCourseFeature;
test("斜度分布は距離加重し、欠損区間を除く", () => {
  const result = slopeDistribution([
    feature([
      [0, 0, 0],
      [0.001, 0, 0],
      [0.002, 0, 111.195],
      [0.003, 0],
    ]),
  ]);
  assert.equal(result.omitted, 1);
  assert.ok(result.bins[0].percent > 41 && result.bins[0].percent < 42);
  assert.ok(
    Math.abs(result.bins.reduce((sum, bin) => sum + bin.percent, 0) - 100) <
      1e-8,
  );
  assert.ok(result.total > 268 && result.total < 269);
});
test("5°境界・垂直区間と欠損値を安全に扱う", () => {
  const result = slopeDistribution([
    feature([
      [0, 0, 0],
      [0, 0, 10],
    ]),
  ]);
  assert.equal(result.bins[17].percent, 100);
  assert.equal(
    slopeDistribution([
      feature([
        [0, 0],
        [0.001, 0],
      ]),
    ]).total,
    0,
  );
  assert.deepEqual(sumKnown([null, undefined, Number.NaN]), {
    total: null,
    missing: 3,
  });
  assert.deepEqual(sumKnown([0, 100, null]), { total: 100, missing: 1 });
});
test("クローラーのゼロを保ち、URLはHTTP(S)のみ", () => {
  assert.equal(conditionText(0), "0");
  assert.equal(conditionText("**"), null);
  assert.equal(conditionText("終了<br>また来季"), "終了\nまた来季");
  assert.deepEqual(
    sourceUrls([
      "https://example.com/weather",
      "javascript:alert(1)",
      "",
      "https://example.com/weather",
    ]),
    ["https://example.com/weather"],
  );
});
test("営業状況の欠損を全面滑走可能と誤表示しない", () => {
  const group = {
    id: "a",
    displayName: "a",
    courses: [feature([], "○"), feature([], null)],
  };
  assert.equal(getCourseGroupStatus(group).symbol, null);
  assert.equal(
    getCourseGroupStatus({ ...group, courses: [feature([], "×")] }).symbol,
    "×",
  );
});

test("気象はweatherUrl、コメントはcommentUrlと取得日時を保持する", () => {
  const conditions = conditionsFromCapture({
    time: "2026/9/17 10:00:00",
    weatherUrl: ["https://example.com/weather"],
    commentUrl: ["https://example.com/news"],
    weather: { 山麓: { temperature: 0, snowDepth: 0 } },
    comment: "お知らせ",
  });
  assert.deepEqual(conditions.weather?.sourceUrls, [
    "https://example.com/weather",
  ]);
  assert.deepEqual(conditions.comment?.sourceUrls, [
    "https://example.com/news",
  ]);
  assert.equal(conditions.weather?.time, "2026/9/17 10:00:00");
  assert.equal(conditions.comment?.time, "2026/9/17 10:00:00");
});
