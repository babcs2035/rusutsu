import assert from "node:assert/strict";
import { test } from "node:test";
import type { FinalizedCourseFeature } from "@/lib/finalizedResortGeojsonShared";
import {
  type CourseFeature,
  similarity,
  slopeDistanceProfile,
} from "./algorithm";
import { comparisonScoreRows, comparisonSourceGroup } from "./comparison";

test("評価基準の4項目の得点合計は推薦に使った類似度と一致する", () => {
  const profile = (segments: Array<{ slope: number; length: number }>) => {
    const distance = segments.reduce((sum, s) => sum + s.length, 0);
    return {
      distance,
      logDistance: Math.log(distance),
      maxSlope: Math.max(...segments.map(s => s.slope)),
      slopeDistances: slopeDistanceProfile(segments),
    } as CourseFeature;
  };
  const a = profile([
    { slope: 20, length: 400 },
    { slope: 10, length: 600 },
  ]);
  const b = profile([
    { slope: 25, length: 200 },
    { slope: 15, length: 1600 },
  ]);
  for (const metrics of [similarity(a, a), similarity(a, b)]) {
    const rows = comparisonScoreRows(metrics);
    assert.equal(
      rows.reduce((sum, row) => sum + row.weight * 100, 0),
      100,
    );
    assert.ok(
      Math.abs(rows.reduce((sum, row) => sum + row.points, 0) - metrics.score) <
        1e-10,
    );
    assert.deepEqual(
      rows.map(row => row.weight * 100),
      [20, 40, 20, 20],
    );
  }
});

test("複数ルートのコース比較は評価したメインルートだけを描き、連続区間はすべて残す", () => {
  const course = (id: string, routeKey?: string) =>
    ({
      id,
      groupId: "g",
      groupKind: routeKey ? "routes" : "continuous",
      routeKey,
    }) as FinalizedCourseFeature;
  const group = {
    id: "g",
    displayName: "コース",
    courses: [
      course("b", "g:route:2"),
      course("a", "g:route:1"),
      course("c", "g:route:1"),
    ],
  };
  assert.deepEqual(
    comparisonSourceGroup(group).courses.map(c => c.id),
    ["a", "c"],
  );
  const continuous = { ...group, courses: [course("a"), course("b")] };
  assert.deepEqual(comparisonSourceGroup(continuous), continuous);
});
