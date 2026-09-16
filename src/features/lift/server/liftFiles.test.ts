import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashContent,
  LIFT_CONFIRMED_DOCUMENT_KEY,
  lift20mDocumentKey,
  liftBeforeDocumentKey,
  liftDetailDocumentKey,
  parseResortLinksMap,
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

test("preserves location links and notes separately from course maps", () => {
  const googleMaps = {
    url: "https://maps.google.com/?cid=123",
    description: "山麓駐車場",
  };
  const original = {
    sample: {
      googleMapsUrls: [googleMaps],
      mapUrls: ["https://example.com/course-map.pdf"],
      mapPageUrls: [
        { url: "https://example.com/courses/", description: "掲載元" },
      ],
      instagramUrls: [{ url: "https://www.instagram.com/example/" }],
    },
    legacy: { officialSiteUrls: ["https://example.com/"] },
  };
  const parsed = parseResortLinksMap(JSON.stringify(original));
  assert.deepEqual(parsed.sample.googleMapsUrls, [googleMaps]);
  assert.deepEqual(parsed.sample.mapUrls, [
    { url: "https://example.com/course-map.pdf" },
  ]);
  assert.deepEqual(parsed.sample.mapPageUrls, original.sample.mapPageUrls);
  assert.deepEqual(parsed.legacy.mapPageUrls, []);
  assert.deepEqual(parsed.sample.instagramUrls, original.sample.instagramUrls);
  assert.deepEqual(parsed.legacy.googleMapsUrls, []);
  assert.deepEqual(parseResortLinksMap(JSON.stringify(parsed)), parsed);
});

test("keeps the compact lift_before serialization and matching hash", () => {
  const content = serializeLiftBeforeGeojson({
    type: "FeatureCollection",
    features: [],
  });
  assert.equal(content, '{"type":"FeatureCollection","features":[]}');
  assert.equal(hashContent(content).length, 64);
});
