import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getFinalizedResortMapData,
  selectLatestTimestampedGeojsonFile,
} from "./finalizedResortGeojson";
import {
  createCourseSlopeSegments,
  type FinalizedCourseFeature,
  getCourseDifficulty,
  getPisteStyle,
  getStatusOpacity,
  normalizeNumber,
  parseFinalizedCourseName,
} from "./finalizedResortGeojsonShared";

const createTestCourse = (
  slopeDeg: number[] | null,
): FinalizedCourseFeature => ({
  id: "course-1",
  name: "Test Course",
  displayName: "Test Course",
  groupId: "course-1",
  sectionName: null,
  coordinates: [
    [137, 36, 1000],
    [137.001, 36.001, 950],
    [137.002, 36.002, 900],
  ],
  slopeDeg,
  properties: {
    name: "Test Course",
    level: "中級",
    piste: "○",
    snowboard: null,
    status: "○",
    update: null,
    latestNote: null,
    horizontalDistMap: null,
    slopeDistMap: null,
    elevationDiffMap: null,
    avgSlopeDegMap: 12,
    maxSlopeDegMap: null,
    distance: null,
    avg: null,
    max: null,
    maxWidth: null,
    minWidth: null,
    note: null,
    image: null,
  },
});

test("selectLatestTimestampedGeojsonFile uses parsed filename timestamps", () => {
  assert.equal(
    selectLatestTimestampedGeojsonFile([
      "2025_0609_235959.geojson",
      "2025_0610_050334.geojson",
      "2024_1231_235959.geojson",
    ]),
    "2025_0610_050334.geojson",
  );
});

test("selectLatestTimestampedGeojsonFile excludes invalid names and dates", () => {
  assert.equal(
    selectLatestTimestampedGeojsonFile([
      "latest.geojson",
      "2025_0230_050334.geojson",
      "2025_0610_050334.json",
      "2025_0610_050334.geojson",
    ]),
    "2025_0610_050334.geojson",
  );
});

test("level strings are normalized to difficulty buckets", () => {
  assert.equal(getCourseDifficulty("初級"), "beginner");
  assert.equal(getCourseDifficulty("初・中級"), "beginnerIntermediate");
  assert.equal(getCourseDifficulty("初中級"), "beginnerIntermediate");
  assert.equal(getCourseDifficulty("中級"), "intermediate");
  assert.equal(getCourseDifficulty("中・上級"), "intermediateAdvanced");
  assert.equal(getCourseDifficulty("中上級"), "intermediateAdvanced");
  assert.equal(getCourseDifficulty("上級"), "advanced");
  assert.equal(getCourseDifficulty(""), "unknown");
  assert.equal(getCourseDifficulty("林間"), "unknown");
});

test("course display names normalize nameless courses", () => {
  assert.deepEqual(parseFinalizedCourseName("無名_1"), {
    displayName: "無名",
    groupName: "無名_1",
    sectionName: null,
  });
  assert.deepEqual(parseFinalizedCourseName("無名_連絡"), {
    displayName: "連絡",
    groupName: "無名_連絡",
    sectionName: null,
  });
});

test("only top middle bottom suffixes produce course groups", () => {
  assert.deepEqual(parseFinalizedCourseName("X_上部"), {
    displayName: "X",
    groupName: "X",
    sectionName: "上部",
  });
  assert.deepEqual(parseFinalizedCourseName("X_#下部"), {
    displayName: "X",
    groupName: "X",
    sectionName: "下部",
  });
  assert.deepEqual(parseFinalizedCourseName("X_2"), {
    displayName: "X_2",
    groupName: "X_2",
    sectionName: null,
  });
  assert.deepEqual(parseFinalizedCourseName("X_迂回"), {
    displayName: "X_迂回",
    groupName: "X_迂回",
    sectionName: null,
  });
});

test("piste styles are mapped from piste status", () => {
  assert.equal(getPisteStyle("○"), "solid");
  assert.equal(getPisteStyle("△"), "solid");
  assert.equal(getPisteStyle("×"), "dot");
  assert.equal(getPisteStyle(undefined), "solid");
});

test("status opacity is mapped from operation status", () => {
  assert.equal(getStatusOpacity("○"), 1);
  assert.equal(getStatusOpacity("△"), 0.6);
  assert.equal(getStatusOpacity("×"), 0.25);
  assert.equal(getStatusOpacity(undefined), 0.75);
});

test("slope_deg produces n - 1 averaged segments", () => {
  const segments = createCourseSlopeSegments(createTestCourse([10, 20, 40]));

  assert.equal(segments.length, 2);
  assert.equal(segments[0].slope, 15);
  assert.equal(segments[1].slope, 30);
});

test("slope segments can be widened while preserving intermediate coordinates", () => {
  const segments = createCourseSlopeSegments(createTestCourse([10, 20, 40]), 2);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].coordinates.length, 3);
  assert.equal(segments[0].slope, (10 + 20 + 40) / 3);
});

test("mismatched slope_deg falls back without crashing", () => {
  const segments = createCourseSlopeSegments(createTestCourse([10, 20]));

  assert.equal(segments.length, 2);
  assert.equal(segments[0].slope, 12);
  assert.equal(segments[1].slope, 12);
});

test("empty strings are treated as missing numeric values", () => {
  assert.equal(normalizeNumber(""), null);
  assert.equal(normalizeNumber("not-number"), null);
  assert.equal(normalizeNumber("0"), 0);
});

test("unknown resort ids return no finalized map data", async () => {
  assert.equal(await getFinalizedResortMapData("missing-resort-id"), null);
});
