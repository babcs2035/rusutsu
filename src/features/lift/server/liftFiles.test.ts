import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashContent,
  LIFT_CONFIRMED_DOCUMENT_KEY,
  lift20mDocumentKey,
  liftBeforeDocumentKey,
  liftDetailDocumentKey,
  SKI_RESORT_LINKS_DOCUMENT_KEY,
  serializeLiftBeforeGeojson,
} from "./liftFiles";

test("maps lift files to src/private/data-relative DataDocument keys", () => {
  assert.equal(
    lift20mDocumentKey("sample-resort"),
    "resorts-temporary/lift_20m/sample-resort.geojson",
  );
  assert.equal(
    liftBeforeDocumentKey("sample-resort"),
    "resorts-temporary/lift_before/sample-resort.geojson",
  );
  assert.equal(
    liftDetailDocumentKey("sample-resort"),
    "resorts-temporary/lift_detail/sample-resort.json",
  );
  assert.equal(
    LIFT_CONFIRMED_DOCUMENT_KEY,
    "resorts-temporary/lift_confirmed.json",
  );
  assert.equal(SKI_RESORT_LINKS_DOCUMENT_KEY, "SkiResortLinks.json");
});

test("keeps the compact lift_before serialization and matching hash", () => {
  const content = serializeLiftBeforeGeojson({
    type: "FeatureCollection",
    features: [],
  });
  assert.equal(content, '{"type":"FeatureCollection","features":[]}');
  assert.equal(hashContent(content).length, 64);
});
