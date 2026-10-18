import assert from "node:assert/strict";
import test from "node:test";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
  FinalizedResortMapData,
} from "@/lib/finalizedResortGeojsonShared";
import {
  summarizeCoursesForList,
  summarizeMappedCourses,
  summarizeMappedLifts,
} from "./operatingCounts";

const course = (
  groupId: string,
  status: string | null,
  mapped = true,
): FinalizedCourseFeature =>
  ({
    groupId,
    name: groupId,
    displayName: groupId,
    coordinates: [
      [140, 43, 1000],
      [140.001, 43.001, 900],
    ],
    statusMappingNames: mapped ? [groupId] : [],
    properties: { status },
  }) as FinalizedCourseFeature;

const lift = (
  id: string,
  status: string | null,
  mapped = true,
): FinalizedLiftFeature =>
  ({
    id,
    statusMappingNames: mapped ? [id] : [],
    properties: { status },
  }) as FinalizedLiftFeature;

test("courses count open and partial once per group, excluding unmapped entries", () => {
  const counts = summarizeMappedCourses([
    course("A", "○"),
    course("A", "×"), // another section of the same course
    course("B", "○"),
    course("B", "×"), // another route of the same course
    course("C", "△"),
    course("D", "×"),
    course("unmapped", "○", false),
  ]);
  assert.deepEqual(counts, { active: 3, total: 4 });
});

test("one mapped course with an unavailable status makes the numerator unknown", () => {
  assert.deepEqual(
    summarizeMappedCourses([
      course("A", "○"),
      course("B", "×"),
      course("C", null),
    ]),
    { active: null, total: 3 },
  );
});

test("lifts are counted independently and ignore unmapped entries", () => {
  assert.deepEqual(
    summarizeMappedLifts([
      lift("same-name-1", "○"),
      lift("same-name-2", "△"),
      lift("closed", "×"),
      lift("missing", null),
      lift("unmapped", "○", false),
    ]),
    { active: null, total: 4 },
  );
});

test("no mapped courses or lifts returns no denominator", () => {
  assert.equal(summarizeMappedCourses([course("unmapped", "○", false)]), null);
  assert.equal(summarizeMappedLifts([lift("unmapped", "○", false)]), null);
});

const mapData = (
  courses: FinalizedCourseFeature[],
): FinalizedResortMapData => ({
  courses: {
    features: courses,
    source: "slope_10m",
    baseSource: "slope_before",
    fileName: "test.geojson",
    sourceUrls: [],
  },
  lifts: null,
  courseStatusSummary: null,
});

test("標高未取得のマップは基本情報のコース数で不明を表示する", () => {
  const pending = course("A", "○");
  pending.coordinates = [
    [140, 43],
    [140.001, 43.001],
  ];
  assert.deepEqual(summarizeCoursesForList(mapData([pending]), 9), {
    active: null,
    total: 9,
  });
  assert.deepEqual(summarizeCoursesForList(null, 9), {
    active: null,
    total: 9,
  });
  assert.equal(summarizeCoursesForList(mapData([pending]), 0), null);
});

test("営業情報がないマップは無名を除き、連続区間・別ルートを各1コースに数える", () => {
  const sections = [course("A", null, false), course("A", null, false)];
  sections.forEach((section, index) => {
    section.name = `A_${index + 1}`;
    section.groupKind = "continuous";
  });
  const routes = [course("B", null, false), course("B", null, false)];
  routes.forEach((route, index) => {
    route.name = `B_${index + 1}`;
    route.groupKind = "routes";
    route.routeKey = `B-route-${index + 1}`;
  });
  const similarlyNamed = course("C-separate", null, false);
  similarlyNamed.name = "C";
  assert.deepEqual(
    summarizeCoursesForList(
      mapData([
        ...sections,
        ...routes,
        course("C", null, false),
        similarlyNamed,
        course("無名_1", null, false),
        course("無名_連絡路", null, false),
        course("名前不明", null, false),
        course(" ", null, false),
      ]),
      99,
    ),
    { active: null, total: 4 },
  );
});

test("無名コースしかないマップは0/0や基本情報の総数に置き換えない", () => {
  assert.equal(
    summarizeCoursesForList(mapData([course("無名_1", null, false)]), 9),
    null,
  );
});

test("営業情報がある場合は欠測や対応なしを従来の対応表ルールで集計する", () => {
  const data = mapData([
    course("A", "○"),
    course("A", "×"),
    course("B", "○"),
    course("B", "×"),
    course("C", "○"),
    course("D", "△"),
    course("E", "○"),
    course("F", "○"),
    course("G", "×"),
    course("H", "×"),
    course("I", "×"),
    course("J", "○", false),
    course("K", "○", false),
  ]);
  data.courseStatusSummary = {
    total: 12,
    open: 7,
    partial: 1,
    closed: 4,
    unknown: 0,
    observedAt: null,
    sourceUrls: [],
    updates: [],
  };
  assert.deepEqual(summarizeCoursesForList(data, 99), { active: 6, total: 9 });
  const missing = data.courses?.features.find(item => item.groupId === "I");
  assert.ok(missing);
  missing.properties.status = null;
  assert.deepEqual(summarizeCoursesForList(data, 99), {
    active: null,
    total: 9,
  });
});
