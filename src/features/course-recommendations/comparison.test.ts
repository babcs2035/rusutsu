import assert from "node:assert/strict";
import { test } from "node:test";
import type { FinalizedCourseFeature } from "@/lib/finalizedResortGeojsonShared";
import { type CourseFeature, similarity } from "./algorithm";
import { comparisonScoreRows, comparisonSourceGroup } from "./comparison";

test("評価基準の4項目の得点合計は推薦に使った類似度と一致する", () => {
  const a = {
    histogram: Array(16).fill(0),
    logDistance: Math.log(1000),
    steepSlope: 20,
    steepDistance: 400,
  } as CourseFeature;
  a.histogram[3] = 1;
  const b = {
    ...a,
    histogram: [...a.histogram],
    logDistance: Math.log(1800),
    steepSlope: 25,
    steepDistance: 200,
  };
  b.histogram[3] = 0;
  b.histogram[5] = 1;
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
      [50, 25, 15, 10],
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
