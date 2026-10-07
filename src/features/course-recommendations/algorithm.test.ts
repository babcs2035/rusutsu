import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  FinalizedCourseFeature,
  GeoCoordinate,
} from "@/lib/finalizedResortGeojsonShared";
import {
  aggregateGrooming,
  type CourseFeature,
  classifyShape,
  extractCourseFeatures,
  groomingCompatible,
  hasCourseName,
  rankCourses,
  recommendationGrade,
  recommendationSelection,
  routeNumber,
  similarity,
  slopeDistanceProfile,
  steepThreshold,
  wasserstein,
} from "./algorithm";

const line = (start = 0, end = 20): GeoCoordinate[] =>
  Array.from({ length: end - start + 1 }, (_, i) => [
    140,
    43 + (start + i) * 0.00009,
    1000 - (start + i) * 3,
  ]);
const course = (
  overrides: Partial<FinalizedCourseFeature> = {},
): FinalizedCourseFeature => ({
  id: "a",
  name: "コースA",
  displayName: "コースA",
  groupId: "a",
  sectionName: null,
  coordinates: line(),
  properties: {
    name: "コースA",
    piste: "○",
  } as FinalizedCourseFeature["properties"],
  ...overrides,
});
const feature = (overrides: Partial<CourseFeature> = {}) => ({
  ...extractCourseFeatures("source", [course()])[0],
  ...overrides,
});
/** A synthetic course whose features come straight from slope segments. */
const terrain = (
  segments: Array<{ slope: number; length: number }>,
  overrides: Partial<CourseFeature> = {},
) => {
  const distance = segments.reduce((sum, s) => sum + s.length, 0);
  return feature({
    distance,
    logDistance: Math.log(distance),
    maxSlope: Math.max(0, ...segments.map(s => s.slope)),
    slopeDistances: slopeDistanceProfile(segments),
    ...overrides,
  });
};

test("one course has a whole-degree distance profile from geometry distance only", () => {
  const a = extractCourseFeatures("r", [course()])[0];
  const b = extractCourseFeatures("r", [
    course({
      properties: {
        ...course().properties,
        distance: 99999,
        slopeDistMap: 12345,
      },
    }),
  ])[0];
  assert.equal(a.distance, b.distance);
  assert.equal(a.slopeDistances.length, 61);
  assert.ok(Math.abs(a.slopeDistances[0] - a.distance) < 1e-9);
  assert.ok(a.distance > 200 && a.distance < 220);
  // 3m drop per 9.99m horizontal is about 16.7 degrees everywhere.
  assert.ok(Math.abs(a.maxSlope - 16.7) < 0.1);
  assert.ok(Math.abs(a.slopeDistances[16] - a.distance) < 1e-9);
  assert.equal(a.slopeDistances[17], 0);
  assert.equal(similarity(a, a).score, 100);
  const reversed = extractCourseFeatures("r", [
    course({ coordinates: [...line()].reverse() }),
  ])[0];
  assert.deepEqual(reversed.slopeDistances, a.slopeDistances);
  assert.equal(reversed.maxSlope, a.maxSlope);
});
test("continuous sections connect in section order, reject gaps, ambiguous order and missing elevation", () => {
  const sections = [
    course({ id: "lower", sectionOrder: 3, coordinates: line(20, 30) }),
    course({ id: "upper", sectionOrder: 1, coordinates: line(0, 10) }),
    course({ id: "middle", sectionOrder: 2, coordinates: line(10, 20) }),
  ];
  const result = extractCourseFeatures("r", sections);
  assert.equal(result.length, 1);
  assert.equal(result[0].courseIds.length, 3);
  assert.ok(
    Math.abs(
      result[0].distance -
        extractCourseFeatures("r", [course({ coordinates: line(0, 30) })])[0]
          .distance,
    ) < 0.01,
  );
  assert.equal(
    extractCourseFeatures("r", [
      sections[1],
      { ...sections[0], coordinates: line(25, 30) },
    ]).length,
    0,
  );
  assert.equal(
    extractCourseFeatures("r", [course(), course({ id: "b" })]).length,
    0,
  );
  assert.equal(
    extractCourseFeatures("r", [
      course({ coordinates: [[140, 43], ...line().slice(1)] }),
    ]).length,
    0,
  );
  assert.equal(
    extractCourseFeatures("r", [
      course({
        coordinates: [
          [140, 43, 1000],
          [140, 44, 500],
        ],
      }),
    ]).length,
    0,
  );
  assert.equal(
    extractCourseFeatures("r", [
      course({
        coordinates: [
          [140, 43, 1000],
          [140, 43, 1000],
        ],
      }),
    ]).length,
    0,
  );
});
test("numeric main route 2 beats 10, main sections only; malformed route data excludes entire group", () => {
  const routes = [
    course({
      id: "ten",
      groupKind: "routes",
      routeKey: "g:route:10",
      sectionOrder: 3,
    }),
    course({
      id: "two-upper",
      groupKind: "routes",
      routeKey: "g:route:2",
      sectionOrder: 1,
      coordinates: line(0, 10),
    }),
    course({
      id: "two-lower",
      groupKind: "routes",
      routeKey: "g:route:2",
      sectionOrder: 2,
      coordinates: line(10, 20),
    }),
  ];
  const result = extractCourseFeatures("r", routes);
  assert.equal(result.length, 1);
  assert.equal(result[0].routeKey, "g:route:2");
  assert.deepEqual(result[0].courseIds, ["two-lower", "two-upper"]);
  assert.equal(routeNumber("g:route:10"), 10);
  assert.equal(
    extractCourseFeatures("r", [
      ...routes,
      course({ groupKind: "routes", routeKey: "invalid" }),
    ]).length,
    0,
  );
});
test("raw internal names and group names cannot be disguised by display names", () => {
  for (const name of [
    null,
    "",
    " ",
    "名前不明",
    "無名",
    "無名_1",
    "無名_東斜面",
  ])
    assert.equal(hasCourseName(name), false);
  assert.equal(
    extractCourseFeatures("r", [course({ originalName: "無名_東斜面" })])
      .length,
    0,
  );
  assert.equal(
    extractCourseFeatures("r", [course({ displayName: "無名" })]).length,
    0,
  );
});
test("grooming aggregates actual segments and enforces only definite opposites", () => {
  assert.equal(aggregateGrooming(["○", "○"]), "groomed");
  assert.equal(aggregateGrooming(["×"]), "ungroomed");
  assert.equal(aggregateGrooming(["○", "×"]), "partial");
  assert.equal(aggregateGrooming(["△", null]), "partial");
  assert.equal(aggregateGrooming(["○", null]), "unknown");
  for (const state of ["groomed", "ungroomed", "partial", "unknown"] as const) {
    assert.equal(groomingCompatible("partial", state), true);
    assert.equal(groomingCompatible("unknown", state), true);
  }
  assert.equal(groomingCompatible("groomed", "ungroomed"), false);
});
test("Wasserstein compares length-normalized profiles per degree; length ratio is logarithmic", () => {
  const steady = (slope: number, length = 500) => terrain([{ slope, length }]);
  assert.equal(wasserstein(steady(10), steady(15)), 5);
  assert.equal(wasserstein(steady(15), steady(10)), 5);
  // Only the length differs, so the distribution is identical.
  assert.equal(wasserstein(steady(15, 300), steady(15, 900)), 0);
  for (const ratio of [1, 1.5, 2, 3, 4]) {
    const a = feature(),
      b = feature({
        distance: a.distance * ratio,
        logDistance: a.logDistance + Math.log(ratio),
      });
    const score = similarity(a, b);
    assert.ok(
      Math.abs(
        score.lengthDifference - Math.min(1, Math.log(ratio) / Math.log(3)),
      ) < 1e-12,
    );
    assert.equal(score.score, similarity(b, a).score);
  }
});
test("ranking prioritizes compatible grooming/shape, excludes own resort and copied geometry; returns stable top three", () => {
  const source = { ...feature(), geometryHash: "source" };
  const candidate = (id: string, overrides = {}) => ({
    ...feature({ resortId: id }),
    resortName: id,
    geometryHash: id,
    ...overrides,
  });
  const candidates = [
    candidate("z"),
    candidate("a"),
    candidate("b"),
    candidate("c"),
    candidate("source"),
    candidate("copy", { geometryHash: "source" }),
    candidate("other", { grooming: "ungroomed" }),
    candidate("winding", { shape: "winding" }),
    candidate("far", { logDistance: 99 }),
  ];
  assert.deepEqual(
    rankCourses(source, candidates).map(r => r.resortId),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    rankCourses(source, [...candidates].reverse()).map(r => r.resortId),
    ["a", "b", "c"],
  );
  assert.equal(
    rankCourses(source, [candidate("wrong", { grooming: "ungroomed" })]).length,
    1,
  );
  assert.equal(
    rankCourses(source, [candidate("far", { logDistance: 99 })]).length,
    1,
  );
  assert.equal(
    rankCourses(source, [candidate("winding", { shape: "winding" })]).length,
    1,
  );
  assert.deepEqual(
    rankCourses(source, [
      candidate("winding", { shape: "winding" }),
      candidate("far", { logDistance: 99 }),
    ]).map(r => r.resortId),
    ["far", "winding"],
  );
});
test("slope distributions distinguish steady slopes from flat/steep mixtures with the same mean", () => {
  const steady = terrain([{ slope: 15, length: 400 }]);
  const mixed = terrain([
    { slope: 0, length: 200 },
    { slope: 30, length: 200 },
  ]);
  assert.equal(wasserstein(steady, mixed), 15);
  assert.equal(similarity(steady, mixed).slopeDifference, 1);
  assert.equal(similarity(steady, steady).score, 100);
});
test("steep threshold is 80% of the maximum, at least 5 degrees below it, floored", () => {
  assert.deepEqual(
    [0, 3, 8, 10, 20, 25, 29, 30, 35, 40, 90].map(steepThreshold),
    [0, 0, 3, 5, 15, 20, 23, 24, 28, 32, 60],
  );
});
test("slope profile counts each whole degree, is split-invariant and ignores uphill", () => {
  const original = [
    { slope: 30, length: 200 },
    { slope: -4, length: 50 },
    { slope: 12.5, length: 100 },
    { slope: 75, length: 10 },
  ];
  const profile = slopeDistanceProfile(original);
  assert.equal(profile.length, 61);
  assert.equal(profile[0], 360);
  assert.equal(profile[1], 310);
  assert.equal(profile[12], 310);
  assert.equal(profile[13], 210);
  assert.equal(profile[30], 210);
  assert.equal(profile[31], 10);
  assert.equal(profile[60], 10);
  const split = original.flatMap(s => [
    { slope: s.slope, length: s.length / 2 },
    { slope: s.slope, length: s.length / 2 },
  ]);
  assert.deepEqual(slopeDistanceProfile(split), profile);
  assert.deepEqual(slopeDistanceProfile([...original].reverse()), profile);
});
test("candidates are measured at the source course's steep threshold", () => {
  const source = terrain([
    { slope: 30, length: 200 },
    { slope: 10, length: 800 },
  ]);
  // Same steep length, but at 20 degrees: nothing reaches the source's 24 degrees.
  const gentler = terrain([
    { slope: 20, length: 200 },
    { slope: 10, length: 800 },
  ]);
  const shorterPitch = terrain([
    { slope: 30, length: 100 },
    { slope: 10, length: 900 },
  ]);
  const result = similarity(source, gentler);
  assert.equal(result.steepThreshold, 24);
  assert.equal(result.sourceSteepDistance, 200);
  assert.equal(result.candidateSteepDistance, 0);
  assert.equal(result.steepDistanceDifference, 1);
  assert.equal(result.maxSlopeDifference, 1);
  assert.ok(
    similarity(source, shorterPitch).score > similarity(source, gentler).score,
  );
  // 10m and 20m are within the 40m slope window and almost equal.
  const short = (length: number) =>
    terrain([
      { slope: 20, length },
      { slope: 5, length: 300 - length },
    ]);
  assert.ok(similarity(short(10), short(20)).steepDistanceDifference < 0.15);
  // The source sets the threshold, so swapping the pair may change the score.
  assert.equal(similarity(gentler, source).steepThreshold, 15);
});
test("terrain similarity handles flat courses and exposes meaningful grades", () => {
  const source = terrain([
    { slope: 30, length: 200 },
    { slope: 10, length: 800 },
  ]);
  const flat = terrain([{ slope: 0, length: 500 }]);
  assert.equal(similarity(flat, flat).score, 100);
  assert.ok(Number.isFinite(similarity(flat, source).score));
  assert.deepEqual(
    [100, 80, 79.99, 60, 59.99, 0].map(s => recommendationGrade(s).grade),
    ["A", "A", "B", "B", "C", "C"],
  );
  const far = terrain([{ slope: 0, length: 500 }], {
    resortId: "far",
    logDistance: 99,
  });
  const results = rankCourses({ ...source, geometryHash: "source" }, [
    { ...far, geometryHash: "far", resortName: "far" },
  ]);
  assert.equal(results.length, 1);
  assert.ok(results[0].score < 60);
});
test("distance smoothing classifies large repeated bends, ignores tiny coordinate noise and point density", () => {
  const winding: GeoCoordinate[] = [];
  for (let i = 0; i <= 120; i++) {
    const block = Math.floor(i / 20),
      t = i % 20;
    winding.push([
      140 + (block % 2 ? 20 - t : t) * 0.00012,
      43 + block * 0.0002,
      1000 - i * 2,
    ]);
  }
  assert.equal(classifyShape(line(0, 120)), "normal");
  assert.equal(
    classifyShape(
      line(0, 120).map((p, i) => [
        p[0] + (i % 2) * 0.000001,
        p[1],
        p[2] as number,
      ]),
    ),
    "normal",
  );
  assert.equal(classifyShape(winding), "winding");
  assert.equal(classifyShape(winding.filter((_, i) => i % 2 === 0)), "winding");
});

test("list selection requests the numeric main route; a clicked secondary route is never changed into the main route", () => {
  const two = course({ groupKind: "routes", routeKey: "g:route:2" });
  const ten = course({ groupKind: "routes", routeKey: "g:route:10" });
  assert.deepEqual(recommendationSelection("g", [ten, two]), {
    kind: "course",
    id: "g",
    routeId: "g:route:2",
  });
  assert.deepEqual(recommendationSelection("g", [ten]), {
    kind: "course",
    id: "g",
    routeId: "g:route:10",
  });
  assert.equal(
    recommendationSelection("g", [two, course({ groupKind: "routes" })]),
    null,
  );
  assert.equal(
    recommendationSelection("g", [
      course({ recommendationGroupingInvalid: true }),
    ]),
    null,
  );
});
