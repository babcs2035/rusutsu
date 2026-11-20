import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashContent,
  listSlopeBeforeResortIds,
  osmSlope10mDocumentKey,
  serializeSlopeGeojson,
  slope10mDocumentKey,
  slopeBeforeDocumentKey,
  slopeDetailDocumentKey,
} from "./slopeFiles";

test("resort picker uses counts without downloading any GeoJSON", async () => {
  for (const sourceKind of ["curated", "osm"] as const) {
    const ids = await listSlopeBeforeResortIds(sourceKind, {
      listDataDocuments: async () =>
        [0, 3].map(count => ({
          key: slopeBeforeDocumentKey(`resort-${count}`, sourceKind),
          hash: "a".repeat(64),
          version: 1,
          mediaType: "application/geo+json",
          source: "database" as const,
          geoJsonFeatureCount: count,
        })),
    });
    assert.deepEqual(ids, ["resort-3"]);
  }
});

test("resort picker rejects summaries missing the course count", async () => {
  const summary = {
    key: slopeBeforeDocumentKey("sample-resort", "curated"),
    hash: "a".repeat(64),
    version: 1,
    mediaType: "application/geo+json",
    source: "database" as const,
  };
  await assert.rejects(
    listSlopeBeforeResortIds("curated", {
      listDataDocuments: async () => [summary],
    }),
    /コース件数/u,
  );
});

test("maps slope files to src/private/data-relative DataDocument keys", () => {
  assert.equal(
    slopeBeforeDocumentKey("sample-resort", "curated"),
    "resorts-temporary/slope_before/sample-resort.geojson",
  );
  assert.equal(
    slopeBeforeDocumentKey("sample-resort", "osm"),
    "resorts-temporary/slope_before_osm/sample-resort.geojson",
  );
  assert.equal(
    slopeDetailDocumentKey("sample-resort"),
    "resorts-temporary/slope_detail/sample-resort.json",
  );
  assert.equal(
    osmSlope10mDocumentKey("sample-resort"),
    "resorts-temporary/slope_10m_osm/sample-resort.geojson",
  );
  assert.equal(
    slope10mDocumentKey("sample-resort"),
    "resorts-temporary/slope_10m/sample-resort.geojson",
  );
});

test("keeps pretty slope GeoJSON serialization with a trailing newline", () => {
  const content = serializeSlopeGeojson({
    type: "FeatureCollection",
    features: [],
  });
  assert.equal(content.endsWith("\n"), true);
  assert.equal(JSON.parse(content).type, "FeatureCollection");
  assert.equal(hashContent(content).length, 64);
});
