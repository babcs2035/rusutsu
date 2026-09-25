import assert from "node:assert/strict";
import test from "node:test";
import {
  contentHash,
  type MapSourceDocument,
  makeMapMigrationPlan,
} from "./migrationPlan";

const doc = (key: string, value: unknown): MapSourceDocument => {
  const content = JSON.stringify(value);
  return {
    key,
    content,
    hash: contentHash(content),
    version: 1,
    mediaType: key.endsWith(".geojson")
      ? "application/geo+json"
      : "application/json",
  };
};
const feature = (name: string) => ({
  type: "Feature",
  properties: { name, level: "初・中・上級", unknown: { a: 1 } },
  geometry: {
    type: "LineString",
    coordinates: [
      [140, 40, 100],
      [140, 40.01, 20],
    ],
  },
  custom: [1, 2],
});
test("backfill is lossless, additive and idempotent; _ and _# are distinct", () => {
  const primary = doc("resorts-temporary/slope_before/appi.geojson", {
    type: "FeatureCollection",
    extra: "keep",
    features: [
      feature("X_#5部"),
      feature("X_#1部"),
      feature("X_上部"),
      feature("X_2"),
    ],
  });
  const derived = doc("resorts-temporary/slope_10m/appi.geojson", {
    type: "FeatureCollection",
    features: [feature("X_#1部"), feature("orphan")],
  });
  const mapping = doc("resorts-temporary/latest_status_mapping/appi.json", {
    version: 1,
    courses: {
      sourceFile: "x",
      updatedAt: "t",
      rows: [{ crawledName: null, geojsonName: "X_#1部" }],
    },
  });
  const plan = makeMapMigrationPlan([primary, derived, mapping]);
  assert.equal(plan.entities.length, 4);
  assert.equal(plan.issues.length, 1);
  const after = JSON.parse(plan.documents[0].content);
  assert.equal(after.extra, "keep");
  assert.equal(after.features[0].properties.courseGrouping.order, 2);
  assert.equal(after.features[1].properties.courseGrouping.order, 1);
  assert.equal(after.features[2].properties.courseGrouping, null);
  assert.equal(after.features[3].properties.courseGrouping, null);
  assert.deepEqual(after.features[0].geometry, feature("X").geometry);
  assert.equal(after.features[0].properties.level, "初・中・上級");
  assert.equal(makeMapMigrationPlan(plan.documents).changes.length, 0);
  assert.equal(
    JSON.parse(plan.documents[2].content).courses.rows[0].geometryId,
    plan.entities[1].id,
  );
});
test("hash corruption and duplicate IDs stop the plan", () => {
  const d = doc("resorts-temporary/lift_before/x.geojson", {
    type: "FeatureCollection",
    features: [feature("x")],
  });
  assert.throws(() => makeMapMigrationPlan([{ ...d, hash: "bad" }]), /Hash/);
  const f = { ...feature("x"), properties: { entityId: "same" } };
  assert.throws(
    () =>
      makeMapMigrationPlan([
        doc(d.key, { type: "FeatureCollection", features: [f, f] }),
      ]),
    /Duplicate entity/,
  );
});
