import assert from "node:assert/strict";
import test from "node:test";
import type { ResortOperatingCounts } from "./operatingCounts";
import { sortResorts } from "./sortResorts";

const resort = (
  id: string,
  options: {
    name?: string;
    reading?: string | null;
    latitude?: number;
    longitude?: number;
    courses?: number;
    counts?: ResortOperatingCounts;
  } = {},
) => ({
  id,
  nameJa: options.name ?? id,
  reading: options.reading ?? null,
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

test("sorts names by reading in kana order, ignoring hiragana/katakana", () => {
  const input = [
    resort("rusutsu", { name: "ルスツリゾート", reading: "るすつりぞーと" }),
    resort("asahidake", { name: "旭岳", reading: "あさひだけ" }),
    resort("kiroro", { name: "キロロ", reading: "キロロ" }),
    resort("niseko", { name: "ニセコ" }),
  ];
  assert.deepEqual(ids(sortResorts(input, "name")), [
    "asahidake",
    "kiroro",
    "niseko",
    "rusutsu",
  ]);
});

test("open lift order places unknown statuses after known zero", () => {
  const input = [
    resort("unknown", { counts: counts(null, 100) }),
    resort("closed", { counts: counts(0) }),
    resort("open", { counts: counts(4) }),
    resort("no-data"),
  ];
  assert.deepEqual(ids(sortResorts(input, "openLifts")), [
    "open",
    "closed",
    "no-data",
    "unknown",
  ]);
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

const withDistance = (
  id: string,
  courseDistance: { total: number; open: number | null } | null,
  reading?: string,
) => ({
  ...resort(id, { reading }),
  operatingCounts: { hasMap: true, courses: null, lifts: null, courseDistance },
});

test("prefecture order puts longer resorts first, then unmapped ones by reading", () => {
  const input = [
    withDistance("small", { total: 3_000, open: 0 }, "あ"),
    withDistance("no-map-b", null, "か"),
    withDistance("large", { total: 40_000, open: 1_000 }, "さ"),
    withDistance("no-map-a", null, "い"),
  ];
  assert.deepEqual(ids(sortResorts(input, "prefecture")), [
    "large",
    "small",
    "no-map-a",
    "no-map-b",
  ]);
  assert.deepEqual(ids(sortResorts(input, "prefecture", null, "name")), [
    "small",
    "no-map-a",
    "no-map-b",
    "large",
  ]);
});

test("open distance order breaks ties by total distance and puts unknown last", () => {
  const input = [
    withDistance("unknown", { total: 90_000, open: null }),
    withDistance("closed-small", { total: 5_000, open: 0 }),
    withDistance("closed-large", { total: 50_000, open: 0 }),
    withDistance("open", { total: 10_000, open: 4_000 }),
  ];
  assert.deepEqual(ids(sortResorts(input, "openDistance")), [
    "open",
    "closed-large",
    "closed-small",
    "unknown",
  ]);
});

test("total distance order puts longer resorts first and unmapped last", () => {
  const input = [
    withDistance("no-map", null),
    withDistance("small", { total: 5_000, open: 5_000 }),
    withDistance("large", { total: 50_000, open: 0 }),
  ];
  assert.deepEqual(ids(sortResorts(input, "totalDistance")), [
    "large",
    "small",
    "no-map",
  ]);
});

test("lift price order puts cheaper first and unknown prices last", () => {
  const input = [
    resort("unknown"),
    resort("expensive", { name: "い" }),
    resort("cheap"),
    resort("same-a", { name: "あ" }),
  ];
  const prices = new Map([
    ["expensive", 8000],
    ["cheap", 3000],
    ["same-a", 8000],
  ]);
  assert.deepEqual(
    ids(sortResorts(input, "liftPrice", null, "distance", prices)),
    ["cheap", "same-a", "expensive", "unknown"],
  );
});
