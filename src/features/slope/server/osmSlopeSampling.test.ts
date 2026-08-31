import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOsmSlope10m, sampleLineEvery } from "./osmSlopeSampling";

test("sampleLineEvery keeps endpoints and samples a line about every 10m", () => {
  const result = sampleLineEvery([
    [139, 35],
    [139.001, 35],
  ]);

  assert.deepEqual(result.coordinates[0], [139, 35]);
  assert.deepEqual(result.coordinates.at(-1), [139.001, 35]);
  assert.ok(result.horizontalDistanceM > 80);
  assert.ok(result.coordinates.length >= 9);
});

test("sampleLineEvery rejects non-positive intervals", () => {
  assert.throws(
    () =>
      sampleLineEvery(
        [
          [139, 35],
          [139.001, 35],
        ],
        0,
      ),
    /0より大きい有限値/u,
  );
});

test("buildOsmSlope10m copies OSM properties and drops invalid geometry", () => {
  const result = buildOsmSlope10m({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { "@id": "way/1", name: "OSMコース" },
        geometry: {
          type: "LineString",
          coordinates: [
            [139, 35],
            [139.001, 35],
          ],
        },
      },
      {
        type: "Feature",
        properties: { "@id": "way/2", name: "不正" },
        geometry: { type: "Point", coordinates: [139, 35] },
      },
    ],
  });

  assert.equal(result.features.length, 1);
  assert.equal(result.features[0]?.properties?.["@id"], "way/1");
  assert.ok(Number(result.features[0]?.properties?.horizontal_dist_map) > 80);
});
