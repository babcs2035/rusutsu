import assert from "node:assert/strict";
import { test } from "node:test";
import type { EditorCourse, LngLat } from "../types";
import {
  createEmptyCourse,
  mergeCourses,
  splitCourseAtVertex,
  suggestMergedName,
} from "./courseOps";

const course = (
  id: string,
  name: string,
  coordinates: LngLat[],
  patch: Partial<EditorCourse> = {},
): EditorCourse => ({
  ...createEmptyCourse(),
  id,
  skiId: "test-resort",
  originalSkiId: "test-resort",
  name,
  coordinates,
  ...patch,
});

const upper = course("a", "上の道", [
  [140.0, 43.0],
  [140.001, 43.0],
  [140.002, 43.0],
]);
const lower = course("b", "下の道", [
  [140.002, 43.0],
  [140.003, 43.0],
  [140.004, 43.0],
]);

test("mergeCourses joins two courses end to end and drops the second", () => {
  const result = mergeCourses(
    [upper, lower],
    { courseId: "a", position: { segmentIndex: 1, t: 1 }, keep: "start" },
    { courseId: "b", position: { segmentIndex: 0, t: 0 }, keep: "end" },
    { name: "つないだ道", detailFrom: "first" },
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a");
  assert.equal(result[0].name, "つないだ道");
  assert.deepEqual(result[0].coordinates, [
    [140.0, 43.0],
    [140.001, 43.0],
    [140.002, 43.0],
    [140.003, 43.0],
    [140.004, 43.0],
  ]);
});

test("mergeCourses joins the middle of one course to the middle of another", () => {
  const crossing = course("c", "交差する道", [
    [140.0015, 43.002],
    [140.0015, 43.0],
    [140.0015, 42.998],
  ]);
  const result = mergeCourses(
    [upper, crossing],
    // 上の道の 1 本目の区間の途中まで残す
    { courseId: "a", position: { segmentIndex: 0, t: 0.5 }, keep: "start" },
    // 交差する道は、そこから南側だけ残す
    { courseId: "c", position: { segmentIndex: 1, t: 0 }, keep: "end" },
    { name: "つないだ道", detailFrom: "first" },
  );
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].coordinates, [
    [140.0, 43.0],
    [140.0005, 43.0],
    [140.0015, 43.0],
    [140.0015, 42.998],
  ]);
});

test("mergeCourses can take the detail of the second course", () => {
  const withDetail = course("b", "下の道", lower.coordinates, {
    detail: { ...lower.detail, level: "上級", distance: "800" },
  });
  const result = mergeCourses(
    [upper, withDetail],
    { courseId: "a", position: { segmentIndex: 1, t: 1 }, keep: "start" },
    { courseId: "b", position: { segmentIndex: 0, t: 0 }, keep: "end" },
    { name: "つないだ道", detailFrom: "second" },
  );
  assert.equal(result[0].detail.level, "上級");
  assert.equal(result[0].detail.distance, "800");
});

test("mergeCourses refuses to merge a course with itself", () => {
  const courses = [upper, lower];
  const result = mergeCourses(
    courses,
    { courseId: "a", position: { segmentIndex: 0, t: 0 }, keep: "start" },
    { courseId: "a", position: { segmentIndex: 1, t: 1 }, keep: "end" },
    { name: "x", detailFrom: "first" },
  );
  assert.equal(result, courses);
});

test("mergeCourses releases a split group that drops to a single member", () => {
  const split = splitCourseAtVertex([upper], "a", 1, "テスト");
  assert.equal(split.length, 2);
  assert.ok(split[0].splitGroupId);

  // 分割した片方を、無関係なコースへ結合する
  const merged = mergeCourses(
    [...split, lower],
    {
      courseId: split[1].id,
      position: { segmentIndex: 0, t: 1 },
      keep: "start",
    },
    { courseId: "b", position: { segmentIndex: 0, t: 0 }, keep: "end" },
    { name: "つないだ道", detailFrom: "first" },
  );
  assert.equal(merged.length, 2);
  // 残った 1 本だけの分割グループは解除される
  assert.equal(merged[0].splitGroupId, null);
  assert.equal(merged[1].splitGroupId, null);
});

test("suggestMergedName strips the split suffix", () => {
  assert.equal(
    suggestMergedName(course("a", "メロディ_#上部", []), course("b", "x", [])),
    "メロディ",
  );
  assert.equal(
    suggestMergedName(course("a", "", []), course("b", "ジジ", [])),
    "ジジ",
  );
});
