import assert from "node:assert/strict";
import test from "node:test";
import type { ResortOperatingCounts } from "./operatingCounts";
import { sortResorts } from "./sortResorts";

const resort = (
  id: string,
  options: {
    name?: string;
    latitude?: number;
    longitude?: number;
    courses?: number;
    counts?: ResortOperatingCounts;
  } = {},
) => ({
  id,
  nameJa: options.name ?? id,
  latitude: options.latitude ?? 43,
  longitude: options.longitude ?? 141,
  numberOfCourses: options.courses ?? 10,
  operatingCounts: options.counts ?? {
    hasMap: false,
    courses: null,
    lifts: null,
  },
});

const ids = (resorts: ReturnType<typeof resort>[]) =>
  resorts.map(item => item.id);
const counts = (active: number | null, total = 10): ResortOperatingCounts => ({
  hasMap: true,
  courses: { active, total },
  lifts: { active, total: 5 },
});

test("sorts names naturally without changing the input array", () => {
  const input = [resort("B"), resort("A10"), resort("A2")];
  assert.deepEqual(ids(sortResorts(input, "name")), ["A2", "A10", "B"]);
  assert.deepEqual(ids(input), ["B", "A10", "A2"]);
});

test("uses the course total shown in the list, falling back to basic data", () => {
  const input = [
    resort("basic", { courses: 15 }),
    resort("mapped", { courses: 99, counts: counts(2, 8) }),
    resort("largest", { counts: counts(2, 20) }),
  ];
  assert.deepEqual(ids(sortResorts(input, "courses")), [
    "largest",
    "basic",
    "mapped",
  ]);
});

test("open course and lift orders place unknown statuses after known zero", () => {
  const input = [
    resort("unknown", { counts: counts(null, 100) }),
    resort("closed", { counts: counts(0) }),
    resort("open", { counts: counts(4) }),
    resort("no-data"),
  ];
  for (const order of ["openCourses", "openLifts"] as const) {
    assert.deepEqual(ids(sortResorts(input, order)), [
      "open",
      "closed",
      "no-data",
      "unknown",
    ]);
  }
});

test("equal operating counts use names and select the requested metric", () => {
  const input = [
    resort("B", { counts: counts(3) }),
    resort("A", {
      counts: { ...counts(3), lifts: { active: 1, total: 2 } },
    }),
  ];
  assert.deepEqual(ids(sortResorts(input, "openCourses")), ["A", "B"]);
  assert.deepEqual(ids(sortResorts(input, "openLifts")), ["B", "A"]);
});

test("distance uses current location and puts invalid coordinates last", () => {
  const input = [
    resort("far", { latitude: 36, longitude: 138 }),
    resort("invalid", { latitude: Number.NaN }),
    resort("near", { latitude: 43.01 }),
    resort("unlocated", { latitude: 0, longitude: 0 }),
  ];
  assert.deepEqual(
    ids(sortResorts(input, "distance", { latitude: 43, longitude: 141 })),
    ["near", "far", "invalid", "unlocated"],
  );
  assert.deepEqual(
    ids(sortResorts(input, "distance", { latitude: 36, longitude: 138 })),
    ["far", "near", "invalid", "unlocated"],
  );
  assert.deepEqual(ids(sortResorts(input, "distance")), [
    "far",
    "invalid",
    "near",
    "unlocated",
  ]);
});
