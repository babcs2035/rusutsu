import assert from "node:assert/strict";
import { test } from "node:test";
import type { EditPlan } from "@/server/edit-requests/contract";
import { featureIdentity } from "@/shared/course-lift/identity";
import { buildLiftReview } from "./liftReview";

const key = "resorts-temporary/lift_before/myoko-suginohara.geojson";
const mappingKey =
  "resorts-temporary/latest_status_mapping/myoko-suginohara.json";
const feature = (name: string, x: number, entityId?: string) => ({
  type: "Feature",
  properties: { name, ...(entityId ? { entityId } : {}) },
  geometry: {
    type: "LineString",
    coordinates: [
      [x, 36],
      [x + 0.01, 36.01],
    ],
  },
});
const document = (features: ReturnType<typeof feature>[]) =>
  JSON.stringify({ type: "FeatureCollection", features });

const oldA = feature("三田原第3高速リフト", 138.1);
const oldB = feature("A杉ノ原ゴンドラ", 138.2);
const idA = featureIdentity(oldA.properties, key, 0);
const idB = featureIdentity(oldB.properties, key, 1);
const plan = {
  documents: [
    {
      key,
      content: document([
        feature("A杉ノ原ゴンドラ", 138.2, idB),
        feature("三田原第3高速リフト", 138.1, idA),
      ]),
      mediaType: "application/geo+json",
      expectedHash: null,
    },
    {
      key: mappingKey,
      content: JSON.stringify({
        version: 1,
        lifts: {
          sourceFile: "db-example.json",
          updatedAt: "2026-10-02T16:08:18Z",
          rows: [
            {
              geometryId: idB,
              crawledName: "A杉ノ原ゴンドラ",
              geojsonName: "A杉ノ原ゴンドラ",
            },
          ],
        },
      }),
      mediaType: "application/json",
      expectedHash: null,
    },
  ],
  beforeDocuments: [
    {
      key,
      document: { content: document([oldA, oldB]), hash: "hash", version: 1 },
    },
    { key: mappingKey, document: null },
  ],
  resort: null,
  ticket: null,
  elevations: [],
} as EditPlan;

test("リフトの並び替えを別リフトの改名として表示しない", () => {
  const review = buildLiftReview(plan);
  const gondola = review.items.find(item => item.id === idB);
  assert.equal(gondola?.name, "A杉ノ原ゴンドラ");
  assert.equal(
    gondola?.fields.find(field => field.key === "name")?.changed,
    false,
  );
  assert.equal(gondola?.mappingChanged, true);
  assert.equal(gondola?.geometryChanged, false);
  assert.equal(review.orderChanged, true);
  const lift = review.items.find(item => item.id === idA);
  assert.equal(lift?.status, "unchanged");
});

test("固定IDで同じリフトの設備と位置の変更をまとめる", () => {
  const next = structuredClone(plan);
  const gondola = feature("A杉ノ原ゴンドラ", 138.3, idB);
  gondola.properties = {
    ...gondola.properties,
    aerialway: "gondola",
  } as typeof gondola.properties;
  next.documents[0].content = document([
    gondola,
    feature("三田原第3高速リフト", 138.1, idA),
  ]);
  const review = buildLiftReview(next);
  const item = review.items.find(row => row.id === idB);
  assert.equal(item?.status, "changed");
  assert.equal(item?.geometryChanged, true);
  assert.equal(
    item?.fields.find(field => field.key === "name")?.changed,
    false,
  );
  assert.equal(
    item?.fields.find(field => field.key === "aerialway")?.after,
    "ゴンドラ",
  );
});
