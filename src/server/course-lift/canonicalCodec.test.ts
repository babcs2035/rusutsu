import assert from "node:assert/strict";
import test from "node:test";
import type { MapCourse } from "@prisma/client";
import {
  entityFeature,
  liftAttributes,
  mapDocumentKind,
  splitDerivedFeature,
  splitFeature,
} from "./canonicalCodec";
import { summarizeOperationEntities } from "./operations";

test("numeric tower counts and construction years survive legacy imports", () => {
  assert.equal(liftAttributes({ towers: 19, year: 1995 }).towers, "19");
  assert.equal(liftAttributes({ towers: 19, year: 1995 }).year, "1995");
  assert.equal(liftAttributes({ towers: "19", year: "1995年" }).year, "1995年");
  assert.equal(liftAttributes({ towers: null, year: null }).year, null);
});

test("course attributes named like lift columns remain round-trippable", () => {
  const split = splitFeature(
    {
      type: "Feature",
      geometry: null,
      properties: { name: "OSM", type: "route" },
    },
    "resorts-temporary/slope_before_osm/sample.geojson",
    0,
  );
  assert.equal(split.properties.type, "route");
});

test("geometry is kept once and map metrics are extracted into numeric columns", () => {
  const feature = {
    type: "Feature" as const,
    properties: {
      entityId: "a",
      name: "A",
      level: "初級",
      distance: 100,
      avg: 10,
      max: 20,
      note: "林間",
      custom: "preserve",
    },
    geometry: {
      type: "LineString",
      coordinates: [
        [140, 43],
        [140.1, 43.1],
      ],
    },
  };
  const base = splitFeature(
    feature,
    "resorts-temporary/slope_before/sample.geojson",
    0,
  );
  assert.equal(base.id, "a");
  assert.equal(base.fields.distance, 100);
  assert.equal(base.properties.name, undefined);
  assert.equal(base.properties.distance, undefined);
  assert.equal(base.metadata.geometry, undefined);
  assert.equal(base.properties.custom, "preserve");
  const derived = splitDerivedFeature(
    {
      ...feature,
      properties: {
        ...feature.properties,
        horizontal_dist_map: 90,
        slope_dist_map: 100,
        elevation_diff_map: 30,
        avg_slope_deg_map: 12,
        max_slope_deg_map: 20,
        slope_deg: [999],
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [140, 43, 1000],
          [140.1, 43.1, 970],
        ],
      },
    },
    0,
  );
  assert.equal(derived.horizontalDistance, 90);
  assert.equal(derived.calculatedMaxSlope, 20);
  assert.equal(derived.elevationReady, true);
  assert.equal(derived.derivedProperties.slope_deg, undefined);
  assert.equal(derived.derivedProperties.horizontal_dist_map, undefined);
  assert.equal(derived.derivedProperties.distance, undefined);
  const row = {
    id: base.id,
    sourceKind: "curated",
    ...base.fields,
    ...derived,
    geometry: base.geometry,
    properties: base.properties,
    featureMetadata: base.metadata,
  } as unknown as MapCourse;
  assert.deepEqual(entityFeature(row).geometry, feature.geometry);
  assert.deepEqual(entityFeature(row, true).geometry, derived.derivedGeometry);
  assert.equal(entityFeature(row, true).properties?.slope_dist_map, 100);
});

const entity = (id: string, status: string | null, options = {}) => ({
  id,
  name: id,
  groupId: id,
  status,
  crawledNames: [id],
  elevationReady: true,
  hasStatusSource: true,
  ...options,
});
test("summary counts mapped logical courses once: 6/9, then unknown/9 on missing data", () => {
  const rows = [
    entity("a1", "○", { groupId: "A" }),
    entity("a2", "×", { groupId: "A" }),
    entity("b1", "○", { groupId: "B" }),
    entity("b2", "×", { groupId: "B" }),
    entity("C", "○"),
    entity("D", "△"),
    entity("E", "○"),
    entity("F", "○"),
    entity("G", "×"),
    entity("H", "×"),
    entity("I", "×"),
    entity("J", "○", { crawledNames: [] }),
    entity("K", "○", { crawledNames: [] }),
  ];
  assert.deepEqual(summarizeOperationEntities(rows, "course", 99), {
    active: 6,
    total: 9,
    source: "mapping",
  });
  const missing = rows.find(row => row.id === "I");
  assert.ok(missing);
  missing.status = null;
  assert.deepEqual(summarizeOperationEntities(rows, "course", 99), {
    active: null,
    total: 9,
    source: "mapping",
  });
});
test("unknown map inventory excludes unnamed lines and deduplicates only explicit groups", () => {
  const rows = [
    entity("a1", null, { groupId: "A" }),
    entity("a2", null, { groupId: "A" }),
    entity("b", null),
    entity("c", null, { name: "b" }),
    entity("無名_1", null),
    entity("名前不明", null),
  ].map(row => ({ ...row, crawledNames: [], hasStatusSource: false }));
  assert.deepEqual(summarizeOperationEntities(rows, "course", 99), {
    active: null,
    total: 3,
    source: "map",
  });
  assert.deepEqual(
    summarizeOperationEntities(
      rows.map(row => ({ ...row, elevationReady: false })),
      "course",
      9,
    ),
    { active: null, total: 9, source: "basic" },
  );
  assert.deepEqual(summarizeOperationEntities([], "course", 0), {
    active: null,
    total: null,
    source: "basic",
  });
});
test("lifts remain separate equipment even if names are equal", () => {
  assert.deepEqual(
    summarizeOperationEntities(
      [
        entity("a", "○", { name: "リフト" }),
        entity("b", "△", { name: "リフト" }),
        entity("c", "×"),
        entity("d", null),
        entity("e", "○", { crawledNames: [] }),
      ],
      "lift",
      99,
    ),
    { active: null, total: 4, source: "mapping" },
  );
});
test("only map, mapping and detail document families are virtualized", () => {
  assert.equal(
    mapDocumentKind("resorts-temporary/slope_10m_osm/sample.geojson")
      ?.primaryKey,
    "resorts-temporary/slope_before_osm/sample.geojson",
  );
  assert.equal(
    mapDocumentKind("resorts-temporary/latest_status_mapping/sample.json")
      ?.mapping,
    true,
  );
  assert.equal(
    mapDocumentKind("resorts-temporary/slope_detail/sample.json")?.detail,
    true,
  );
  assert.equal(
    mapDocumentKind("resorts-temporary/latest_data/sample.json"),
    null,
  );
  assert.equal(mapDocumentKind("reviews/sample/detail.json"), null);
});
