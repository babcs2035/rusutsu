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

test("a missing section status makes the logical course count unknown", () => {
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

test("lifts count only ○ as operating, not △", () => {
  assert.deepEqual(
    summarizeMappedLifts([
      lift("open", "○"),
      lift("partial", "△"),
      lift("closed", "×"),
    ]),
    { active: 1, total: 3 },
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
    active: 1,
    total: 1,
  });
  assert.deepEqual(summarizeCoursesForList(null, 9), {
    active: null,
    total: 9,
  });
  assert.deepEqual(summarizeCoursesForList(mapData([pending]), 0), {
    active: 1,
    total: 1,
  });
});

test("対応表がない地図は地図のgroupIdごとに不明/Nで数える", () => {
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

test("公式の集計があっても未対応の地図は地図のコース数を分母にする", () => {
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

test("official aggregate snapshot does not replace current map group counts", () => {
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
  assert.deepEqual(summarizeCoursesForList(data, 99), { active: 6, total: 9 });
});

test("赤倉観光の対応済み9コースと未対応4コースを分けて数える", () => {
  const mapped = Array.from({ length: 9 }, (_, i) =>
    course(`mapped-${i}`, "×"),
  );
  const unmapped = Array.from({ length: 4 }, (_, i) =>
    course(`unmapped-${i}`, null, false),
  );
  const data = mapData([...mapped, course("mapped-1", "×"), ...unmapped]);
  assert.deepEqual(summarizeCoursesForList(data, 13), { active: 0, total: 9 });
  mapped[0].properties.status = "○";
  mapped[2].properties.status = "△";
  assert.deepEqual(summarizeCoursesForList(data, 13), { active: 2, total: 9 });
  mapped[3].properties.status = null;
  assert.deepEqual(summarizeCoursesForList(data, 13), {
    active: null,
    total: 9,
  });
});

test("対応済みの連続区間に欠損があれば開いている区間だけで確定しない", () => {
  assert.deepEqual(
    summarizeMappedCourses([course("A", "○"), course("A", null)]),
    { active: null, total: 1 },
  );
});

test("別ルートのコースは詳細と同じ主ルートの状態で数える", () => {
  const routes = [course("A", "×"), course("A", "○")];
  routes.forEach((row, i) => {
    row.groupKind = "routes";
    row.routeKey = `A:route:${i + 1}`;
  });
  assert.deepEqual(summarizeMappedCourses(routes), { active: 0, total: 1 });
});

test("空白だけの対応名はコース・リフトの分母に含めない", () => {
  const blankCourse = course("blank", null);
  blankCourse.statusMappingNames = [" "];
  const blankLift = lift("blank", null);
  blankLift.statusMappingNames = [" "];
  assert.equal(summarizeMappedCourses([blankCourse]), null);
  assert.equal(summarizeMappedLifts([blankLift]), null);
});

test("missing status in a map group makes its active count unknown", () => {
  const pending = course("A", "○");
  pending.coordinates = [
    [140, 43],
    [140.001, 43.001],
  ];
  const data = mapData([pending]);
  data.courseStatusSummary = {
    total: 900,
    open: 900,
    partial: 0,
    closed: 0,
    unknown: 0,
    observedAt: null,
    sourceUrls: ["https://example.com/courses"],
    updates: [],
  };
  pending.properties.status = null;
  const missing = course("A", null);
  const withMissingSection = mapData([pending, missing]);
  withMissingSection.courseStatusSummary = data.courseStatusSummary;
  assert.deepEqual(summarizeCoursesForList(withMissingSection, 99), {
    active: null,
    total: 1,
  });
});

test("map rows override stale summary counts, while empty inventory uses fallback", () => {
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
  assert.deepEqual(summarizeCoursesForList(data, 99), { active: 1, total: 1 });

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
  assert.deepEqual(summarizeCoursesForList(data, 99), { active: 1, total: 1 });
  assert.deepEqual(summarizeCoursesForList(mapData([]), 99), {
    active: null,
    total: 99,
  });
});
