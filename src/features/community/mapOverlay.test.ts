import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommunityMapData, PublicMapEntry } from "./contract";
import {
  chooseCommunityPeriod,
  getPeriodStart,
  groupMapEntries,
  resolveMapEntries,
} from "./mapOverlay";

const entry = (
  id: string,
  opts: Partial<PublicMapEntry> = {},
): PublicMapEntry => ({
  id,
  postId: `post-${id}`,
  kind: "MOGUL",
  observedOn: "2026-10-20",
  latitude: 43,
  longitude: 142,
  courseId: null,
  liftId: null,
  targetName: "コースA",
  photo: null,
  photoCount: 0,
  ...opts,
});

const emptyMap: Pick<CommunityMapData, "courses" | "lifts"> = {
  courses: [],
  lifts: [],
};

test("calculates date windows and season edges in Japan time", () => {
  assert.equal(
    getPeriodStart("7d", new Date("2026-10-24T03:00:00Z")),
    "2026-10-18",
  );
  assert.equal(
    getPeriodStart("season", new Date("2026-09-30T14:59:00Z")),
    "2025-10-01",
  );
  assert.equal(
    getPeriodStart("season", new Date("2026-09-30T15:00:00Z")),
    "2026-10-01",
  );
  assert.equal(
    chooseCommunityPeriod("2026-10-18", new Date("2026-10-24T03:00:00Z")),
    "7d",
  );
  assert.equal(
    chooseCommunityPeriod("2026-10-17", new Date("2026-10-24T03:00:00Z")),
    "season",
  );
  assert.equal(
    chooseCommunityPeriod("2025-09-30", new Date("2026-10-24T03:00:00Z")),
    "all",
  );
  assert.equal(
    chooseCommunityPeriod(null, new Date("2026-10-24T03:00:00Z")),
    "all",
  );
});

test("resolves point entries directly and omits target entries without geometry", () => {
  const result = resolveMapEntries(
    [
      entry("point"),
      entry("missing", {
        latitude: null,
        longitude: null,
        kind: "COURSE",
        courseId: "nope",
      }),
    ],
    emptyMap,
  );
  assert.deepEqual(result, [
    { entry: entry("point"), coordinates: [142, 43], targetOnly: false },
  ]);
});

test("uses a distance midpoint on a bent line and the longest disjoint route", () => {
  const data: Pick<CommunityMapData, "courses" | "lifts"> = {
    courses: [
      {
        id: "bent",
        name: "Bent",
        coordinates: [],
        lines: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
          ],
        ],
      },
      {
        id: "split",
        name: "Split",
        coordinates: [],
        lines: [
          [
            [10, 10],
            [10.2, 10],
          ],
          [
            [20, 20],
            [24, 20],
          ],
        ],
      },
    ],
    lifts: [],
  };
  const resolved = resolveMapEntries(
    [
      entry("bent", {
        kind: "COURSE",
        courseId: "bent",
        latitude: null,
        longitude: null,
      }),
      entry("split", {
        kind: "COURSE",
        courseId: "split",
        latitude: null,
        longitude: null,
      }),
    ],
    data,
  );
  assert.deepEqual(
    resolved.map(item => item.coordinates),
    [
      [2, 0],
      [22, 20],
    ],
  );
  assert.ok(resolved.every(item => item.targetOnly));
});

test("uses latitude-scaled line distances and rejects unmappable geometry", () => {
  const data: Pick<CommunityMapData, "courses" | "lifts"> = {
    courses: [
      {
        id: "scaled",
        name: "Scaled",
        coordinates: [],
        lines: [
          [
            [0, 0],
            [1, 0],
          ],
          [
            [0, 80],
            [5, 80],
          ],
        ],
      },
      {
        id: "bad",
        name: "Bad",
        coordinates: [],
        lines: [
          [
            [0, 0],
            [Number.NaN, 1],
          ],
        ],
      },
      {
        id: "short",
        name: "Short",
        coordinates: [],
        lines: [[[1, 1]]],
      },
    ],
    lifts: [],
  };
  const resolved = resolveMapEntries(
    [
      entry("scaled", {
        kind: "COURSE",
        courseId: "scaled",
        latitude: null,
        longitude: null,
      }),
      entry("bad", {
        kind: "COURSE",
        courseId: "bad",
        latitude: null,
        longitude: null,
      }),
      entry("short", {
        kind: "COURSE",
        courseId: "short",
        latitude: null,
        longitude: null,
      }),
      entry("bad-lat", { latitude: 91, longitude: 0 }),
      entry("bad-lng", { latitude: 0, longitude: Number.NaN }),
    ],
    data,
  );
  assert.deepEqual(
    resolved.map(item => item.entry.id),
    ["scaled"],
  );
  assert.deepEqual(resolved[0]?.coordinates, [0.5, 0]);
});

test("groups same target entries and nearby points while retaining newest order", () => {
  const resolved = resolveMapEntries(
    [
      entry("target-old", {
        kind: "COURSE",
        courseId: "c1",
        latitude: null,
        longitude: null,
        observedOn: "2026-10-19",
      }),
      entry("target-new", {
        kind: "COURSE",
        courseId: "c1",
        latitude: null,
        longitude: null,
        observedOn: "2026-10-20",
        photo: { id: "photo", width: 100, height: 80 },
      }),
      entry("nearby", { latitude: 1.0001, longitude: 1.0001 }),
      entry("isolated", { latitude: 1.1, longitude: 1.1 }),
    ],
    {
      courses: [
        {
          id: "c1",
          name: "Course",
          coordinates: [],
          lines: [
            [
              [1, 1],
              [1, 1.001],
            ],
          ],
        },
      ],
      lifts: [],
    },
  );
  const groups = groupMapEntries(
    resolved,
    coordinates => ({ x: coordinates[0] * 10_000, y: coordinates[1] * 10_000 }),
    { width: 20_000, height: 20_000 },
    48,
  );
  const target = groups.find(group =>
    group.posts.some(post => post.entry.id === "target-old"),
  );
  assert.deepEqual(
    target?.posts.map(post => post.entry.id),
    ["target-new", "nearby", "target-old"],
  );
  assert.deepEqual(target?.coordinates, [1, 1.0005]);
  assert.deepEqual(
    target?.posts.filter(post => post.targetOnly).map(post => post.entry.id),
    ["target-new", "target-old"],
  );
  assert.equal(
    target?.posts.find(post => post.entry.id === "nearby")?.targetOnly,
    false,
  );
  assert.equal(
    groups.find(group => group.posts.some(post => post.entry.id === "isolated"))
      ?.posts.length,
    1,
  );
});

test("projection distance splits on zoom and culls beyond the viewport margin", () => {
  const points = resolveMapEntries(
    [
      entry("a", { latitude: 0, longitude: 0 }),
      entry("b", { latitude: 0, longitude: 0.001 }),
      entry("far", { latitude: 0, longitude: 1 }),
    ],
    emptyMap,
  );
  const project = (scale: number) => (coordinates: [number, number]) => ({
    x: coordinates[0] * scale,
    y: coordinates[1] * scale,
  });
  const zoomedOut = groupMapEntries(
    points,
    project(1_000),
    { width: 200, height: 200 },
    48,
  );
  const zoomedIn = groupMapEntries(
    points,
    project(100_000),
    { width: 200, height: 200 },
    48,
  );
  assert.equal(
    zoomedOut.find(group => group.posts.length > 1)?.posts.length,
    2,
  );
  assert.deepEqual(
    zoomedIn.flatMap(group => group.posts.map(post => post.entry.id)).sort(),
    ["a", "b"],
  ); // the third point lies outside the 100px culling margin

  const separated = groupMapEntries(
    points.slice(0, 2),
    coordinates => ({
      x: coordinates[0] * 100_000,
      y: coordinates[1] * 100_000,
    }),
    { width: 20_000, height: 200 },
    48,
  );
  assert.equal(separated.length, 2);
});

test("groups close points across spatial hash cell boundaries", () => {
  const points = resolveMapEntries(
    [
      entry("left", { latitude: 0, longitude: 47 }),
      entry("right", { latitude: 0, longitude: 49 }),
    ],
    emptyMap,
  );
  const groups = groupMapEntries(
    points,
    coordinates => ({ x: coordinates[0], y: coordinates[1] }),
    { width: 200, height: 200 },
    48,
  );
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0]?.posts.map(post => post.entry.id),
    ["right", "left"],
  );
});
