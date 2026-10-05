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
  recommendationSelection,
  routeNumber,
  similarity,
  slopeBin,
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

test("one course has a normalized distance-weighted smoothed histogram, geometry distance only", () => {
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
  assert.ok(Math.abs(a.histogram.reduce((s, p) => s + p, 0) - 1) < 1e-12);
  assert.ok(a.distance > 200 && a.distance < 220);
  assert.equal(similarity(a, a).score, 100);
  assert.deepEqual(
    extractCourseFeatures("r", [
      course({ coordinates: [...line()].reverse() }),
    ])[0].histogram,
    a.histogram,
  );
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
test("Wasserstein finite bins, bin boundaries, logarithmic length ratio, symmetry", () => {
  const histogram = (bin: number) =>
    Array.from({ length: 16 }, (_, i) => (i === bin ? 1 : 0));
  assert.equal(wasserstein(histogram(0), histogram(1)), 3);
  assert.equal(wasserstein(histogram(0), histogram(3)), 9);
  assert.equal(wasserstein(histogram(0), histogram(15)), 45);
  assert.equal(wasserstein(histogram(14), histogram(15)), 3);
  assert.deepEqual(
    [-5, 0, 2.999, 3, 44.999, 45, 70].map(slopeBin),
    [0, 0, 0, 1, 14, 15, 15],
  );
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
test("ranking excludes opposites, own resort, copied geometry, dissimilar candidates and returns stable top three", () => {
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
  assert.deepEqual(
    rankCourses(source, [candidate("wrong", { grooming: "ungroomed" })]),
    [],
  );
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
