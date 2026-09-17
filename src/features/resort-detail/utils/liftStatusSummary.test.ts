import assert from "node:assert/strict";
import test from "node:test";
import type {
  FinalizedLiftFeature,
  FinalizedResortMapData,
} from "@/lib/finalizedResortGeojsonShared";
import { createLiftStatusSummary } from "./liftStatusSummary";
import { formatOperationDate, formatPublishedDate } from "./operationDates";

test("リフトは地図の各項目を数え、不明も分母に含める", () => {
  const section = {
    observedAt: "2026-01-01T00:00:00Z",
    sourceUrls: ["https://example.com/lifts"],
    features: ["○", "〇", "△", "×", null, "不明"].map(
      (status, index) =>
        ({
          id: String(index),
          name: "同名でも別のリフト",
          properties: { status, update: "2026/1/1 8:00 現在" },
        }) as FinalizedLiftFeature,
    ),
  } as NonNullable<FinalizedResortMapData["lifts"]>;
  assert.deepEqual(createLiftStatusSummary(section), {
    total: 6,
    open: 2,
    partial: 1,
    closed: 1,
    unknown: 2,
    observedAt: section.observedAt,
    sourceUrls: section.sourceUrls,
    updates: ["2026/1/1 8:00 現在"],
  });
  assert.equal(createLiftStatusSummary(null), null);
  assert.equal(createLiftStatusSummary({ ...section, features: [] })?.total, 0);
});
test("取得日時と発表日時を区別し、現在を二重に付けない", () => {
  assert.equal(formatOperationDate("2026-01-01T00:00:00Z"), "2026/1/1 09:00");
  assert.equal(
    formatPublishedDate("更新日時: 2026/1/1 8:00 現在"),
    "2026/1/1 8:00現在",
  );
  assert.equal(formatPublishedDate("2026/1/1 8:00:12"), "2026/1/1 8:00現在");
  assert.equal(formatPublishedDate(""), null);
});
