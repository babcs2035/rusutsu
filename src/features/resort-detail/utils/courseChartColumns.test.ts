import assert from "node:assert/strict";
import test from "node:test";
import type { FinalizedCourseFeature } from "@/lib/finalizedResortGeojsonShared";
import { buildLevelColumns, buildSlopeColumns } from "./courseChartColumns";

const course = (level: string, distance: number) =>
  ({
    id: level,
    name: level,
    coordinates: [
      [140, 43, 500],
      [140, 43.001, 450],
    ],
    properties: { level, slopeDistMap: distance, status: "○" },
  }) as unknown as FinalizedCourseFeature;

test("buildLevelColumns skips levels without courses and sums distance", () => {
  const columns = buildLevelColumns(
    [course("beginner", 300), course("beginner", 200)],
    null,
  );
  assert.equal(columns.length, 1);
  assert.equal(columns[0].distance, 500);
  assert.equal(columns[0].openDistance, 500);
});

test("buildSlopeColumns returns columns and omitted count", () => {
  const { columns, omitted } = buildSlopeColumns(
    [course("beginner", 300)],
    null,
  );
  assert.equal(omitted, 0);
  assert.ok(columns.length > 0);
  const total = columns.reduce((sum, column) => sum + column.distance, 0);
  assert.ok(Math.abs(total - 300) < 1);
});
