import assert from "node:assert/strict";
import test from "node:test";
import { legacyCourseGrouping } from "@/shared/course-lift/identity";
import {
  applyCourseGrouping,
  courseGroupingBuckets,
  groupingNeedsReview,
  suggestCourseChain,
} from "./courseGrouping";
import { createEmptyCourse } from "./courseOps";
import { courseToSavePayload } from "./exportFiles";
import { sourceDataToCourses } from "./loadSource";

test("a new same-name line joins the saved group review candidates", () => {
  const one = { ...createEmptyCourse(), id: "a", skiId: "appi", name: "X" };
  const grouped = applyCourseGrouping([one], [one.id], "continuous", "X");
  const next = [...grouped, { ...one, id: "b" }];
  assert.equal(courseGroupingBuckets(next)[0].length, 2);
  assert.equal(groupingNeedsReview(next), true);
});

test("reversed vertices and shuffled five sections resolve downhill without mutating geometry", () => {
  const lines = Array.from({ length: 5 }, (_, i) => ({
    id: String(i + 1),
    coordinates: [
      [140, 40 + i * 0.001, 1000 - i * 100],
      [140, 40 + (i + 1) * 0.001, 900 - i * 100],
    ],
  }));
  lines[2].coordinates.reverse();
  const shuffled = [lines[4], lines[2], lines[0], lines[3], lines[1]];
  const before = JSON.stringify(shuffled);
  const result = suggestCourseChain(shuffled);
  assert.equal(result.kind, "continuous");
  assert.equal(result.directionKnown, true);
  assert.deepEqual(result.ids, ["1", "2", "3", "4", "5"]);
  assert.equal(JSON.stringify(shuffled), before);
});
test("disconnected, parallel alternatives and branching never automatically connect", () => {
  const a = {
    id: "a",
    coordinates: [
      [140, 40],
      [140, 40.001],
    ],
  };
  for (const lines of [
    [
      a,
      {
        id: "b",
        coordinates: [
          [141, 40],
          [141, 40.001],
        ],
      },
    ],
    [
      a,
      {
        id: "b",
        coordinates: [
          [140, 40],
          [140.001, 40.0005],
          [140, 40.001],
        ],
      },
    ],
    [
      a,
      {
        id: "b",
        coordinates: [
          [140, 40.001],
          [140, 40.002],
        ],
      },
      {
        id: "c",
        coordinates: [
          [140, 40.001],
          [140.001, 40.002],
        ],
      },
    ],
  ])
    assert.equal(suggestCourseChain(lines).kind, "independent");
});
test("grouping keeps every line, details, identity; geometry edits require review again", () => {
  const courses = [0, 1].map(i => ({
    ...createEmptyCourse(),
    id: String(i),
    name: "同名",
    skiId: "appi",
    coordinates: [
      [140, 40 + i * 0.001],
      [140, 40 + (i + 1) * 0.001],
    ] as [number, number][],
    detail: { ...createEmptyCourse().detail, level: i ? "初級" : "上級" },
  }));
  const grouped = applyCourseGrouping(
    courses,
    ["1", "0"],
    "continuous",
    "コース",
  );
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].grouping?.order, 2);
  assert.equal(grouped[0].detail.level, "上級");
  assert.equal(groupingNeedsReview(grouped), false);
  const edited = grouped.map((c, i) =>
    i
      ? c
      : {
          ...c,
          coordinates: [[140, 39], ...c.coordinates] as [number, number][],
        },
  );
  assert.equal(groupingNeedsReview(edited), true);
  const separate = applyCourseGrouping(
    grouped,
    ["1", "0"],
    "independent",
    "コース",
  );
  assert.equal(separate.length, 2);
  assert.equal(groupingNeedsReview(separate), false);
});
test("plain underscore and numeric suffix do not become groups", () => {
  assert.equal(legacyCourseGrouping("X_上部", "s"), null);
  assert.equal(legacyCourseGrouping("X_2", "s"), null);
  assert.equal(legacyCourseGrouping("X_#5部", "s")?.order, 5);
});
test("group metadata roundtrips and unsupported original details are not normalized away", () => {
  const source = {
    sourceKind: "curated" as const,
    fileHash: null,
    detailFileHash: null,
    details: null,
    geojson: {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {
            entityId: "stable",
            name: "X",
            level: "初・中・上級",
            distance: "1000",
            custom: { x: 1 },
            courseGrouping: {
              id: "g",
              name: "X",
              kind: "continuous",
              order: 1,
            },
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [140, 40, 1200],
              [140, 40.01, 1000],
            ],
          },
        },
      ],
    },
  };
  const loaded = sourceDataToCourses("appi", source);
  const payload = courseToSavePayload(loaded.courses[0]);
  assert.equal(payload.properties.entityId, "stable");
  assert.equal(payload.properties.level, "初・中・上級");
  assert.equal(payload.properties.distance, "1000");
  assert.deepEqual(payload.properties.custom, { x: 1 });
  assert.equal(courseGroupingBuckets(loaded.courses).length, 1);
});
