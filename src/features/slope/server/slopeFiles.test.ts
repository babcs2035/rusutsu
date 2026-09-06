import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashContent,
  osmSlope10mDocumentKey,
  serializeSlopeGeojson,
  slope10mDocumentKey,
  slopeBeforeDocumentKey,
  slopeDetailDocumentKey,
} from "./slopeFiles";

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
