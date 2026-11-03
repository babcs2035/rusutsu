import assert from "node:assert/strict";
import test from "node:test";
import type {
  FinalizedCourseFeature,
  FinalizedResortMapData,
} from "@/lib/finalizedResortGeojsonShared";
import {
  createMapCourseStatusSummary,
  summarizeMapCourseStatuses,
} from "./courseStatusSummary";

const course = (
  id: string,
  groupId: string,
  status: string | null,
): FinalizedCourseFeature =>
  ({
    id,
    name: groupId,
    displayName: groupId,
    groupId,
    sectionName: null,
    coordinates: [],
    properties: {
      name: groupId,
      level: null,
      piste: null,
      snowboard: null,
      status,
      update: "  2026/1/1 8:00現在  ",
      latestNote: null,
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

test("map course summary groups split geometry and applies group status semantics", () => {
  const section = {
    observedAt: "2026-01-01T00:00:00Z",
    sourceUrls: ["https://example.com/courses"],
    features: [
      course("split-a", "split", "○"),
      course("split-b", "split", "×"),
      course("open-a", "open", "〇"),
      course("open-b", "open", "○"),
      course("closed", "closed", "×"),
      course("unknown", "unknown", null),
      course("incomplete-a", "incomplete", "○"),
      course("incomplete-b", "incomplete", null),
    ],
  } as NonNullable<FinalizedResortMapData["courses"]>;

  assert.deepEqual(createMapCourseStatusSummary(section), {
    total: 5,
    open: 1,
    partial: 1,
    closed: 1,
    unknown: 2,
    observedAt: section.observedAt,
    sourceUrls: section.sourceUrls,
    updates: ["2026/1/1 8:00現在"],
  });
});

test("missing map section returns null; an empty section returns zero counts", () => {
  assert.equal(createMapCourseStatusSummary(undefined), null);
  assert.equal(createMapCourseStatusSummary(null), null);
  assert.deepEqual(
    createMapCourseStatusSummary({
      source: "slope_10m",
      baseSource: "slope_before",
      fileName: "empty.geojson",
      observedAt: null,
      sourceUrls: [],
      features: [],
    }),
    {
      total: 0,
      open: 0,
      partial: 0,
      closed: 0,
      unknown: 0,
      observedAt: null,
      sourceUrls: [],
      updates: [],
    },
  );
});

test("lightweight rows use the primary route for alternative course routes", () => {
  assert.deepEqual(
    summarizeMapCourseStatuses([
      {
        groupId: "routes",
        groupKind: "routes",
        routeKey: "course:route:1",
        status: "○",
      },
      {
        groupId: "routes",
        groupKind: "routes",
        routeKey: "course:route:2",
        status: "×",
      },
      {
        groupId: "routes",
        groupKind: "routes",
        routeKey: "course:route:1",
        status: "○",
      },
    ]),
    { total: 1, open: 1, partial: 0, closed: 0, unknown: 0 },
  );
});
