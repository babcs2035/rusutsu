import assert from "node:assert/strict";
import test from "node:test";
import {
  legacyCourseGrouping,
  readCourseGrouping,
} from "@/shared/course-lift/identity";
import {
  applyCourseGrouping,
  applyCourseGroupingPlan,
  courseEditorLabel,
  courseGroupingBuckets,
  groupingNeedsReview,
  normalizeCourseGroupings,
  suggestCourseChain,
  suggestCourseRoutes,
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
  // 1 本だけのグループは確認する対象がないので、まとめ方の画面には出さない
  assert.equal(courseGroupingBuckets(loaded.courses).length, 0);
});

test("changing a saved group's kind is kept in the save payload", () => {
  const feature = (entityId: string, order: number) => ({
    type: "Feature" as const,
    properties: {
      entityId,
      name: "D",
      courseGrouping: { id: "g", name: "D", kind: "continuous", order },
      groupingReviewed: "fp",
    },
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [140, 40 + order * 0.001],
        [140, 40.001 + order * 0.001],
      ],
    },
  });
  const loaded = sourceDataToCourses("appi", {
    sourceKind: "curated",
    geojson: {
      type: "FeatureCollection",
      features: [feature("a", 1), feature("b", 2)],
    },
    details: null,
    fileHash: null,
    detailFileHash: null,
  });
  const next = applyCourseGrouping(loaded.courses, ["a", "b"], "routes", "D");
  for (const course of next)
    assert.equal(
      (
        courseToSavePayload(course).properties.courseGrouping as {
          kind: string;
        }
      ).kind,
      "routes",
    );
  const independent = applyCourseGrouping(next, ["a", "b"], "independent", "");
  for (const course of independent)
    assert.equal(courseToSavePayload(course).properties.courseGrouping, null);
});

test("two connected sections form route 1 and a third line becomes route 2", () => {
  const line = (id: string, coordinates: [number, number][]) => ({
    ...createEmptyCourse(),
    id,
    name: "X",
    skiId: "appi",
    coordinates,
  });
  const courses = [
    line("a", [
      [140, 40],
      [140, 40.001],
    ]),
    line("b", [
      [140, 40.001],
      [140, 40.002],
    ]),
    line("c", [
      [141, 40],
      [141, 40.001],
    ]),
  ];
  const suggestion = suggestCourseRoutes(courses);
  assert.equal(suggestion.routes.length, 2);
  assert.deepEqual([...suggestion.routes[0]].sort(), ["a", "b"]);
  assert.deepEqual(suggestion.routes[1], ["c"]);

  const grouped = applyCourseGroupingPlan(courses, ["a", "b", "c"], {
    name: "X",
    routes: [["a", "b"], ["c"]],
  });
  assert.deepEqual(
    grouped.map(c => [
      c.grouping?.kind,
      c.grouping?.order,
      c.grouping?.route,
      c.grouping?.section,
    ]),
    [
      ["routes", 1, 1, 1],
      ["routes", 2, 1, 2],
      ["routes", 3, 2, undefined],
    ],
  );
  assert.equal(new Set(grouped.map(c => c.grouping?.id)).size, 1);
  assert.deepEqual(grouped.map(courseEditorLabel), [
    "X / ルート1 区間1",
    "X / ルート1 区間2",
    "X / ルート2",
  ]);
  assert.equal(groupingNeedsReview(grouped), false);

  // 保存して読み直しても、ルートと区間が残る
  const payload = courseToSavePayload(grouped[1]);
  assert.deepEqual(
    readCourseGrouping(payload.properties.courseGrouping),
    grouped[1].grouping,
  );

  // 2本だけまとめ、1本は別コースにもできる
  const partial = applyCourseGroupingPlan(grouped, ["a", "b", "c"], {
    name: "X",
    routes: [["a", "b"]],
  });
  assert.equal(partial[0].grouping?.kind, "continuous");
  assert.equal(partial[1].grouping?.order, 2);
  assert.equal(partial[2].grouping, null);
  assert.equal(courseGroupingBuckets(partial)[0].length, 3);
  assert.equal(groupingNeedsReview(partial), false);
});

test("a group keeps up with renamed lines and a lone route becomes continuous", () => {
  const line = (id: string, name: string, order: number, route: number) => ({
    ...createEmptyCourse(),
    id,
    name,
    skiId: "appi",
    grouping: { id: "g", name: "旧名", kind: "routes" as const, order, route },
  });
  const normalized = normalizeCourseGroupings([
    line("a", "新名", 1, 2),
    line("b", "新名", 2, 2),
  ]);
  assert.deepEqual(
    normalized.map(c => c.grouping),
    [
      { id: "g", name: "新名", kind: "continuous", order: 1 },
      { id: "g", name: "新名", kind: "continuous", order: 2 },
    ],
  );
  assert.deepEqual(normalized.map(courseEditorLabel), [
    "新名 / 区間1",
    "新名 / 区間2",
  ]);
  const untouched = [line("a", "X", 1, 1), line("b", "X", 2, 2)].map(c => ({
    ...c,
    grouping: { ...c.grouping, name: "X" },
  }));
  assert.equal(normalizeCourseGroupings(untouched), untouched);
});

test("suggested routes put the longest route first", () => {
  const line = (id: string, coordinates: [number, number][]) => ({
    id,
    coordinates,
  });
  const result = suggestCourseRoutes([
    line("short", [
      [141, 40],
      [141, 40.001],
    ]),
    line("a", [
      [140, 40],
      [140, 40.002],
    ]),
    line("b", [
      [140, 40.002],
      [140, 40.004],
    ]),
  ]);
  assert.equal(result.routes[0].length, 2);
  assert.deepEqual(result.routes[1], ["short"]);
});

test("disconnected same-name lines default to separate routes, never separate courses", () => {
  const result = suggestCourseRoutes([
    {
      id: "a",
      coordinates: [
        [140, 40],
        [140, 40.002],
      ],
    },
    {
      id: "b",
      coordinates: [
        [141, 40],
        [141, 40.001],
      ],
    },
  ]);
  assert.deepEqual(result.routes, [["a"], ["b"]]);
});
