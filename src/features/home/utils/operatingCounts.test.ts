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
    sourceUrls: ["https://example.com/courses"],
  },
  lifts: null,
  courseStatusSummary: null,
});

test("標高未取得でもマップのコースがあればgroupIdで数える", () => {
  const pending = course("A", "○");
  pending.coordinates = [
    [140, 43],
    [140.001, 43.001],
  ];
  assert.deepEqual(summarizeCoursesForList(mapData([pending]), 9), {
    active: null,
    total: 1,
  });
  assert.deepEqual(summarizeCoursesForList(null, 9), {
    active: null,
    total: 9,
  });
  assert.deepEqual(summarizeCoursesForList(mapData([pending]), 0), {
    active: null,
    total: 1,
  });
});

test("営業情報がないマップは標高や名前によらずgroupIdごとに数える", () => {
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
    { active: null, total: 8 },
  );
});

test("summaryのsource URLが空白だけなら地図のgroupIdを使う", () => {
  const data = mapData([course("unnamed", null, false)]);
  data.courseStatusSummary = {
    total: 8,
    open: 8,
    partial: 0,
    closed: 0,
    unknown: 0,
    observedAt: null,
    sourceUrls: ["  "],
    updates: [],
  };
  assert.deepEqual(summarizeCoursesForList(data, 9), {
    active: null,
    total: 1,
  });
});

test("営業状況の公式項目を線やグループによらず一覧のコース数に使う", () => {
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
    sourceUrls: ["https://example.com/courses"],
    updates: [],
  };
  assert.deepEqual(summarizeCoursesForList(data, 99), { active: 8, total: 12 });
});

test("標高がなくても営業状況の公式項目を優先する", () => {
  const pending = course("A", "○");
  pending.coordinates = [
    [140, 43],
    [140.001, 43.001],
  ];
  const data = mapData([pending]);
  data.courseStatusSummary = {
    total: 4,
    open: 1,
    partial: 2,
    closed: 1,
    unknown: 0,
    observedAt: null,
    sourceUrls: ["https://example.com/courses"],
    updates: [],
  };
  assert.deepEqual(summarizeCoursesForList(data, 99), { active: 3, total: 4 });
});

test("営業状況に不明項目があれば営業数を不明にし、0件なら非表示にする", () => {
  const data = mapData([course("A", "○")]);
  data.courseStatusSummary = {
    total: 2,
    open: 1,
    partial: 0,
    closed: 0,
    unknown: 1,
    observedAt: null,
    sourceUrls: ["https://example.com/courses"],
    updates: [],
  };
  assert.deepEqual(summarizeCoursesForList(data, 99), {
    active: null,
    total: 2,
  });

  data.courseStatusSummary = {
    total: 0,
    open: 0,
    partial: 0,
    closed: 0,
    unknown: 0,
    observedAt: null,
    sourceUrls: ["https://example.com/courses"],
    updates: [],
  };
  assert.equal(summarizeCoursesForList(data, 99), null);
});
