import assert from "node:assert/strict";
import { test } from "node:test";
import type { SaveRequest } from "@/features/slope/types";
import type { EditPlan } from "@/server/edit-requests/contract";
import {
  candidateCourseId,
  updateCandidateCourse,
  updateCourseProperty,
} from "./slopeCandidate";
import { buildSlopeReview } from "./slopeReview";

const key = "resorts-temporary/slope_before/example.geojson";
const course = (
  entityId: string,
  name: string,
  x: number,
  extra: Record<string, unknown> = {},
) => ({
  type: "Feature",
  properties: { entityId, name, level: "初級", ...extra },
  geometry: {
    type: "LineString",
    coordinates: [
      [x, 36],
      [x + 0.01, 36.01],
    ],
  },
});
const document = (features: ReturnType<typeof course>[]) => ({
  key,
  content: JSON.stringify({ type: "FeatureCollection", features }),
  mediaType: "application/geo+json",
  expectedHash: null,
});

test("course review lists added, removed and changed courses by identity", () => {
  const plan = {
    documents: [
      document([
        course("b", "Bコース", 138.2),
        course("a", "Aコース", 138.1, { level: "中級", maxWidth: "" }),
        course("c", "Cコース", 138.3),
      ]),
    ],
    beforeDocuments: [
      {
        key,
        document: {
          key,
          content: document([
            course("a", "Aコース", 138.1, { osmTag: "x" }),
            course("b", "Bコース", 138.2),
            course("d", "Dコース", 138.4),
          ]).content,
          hash: "h",
        },
      },
    ],
  } as unknown as EditPlan;
  const review = buildSlopeReview(plan);
  const byId = new Map(review.items.map(item => [item.id, item]));
  assert.equal(byId.get("a")?.status, "changed");
  assert.equal(byId.get("b")?.status, "unchanged");
  assert.equal(byId.get("c")?.status, "added");
  assert.equal(byId.get("d")?.status, "removed");
  assert.equal(review.orderChanged, true);
  const level = byId.get("a")?.fields.find(field => field.key === "level");
  assert.deepEqual(
    [level?.before, level?.after, level?.changed],
    ["初級", "中級", true],
  );
  // 空欄のまま追加された保存用の項目は変更として扱わない
  assert.equal(
    byId.get("a")?.fields.some(field => field.key === "maxWidth"),
    false,
  );
  // 削除された OSM タグのような未知の項目は、変更があるときだけ出す
  assert.equal(
    byId.get("a")?.fields.some(field => field.key === "osmTag"),
    true,
  );
});

test("course candidate edits keep properties, detail and mapping aligned", () => {
  const candidate: SaveRequest = {
    resortId: "example",
    sourceKind: "curated",
    fileHash: null,
    detailFileHash: null,
    preservedFeatures: [],
    preservedDetails: [],
    courses: [
      {
        targetSkiId: "example",
        properties: { entityId: "a", name: "A" },
        coordinates: [
          [138, 36],
          [138.1, 36.1],
        ],
        detail: { entityId: "a", name: "A" },
      },
    ],
    mapping: {
      resortId: "example",
      kind: "courses",
      latestFile: "latest.json",
      mappingFileHash: null,
      rows: [{ geometryId: "a", geojsonName: "A", crawledName: "Aコース" }],
    },
  };
  const id = candidateCourseId(candidate, candidate.courses[0], 0);
  const renamed = updateCandidateCourse(candidate, id, course =>
    updateCourseProperty(
      updateCourseProperty(course, "name", "A改"),
      "max",
      "28",
    ),
  );
  assert.equal(renamed.courses[0].properties.name, "A改");
  assert.equal(renamed.courses[0].detail.max, 28);
  assert.equal(renamed.mapping?.rows[0].geojsonName, "A改");
});
