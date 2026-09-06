import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dataDocumentBatchWriteSchema,
  dataDocumentKeySchema,
  dataDocumentPrefixSchema,
  isSafeDataDocumentKey,
  isSafeDataDocumentPrefix,
} from "./contract";

test("accepts canonical src/private/data-relative POSIX keys", () => {
  for (const key of [
    "SkiResortLinks.json",
    "resorts-finalized/courses/rusutsu-resort/current.geojson",
    "日本語/設定.json",
  ]) {
    assert.equal(isSafeDataDocumentKey(key), true, key);
    assert.equal(dataDocumentKeySchema.safeParse(key).success, true, key);
  }
});

test("rejects traversal, absolute, non-canonical, and Windows-style keys", () => {
  for (const key of [
    "",
    "/absolute.json",
    "../secret.json",
    "folder/../secret.json",
    "./file.json",
    "folder//file.json",
    "folder/",
    "folder\\file.json",
    "folder/\u0000.json",
  ]) {
    assert.equal(isSafeDataDocumentKey(key), false, key);
    assert.equal(dataDocumentKeySchema.safeParse(key).success, false, key);
  }
});

test("allows an empty or directory-style prefix but rejects unsafe prefixes", () => {
  for (const prefix of ["", "lift-ticket", "lift-ticket/"]) {
    assert.equal(isSafeDataDocumentPrefix(prefix), true, prefix);
    assert.equal(dataDocumentPrefixSchema.safeParse(prefix).success, true);
  }
  for (const prefix of ["/", "../", "folder//", "folder\\"]) {
    assert.equal(isSafeDataDocumentPrefix(prefix), false, prefix);
    assert.equal(dataDocumentPrefixSchema.safeParse(prefix).success, false);
  }
});

test("requires expectedHash and rejects duplicate keys in one batch", () => {
  const missingExpectedHash = dataDocumentBatchWriteSchema.safeParse({
    documents: [
      {
        key: "sample.json",
        content: "{}",
        mediaType: "application/json",
      },
    ],
  });
  assert.equal(missingExpectedHash.success, false);

  const duplicate = dataDocumentBatchWriteSchema.safeParse({
    documents: [
      {
        key: "sample.json",
        content: "{}",
        mediaType: "application/json",
        expectedHash: null,
      },
      {
        key: "sample.json",
        content: '{"changed":true}',
        mediaType: "application/json",
        expectedHash: "a".repeat(64),
      },
    ],
  });
  assert.equal(duplicate.success, false);
});

test("rejects malformed JSON and mismatched file media types", () => {
  for (const document of [
    {
      key: "sample.json",
      content: "{broken",
      mediaType: "application/json",
      expectedHash: null,
    },
    {
      key: "sample.json",
      content: "{}",
      mediaType: "text/plain",
      expectedHash: null,
    },
    {
      key: "sample.geojson",
      content: "{}",
      mediaType: "application/geo+json",
      expectedHash: null,
    },
  ]) {
    assert.equal(
      dataDocumentBatchWriteSchema.safeParse({ documents: [document] }).success,
      false,
    );
  }
});

test("accepts structured JSON and valid GeoJSON FeatureCollections", () => {
  const result = dataDocumentBatchWriteSchema.safeParse({
    documents: [
      {
        key: "sample.json",
        content: '{"value":true}',
        mediaType: "application/json",
        expectedHash: null,
      },
      {
        key: "sample.geojson",
        content: JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { name: "A" },
              geometry: {
                type: "LineString",
                coordinates: [
                  [139, 35],
                  [139.1, 35.1],
                ],
              },
            },
          ],
        }),
        mediaType: "application/geo+json",
        expectedHash: null,
      },
    ],
  });
  assert.equal(result.success, true);
});

test("rejects invalid GeoJSON geometry types, coordinate values, and unclosed rings", () => {
  for (const geometry of [
    { type: "Unknown", coordinates: [] },
    { type: "Point", coordinates: ["139", 35] },
    { type: "LineString", coordinates: [[139, 35]] },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    },
  ]) {
    const result = dataDocumentBatchWriteSchema.safeParse({
      documents: [
        {
          key: "map.geojson",
          mediaType: "application/geo+json",
          content: JSON.stringify({
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry }],
          }),
          expectedHash: null,
        },
      ],
    });
    assert.equal(result.success, false);
  }
});
