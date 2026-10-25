import assert from "node:assert/strict";
import test from "node:test";
import { latestRatings, observedOnSchema, postDraftSchema } from "./contract";

test("reports do not need arbitrary fields, but ratings and map submissions are constrained", () => {
  assert.ok(
    postDraftSchema.safeParse({
      kind: "REPORT",
      observedOn: "2026-01-10",
      courseId: "a",
    }).success,
  );
  assert.ok(
    !postDraftSchema.safeParse({
      kind: "REPORT",
      observedOn: "2026-01-10",
      rating: 6,
    }).success,
  );
  assert.ok(
    !postDraftSchema.safeParse({
      kind: "REPORT",
      observedOn: "2026-01-10",
      latitude: 43,
      longitude: 140,
    }).success,
  );
  assert.ok(
    !postDraftSchema.safeParse({
      kind: "MOGUL",
      observedOn: "2026-01-10",
      present: true,
    }).success,
  );
  assert.ok(
    postDraftSchema.safeParse({
      kind: "MOGUL",
      observedOn: "2026-01-10",
      latitude: 43,
      longitude: 140,
      present: false,
    }).success,
  );
  assert.ok(
    !postDraftSchema.safeParse({
      kind: "ITEM",
      observedOn: "2026-01-10",
      latitude: 43,
      longitude: 140,
      present: true,
    }).success,
  );
  assert.ok(
    !postDraftSchema.safeParse({
      kind: "REPORT",
      observedOn: "2026-01-10",
      snowboard: "○",
    }).success,
  );
  assert.ok(!observedOnSchema.safeParse("2026-02-30").success);
});
test("ratings use latest rated report per author and target, not the latest unrated report", () => {
  const rows = [
    {
      id: "1",
      authorId: "a",
      courseId: "course",
      rating: 1,
      createdAt: "2026-01-01",
    },
    {
      id: "2",
      authorId: "a",
      courseId: "course",
      rating: 5,
      createdAt: "2026-01-02",
    },
    {
      id: "3",
      authorId: "a",
      courseId: "course",
      rating: null,
      createdAt: "2026-01-03",
    },
    {
      id: "4",
      authorId: "b",
      courseId: "course",
      rating: 3,
      createdAt: "2026-01-01",
    },
    {
      id: "5",
      authorId: "a",
      courseId: null,
      rating: 2,
      createdAt: "2026-01-01",
    },
  ];
  const summaries = latestRatings(rows);
  assert.deepEqual(
    summaries.find(summary => summary.courseId === "course"),
    { courseId: "course", average: 4, count: 2 },
  );
  assert.deepEqual(
    summaries.find(summary => summary.courseId === null),
    { courseId: null, average: 2, count: 1 },
  );
});
