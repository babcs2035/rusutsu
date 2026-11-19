import assert from "node:assert/strict";
import test from "node:test";
import { courseLengthMeters, summarizeCourseDistance } from "./courseDistance";

test("uses slope distance, falling back to horizontal before elevation is ready", () => {
  assert.equal(courseLengthMeters(1050, 1000), 1050);
  assert.equal(courseLengthMeters(null, 1000), 1000);
  assert.equal(courseLengthMeters(Number.NaN, 980), 980);
  assert.equal(courseLengthMeters(null, null), null);
});

test("sums total and skiable distance, counting fallback and missing lines", () => {
  const summary = summarizeCourseDistance(
    [
      { slopeDistance: 1000.4, horizontalDistance: 950, status: "○" },
      { slopeDistance: null, horizontalDistance: 500, status: "△" },
      { slopeDistance: 800, horizontalDistance: 760, status: "×" },
      { slopeDistance: 300, horizontalDistance: 290, status: null },
      { slopeDistance: null, horizontalDistance: null, status: "○" },
    ],
    true,
  );
  assert.deepEqual(summary, {
    total: 2600,
    open: 1500,
    fallbackLines: 1,
    missingLines: 1,
  });
});

test("leaves skiable distance unknown without a status source", () => {
  assert.equal(
    summarizeCourseDistance(
      [{ slopeDistance: 500, horizontalDistance: 480, status: "○" }],
      false,
    )?.open,
    null,
  );
});

test("returns null when no line has a length", () => {
  assert.equal(summarizeCourseDistance([], true), null);
  assert.equal(
    summarizeCourseDistance(
      [{ slopeDistance: null, horizontalDistance: null, status: "○" }],
      true,
    ),
    null,
  );
});
