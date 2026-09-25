import assert from "node:assert/strict";
import test from "node:test";
import type { LiftBeforeFeature } from "@/features/lift/types";
import { sourceDataToLifts } from "@/features/lift/utils/loadSource";
import { liftToSavePayload } from "@/features/lift/utils/savePayload";
import { preserveFeature } from "./preserveFeature";
import { validateEntityMetadata } from "./validateIdentity";

test("unchanged lift details and original feature members retain their raw representation", () => {
  const original = {
    type: "Feature" as const,
    id: "external-id",
    custom: { preserve: true },
    properties: {
      entityId: "lift-a",
      name: "A",
      capacity: "04",
      speed: null,
      note: "  original  ",
      midstation: [140, 40, 500],
      custom: [1, 2],
    },
    geometry: {
      type: "LineString",
      coordinates: [
        [140, 40, 500],
        [140.01, 40.01, 600],
      ],
    },
  };
  const { lifts } = sourceDataToLifts("appi", {
    geojson: { type: "FeatureCollection", features: [original] },
    details: null,
    fileHash: null,
  });
  const payload = liftToSavePayload(lifts[0]);
  assert.deepEqual(payload.properties, original.properties);
  const saved = preserveFeature<LiftBeforeFeature>(
    {
      type: "Feature" as const,
      properties: payload.properties,
      geometry: { type: "LineString", coordinates: payload.coordinates },
    },
    [original],
    "resorts-temporary/lift_before/appi.geojson",
  );
  assert.deepEqual(saved, original);
  lifts[0].detail.capacity = "6";
  assert.equal(liftToSavePayload(lifts[0]).properties.capacity, 6);
});

test("conflicting groups and duplicate fixed IDs are rejected before saving", () => {
  const entries = [1, 2].map(order => ({
    targetSkiId: "appi",
    properties: {
      entityId: `c-${order}`,
      courseGrouping: { id: "g", name: "X", kind: "continuous", order },
    },
  }));
  assert.deepEqual(validateEntityMetadata(entries), []);
  entries[1].properties.courseGrouping.order = 1;
  assert.match(validateEntityMetadata(entries).join(" "), /区間番号/);
  entries[1].targetSkiId = "other";
  assert.match(validateEntityMetadata(entries).join(" "), /所属/);
  entries[1].properties.entityId = "c-1";
  assert.match(validateEntityMetadata(entries).join(" "), /線ID/);
});
