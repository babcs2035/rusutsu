import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import {
  getResortMapDataFromRoots,
  TEMPORARY_RESORTS_ROOT,
} from "@/lib/finalizedResortGeojson";
import { hashDataDocumentContent } from "@/server/data-documents/repositoryCore";
import {
  buildMergedGeometryDocuments,
  ensureMergedGeometryDocuments,
} from "./mergeGeometry";

const sourceDocument = (
  folder: string,
  id: string,
  properties: object,
  elevation = false,
) => ({
  key: `resorts-temporary/${folder}/${id}.geojson`,
  content: JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties,
        geometry: {
          type: "LineString",
          coordinates: elevation
            ? [
                [138, 36, 2000],
                [138.01, 36.01, 1800],
              ]
            : [
                [138, 36],
                [138.01, 36.01],
              ],
        },
      },
    ],
  }),
});

test("existing destination geometry is preserved without reading source documents or writing", async () => {
  let reads = 0;
  await ensureMergedGeometryDocuments(
    {
      dataDocument: {
        findMany: async () => {
          assert.equal(++reads, 1);
          return [{ key: "resorts-temporary/slope_before/merged.geojson" }];
        },
        createMany: async () => {
          assert.fail("Existing documents must not be overwritten");
        },
      },
      canonicalDataMigration: { findUnique: async () => null },
    } as unknown as Parameters<typeof ensureMergedGeometryDocuments>[0],
    "merged",
    [{ id: "area-a", nameJa: "Aエリア" }],
  );
  assert.equal(reads, 1);
});

test("materialized geometry displays from the destination alone, retaining basic data and elevation", async () => {
  const documents = await buildMergedGeometryDocuments(
    "merged",
    [
      { id: "area-a", nameJa: "Aエリア" },
      { id: "area-b", nameJa: "Bエリア" },
    ],
    [
      sourceDocument("slope_before", "area-a", { name: "中央_上部" }),
      sourceDocument(
        "slope_10m",
        "area-a",
        { name: "中央_上部", horizontal_dist_map: 1500 },
        true,
      ),
      {
        key: "resorts-temporary/slope_detail/area-a.json",
        content: JSON.stringify([
          {
            name: "中央_上部",
            level: "初級",
            piste: "○",
            snowboard: "○",
            searchWord: "中央",
          },
        ]),
      },
      sourceDocument("slope_before", "area-b", {
        name: "中央_上部",
        level: "上級",
        status: "○",
        update: "old",
      }),
      sourceDocument("lift_before", "area-b", {
        name: "第1リフト",
        capacity: 4,
      }),
      sourceDocument("slope_before_osm", "area-b", { name: "未確認コース" }),
    ],
  );
  for (const document of documents) {
    assert.equal(document.hash, hashDataDocumentContent(document.content));
    assert.equal(document.version, 1);
    for (const feature of JSON.parse(document.content).features) {
      assert.equal(feature.properties.status, undefined);
      assert.equal(feature.properties.update, undefined);
    }
  }
  const byKey = new Map(
    documents.map(document => [document.key, document.content]),
  );
  assert.equal(byKey.has("resorts-temporary/lift_20m/merged.geojson"), false);
  const before = JSON.parse(
    byKey.get("resorts-temporary/slope_before/merged.geojson") ?? "{}",
  );
  assert.equal(before.features[0].geometry.coordinates[0].length, 2);
  const map = await getResortMapDataFromRoots("merged", {
    temporaryRoot: TEMPORARY_RESORTS_ROOT,
    documentLoader: async file => {
      assert.match(file, /merged\.\w+$/);
      return (
        byKey.get(path.relative(path.dirname(TEMPORARY_RESORTS_ROOT), file)) ??
        null
      );
    },
    latestStatusLoader: async () => null,
  });
  assert.equal(map?.courses?.features.length, 3);
  assert.equal(map?.lifts?.features.length, 1);
  const courses = map?.courses?.features ?? [];
  assert.equal(courses[0].properties.level, "初級");
  assert.equal(courses[0].coordinates[0][2], 2000);
  assert.equal(courses[0].properties.horizontalDistMap, 1500);
  assert.equal(courses[1].properties.level, "上級");
  assert.notEqual(courses[0].groupId, courses[1].groupId);
  assert.equal(courses[2].verificationStatus, "unverified");
  assert.equal(map?.lifts?.features[0].properties.capacity, 4);
});

test("missing source geometry does not create empty documents", async () => {
  assert.deepEqual(
    await buildMergedGeometryDocuments(
      "merged",
      [{ id: "missing", nameJa: "データなし" }],
      [],
    ),
    [],
  );
});

test("new destination documents are saved through the caller's transaction", async () => {
  let reads = 0;
  let writes = 0;
  await ensureMergedGeometryDocuments(
    {
      dataDocument: {
        findMany: async () =>
          ++reads === 1
            ? []
            : [
                sourceDocument("lift_before", "area-a", {
                  name: "第1リフト",
                  capacity: 2,
                }),
              ],
        createMany: async ({
          data,
        }: {
          data: { key: string; content: string }[];
        }) => {
          writes++;
          assert.deepEqual(
            data.map(document => document.key),
            ["resorts-temporary/lift_before/merged.geojson"],
          );
          assert.equal(
            JSON.parse(data[0].content).features[0].properties.name,
            "第1リフト",
          );
          return { count: data.length };
        },
      },
      canonicalDataMigration: { findUnique: async () => null },
    } as unknown as Parameters<typeof ensureMergedGeometryDocuments>[0],
    "merged",
    [{ id: "area-a", nameJa: "Aエリア" }],
  );
  assert.equal(reads, 2);
  assert.equal(writes, 1);
});
