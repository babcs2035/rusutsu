import assert from "node:assert/strict";
import test from "node:test";
import type { SaveRequest } from "@/features/lift/types";
import { updateCandidateLift, updateLiftProperty } from "./liftCandidate";

const candidate: SaveRequest = {
  resortId: "sample",
  fileHash: "baseline-hash",
  lifts: [
    {
      targetSkiId: "sample",
      properties: { entityId: "lift-a", name: "旧名称", "@id": "way/1" },
      coordinates: [
        [138, 36],
        [138.01, 36.01],
      ],
    },
    {
      targetSkiId: "neighbor",
      properties: { entityId: "lift-b", name: "隣のリフト" },
      coordinates: [
        [138.02, 36],
        [138.03, 36.01],
      ],
    },
  ],
  mapping: {
    resortId: "sample",
    kind: "lifts",
    latestFile: "latest.json",
    mappingFileHash: "mapping-baseline",
    rows: [
      { geometryId: "lift-a", crawledName: "公式名称", geojsonName: "旧名称" },
    ],
    geometries: [{ id: "lift-a", name: "旧名称" }],
    geojsonNames: ["旧名称"],
  },
};

test("管理者による名称修正は対応表にも反映し、申請の対象と元データを維持する", () => {
  const updated = updateCandidateLift(candidate, "lift-a", lift =>
    updateLiftProperty(lift, "name", "修正した名称"),
  );
  assert.equal(updated.lifts[0].properties.name, "修正した名称");
  assert.equal(updated.lifts[0].properties["@id"], "way/1");
  assert.equal(updated.mapping?.rows[0].geojsonName, "修正した名称");
  assert.equal(updated.mapping?.rows[0].crawledName, "公式名称");
  assert.deepEqual(updated.mapping?.geojsonNames, ["修正した名称"]);
  assert.equal(updated.mapping?.geometries?.[0].name, "修正した名称");
  assert.equal(updated.fileHash, candidate.fileHash);
  assert.equal(
    updated.mapping?.mappingFileHash,
    candidate.mapping?.mappingFileHash,
  );
  assert.equal(updated.lifts[1], candidate.lifts[1]);
  assert.equal(candidate.lifts[0].properties.name, "旧名称");
});

test("設備の数値と位置を修正しても所属・ID・未編集の情報を維持する", () => {
  const updated = updateCandidateLift(candidate, "lift-a", lift => ({
    ...updateLiftProperty(lift, "capacity", "8"),
    coordinates: [
      [138, 36],
      [138.02, 36.02],
    ],
  }));
  assert.equal(updated.lifts[0].properties.capacity, 8);
  assert.equal(updated.lifts[0].properties.entityId, "lift-a");
  assert.equal(updated.lifts[0].targetSkiId, "sample");
  assert.deepEqual(updated.lifts[0].coordinates[1], [138.02, 36.02]);
  assert.equal(updated.mapping, candidate.mapping);
  assert.equal(
    updateCandidateLift(candidate, "missing", lift => lift),
    candidate,
  );
});
