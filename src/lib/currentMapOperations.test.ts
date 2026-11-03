import assert from "node:assert/strict";
import test from "node:test";
import { applyCurrentMapOperations } from "./currentMapOperations";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
  FinalizedResortMapData,
} from "./finalizedResortGeojsonShared";
import type { LatestSuccessfulStatus } from "./latestStatusFiles";

const course = (
  id: string,
  statusMappingNames: string[],
): FinalizedCourseFeature =>
  ({
    id,
    name: id,
    displayName: id,
    groupId: id,
    sectionName: null,
    statusMappingNames,
    latestStatusName: "Apr 30 old course",
    statusSnapshotId: "old-snapshot",
    sourceUrls: ["https://old.example/course"],
    coordinates: [
      [140, 43, 800],
      [140.001, 43.001, 700],
    ],
    properties: {
      name: id,
      level: null,
      piste: null,
      snowboard: null,
      status: "○",
      update: "Apr 30 old update",
      latestNote: "Apr 30 old note",
      horizontalDistMap: null,
      slopeDistMap: null,
      elevationDiffMap: null,
      avgSlopeDegMap: null,
      maxSlopeDegMap: null,
      distance: null,
      avg: null,
      max: null,
      maxWidth: null,
      minWidth: null,
      note: null,
      image: null,
      searchWord: null,
      morning: null,
      night: null,
    },
  }) as FinalizedCourseFeature;

const lift = (id: string, statusMappingNames: string[]): FinalizedLiftFeature =>
  ({
    id,
    name: id,
    statusMappingNames,
    latestStatusName: "Apr 30 old lift",
    statusSnapshotId: "old-lift-snapshot",
    coordinates: [
      [140, 43, 700],
      [140.001, 43.001, 1000],
    ],
    properties: {
      name: id,
      type: null,
      speed: null,
      hood: null,
      capacity: null,
      distance: null,
      vertical: null,
      top: null,
      bottom: null,
      footrest: null,
      towers: null,
      signal: null,
      oilShield: null,
      maker: null,
      year: null,
      note: null,
      status: "×",
      update: "Apr 30 old lift update",
      latestNote: "Apr 30 old lift note",
      horizontalDistMap: null,
      slopeDistMap: null,
      elevationDiffMap: null,
      searchWord: null,
      link: null,
      morning: null,
      night: null,
    },
  }) as FinalizedLiftFeature;

const mapData = (): FinalizedResortMapData =>
  ({
    courseStatusSummary: {
      total: 1,
      open: 1,
      partial: 0,
      closed: 0,
      unknown: 0,
      observedAt: "Apr 30 old summary time",
      sourceUrls: ["https://old.example/summary"],
      updates: ["Apr 30 old summary update"],
    },
    courses: {
      source: "slope_10m",
      baseSource: "slope_before",
      fileName: "old-map.json",
      observedAt: "Apr 30 old course time",
      sourceUrls: ["https://old.example/course-section"],
      features: [course("open", ["Open Run"]), course("unknown", ["Missing"])],
    },
    lifts: {
      source: "lift_20m",
      baseSource: "lift_before",
      fileName: "old-map.json",
      observedAt: "Apr 30 old lift time",
      sourceUrls: ["https://old.example/lift-section"],
      features: [lift("lift", ["Chair A"])],
    },
  }) as FinalizedResortMapData;

const current = (
  kind: "courses" | "lifts",
  items: Record<string, unknown>[],
): LatestSuccessfulStatus => ({
  fileName: "20261103_090000.json",
  time: "2026-11-03T00:00:00Z",
  items,
  sourceUrls: [`https://current.example/${kind}`],
});

test("without adopted current snapshots, all cached operation data is cleared", () => {
  const input = mapData();
  const result = applyCurrentMapOperations(input, {
    courses: null,
    lifts: null,
  });

  assert.ok(result);
  assert.equal(result.courses?.observedAt, null);
  assert.deepEqual(result.courses?.sourceUrls, []);
  assert.equal(result.lifts?.observedAt, null);
  assert.deepEqual(result.lifts?.sourceUrls, []);
  assert.deepEqual(result.courseStatusSummary, {
    total: 2,
    open: 0,
    partial: 0,
    closed: 0,
    unknown: 2,
    observedAt: null,
    sourceUrls: [],
    updates: [],
    sourceLabels: undefined,
  });
  for (const feature of result.courses?.features ?? []) {
    assert.equal(feature.properties.status, null);
    assert.equal(feature.properties.update, null);
    assert.equal(feature.properties.latestNote, null);
    assert.equal(feature.latestStatusName, null);
    assert.equal(feature.statusSnapshotId, null);
    assert.deepEqual(feature.sourceUrls, []);
  }
  const mappedLift = result.lifts?.features[0];
  assert.equal(mappedLift?.properties.status, null);
  assert.equal(mappedLift?.properties.update, null);
  assert.equal(mappedLift?.properties.latestNote, null);
  assert.equal(mappedLift?.latestStatusName, null);
  assert.equal(mappedLift?.statusSnapshotId, null);
  assert.deepEqual(
    mappedLift?.coordinates,
    input.lifts?.features[0]?.coordinates,
  );
});

test("current statuses map uniquely, while unmapped and ambiguous values are unknown", () => {
  const input = mapData();
  input.courses?.features.push(
    course("partial", ["Partial Run"]),
    course("closed", ["Closed Run"]),
    course("ambiguous", ["Duplicate Run"]),
  );
  const result = applyCurrentMapOperations(input, {
    courses: current("courses", [
      {
        name: "Open Run",
        status: "〇",
        update: "current open",
        note: "open note",
      },
      { name: "Partial Run", status: "△" },
      { name: "Closed Run", status: "✕" },
      { name: "Duplicate Run", status: "○" },
      { name: "Duplicate Run", status: "×" },
    ]),
    lifts: current("lifts", [
      {
        name: "Chair A",
        status: "○",
        update: "current lift",
        note: "lift note",
      },
    ]),
  });

  assert.ok(result);
  assert.deepEqual(result.courseStatusSummary, {
    total: 5,
    open: 1,
    partial: 1,
    closed: 1,
    unknown: 2,
    observedAt: "2026-11-03T00:00:00Z",
    sourceUrls: ["https://current.example/courses"],
    updates: ["current open"],
    sourceLabels: undefined,
  });
  const open = result.courses?.features.find(feature => feature.id === "open");
  assert.equal(open?.properties.status, "○");
  assert.equal(open?.properties.update, "current open");
  assert.equal(open?.properties.latestNote, "open note");
  assert.deepEqual(open?.sourceUrls, ["https://current.example/courses"]);
  assert.deepEqual(open?.coordinates, input.courses?.features[0]?.coordinates);
  const unmapped = result.courses?.features.find(
    feature => feature.id === "unknown",
  );
  assert.equal(unmapped?.properties.status, null);
  const ambiguous = result.courses?.features.find(
    feature => feature.id === "ambiguous",
  );
  assert.equal(ambiguous?.properties.status, null);
  assert.equal(result.lifts?.observedAt, "2026-11-03T00:00:00Z");
  assert.deepEqual(result.lifts?.sourceUrls, ["https://current.example/lifts"]);
  assert.equal(result.lifts?.features[0]?.properties.status, "○");
  assert.equal(result.lifts?.features[0]?.properties.update, "current lift");
});

test("course and lift current snapshots are independent", () => {
  const result = applyCurrentMapOperations(mapData(), {
    courses: null,
    lifts: current("lifts", [{ name: "Chair A", status: "△" }]),
  });

  assert.ok(result);
  assert.equal(result.courses?.observedAt, null);
  assert.equal(result.courses?.features[0]?.properties.status, null);
  assert.equal(result.lifts?.observedAt, "2026-11-03T00:00:00Z");
  assert.equal(result.lifts?.features[0]?.properties.status, "△");
  assert.equal(result.courseStatusSummary?.unknown, 2);
});
