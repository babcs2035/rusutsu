import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  FinalizedCourseFeature,
  ResortMapSection,
} from "./finalizedResortGeojson";
import { mergeResortMapSections, mergeResortMaps } from "./mergedResortMap";

test("merged maps retain all geometry and namespace matching source IDs and groups", () => {
  const feature = {
    id: "1",
    groupId: "same-course",
    name: "中央コース",
    coordinates: [
      [141, 43],
      [141.1, 43.1],
    ],
    properties: { status: "○" },
  } as FinalizedCourseFeature;
  const section: ResortMapSection<FinalizedCourseFeature> = {
    source: "slope_before",
    baseSource: "slope_detail",
    fileName: "a.json",
    sourceUrls: ["official"],
    verificationStatus: "verified",
    features: [feature],
  };
  const result = mergeResortMapSections([
    { id: "area-a", section },
    { id: "area-b", section },
    { id: "missing", section: null },
  ]);
  assert.equal(result?.features.length, 2);
  assert.deepEqual(
    result?.features.map(value => value.id),
    ["area-a:1", "area-b:1"],
  );
  assert.deepEqual(
    result?.features.map(value => value.groupId),
    ["area-a:same-course", "area-b:same-course"],
  );
  assert.deepEqual(result?.features[0].coordinates, feature.coordinates);
  assert.deepEqual(result?.sourceUrls, ["official"]);
  assert.equal(feature.id, "1");
  assert.equal(mergeResortMaps([{ id: "missing", data: null }]), null);
});
