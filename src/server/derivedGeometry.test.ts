import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { getResortMapDataFromRoots } from "@/lib/finalizedResortGeojson";
import {
  type LineGeojsonFeature,
  type LineGeojsonFeatureCollection,
  synchronizeDerivedGeometry,
} from "./derivedGeometry";

const line = (
  name: string,
  coordinates: number[][],
  properties: Record<string, unknown> = {},
): LineGeojsonFeature => ({
  type: "Feature",
  properties: { name, ...properties },
  geometry: { type: "LineString", coordinates },
});

const collection = (
  features: LineGeojsonFeature[],
): LineGeojsonFeatureCollection => ({
  type: "FeatureCollection",
  features,
});

test("unchanged lines keep elevations and metrics while order and deletions follow before", () => {
  const previousBefore = collection([
    line("Alpha", [
      [139, 35],
      [139.001, 35],
    ]),
    line(
      "Bravo",
      [
        [140, 36],
        [140.001, 36],
      ],
      { "@id": "way/2" },
    ),
    line("Deleted", [
      [141, 37],
      [141.001, 37],
    ]),
  ]);
  const existingDerived = collection([
    line(
      "Bravo",
      [
        [140, 36, 500],
        [140.001, 36, 600],
      ],
      {
        "@id": "way/2",
        horizontal_dist_map: 90,
        slope_dist_map: 135,
        elevation_diff_map: 100,
      },
    ),
    line(
      "Alpha",
      [
        [139, 35, 1000],
        [139.001, 35, 900],
      ],
      { horizontal_dist_map: 91, avg_slope_deg_map: 12.5 },
    ),
    line(
      "Deleted",
      [
        [141, 37, 700],
        [141.001, 37, 650],
      ],
      { horizontal_dist_map: 88 },
    ),
  ]);
  const nextBefore = collection([
    line(
      "Bravo renamed",
      [
        [140, 36],
        [140.001, 36],
      ],
      { "@id": "way/2", level: "中級" },
    ),
    line(
      "Alpha",
      [
        [139, 35],
        [139.001, 35],
      ],
      { level: "初級" },
    ),
  ]);

  const result = synchronizeDerivedGeometry({
    previousBefore,
    nextBefore,
    existingDerived,
    intervalM: 10,
    kind: "slope",
  });

  assert.deepEqual(
    result.features.map(feature => feature.properties?.name),
    ["Bravo renamed", "Alpha"],
  );
  assert.deepEqual(result.features[0]?.geometry?.coordinates, [
    [140, 36, 500],
    [140.001, 36, 600],
  ]);
  assert.equal(result.features[0]?.properties?.slope_dist_map, 135);
  assert.equal(result.features[0]?.properties?.level, "中級");
  assert.deepEqual(result.features[1]?.geometry?.coordinates, [
    [139, 35, 1000],
    [139.001, 35, 900],
  ]);
  assert.equal(result.features[1]?.properties?.avg_slope_deg_map, 12.5);
});

test("changed, new, and ambiguous lines become freshly sampled 2D geometry", () => {
  const previousBefore = collection([
    line("Changed", [
      [139, 35],
      [139.001, 35],
    ]),
    line("Duplicate", [
      [140, 36],
      [140.001, 36],
    ]),
    line("Duplicate", [
      [141, 37],
      [141.001, 37],
    ]),
  ]);
  const existingDerived = collection([
    line(
      "Changed",
      [
        [139, 35, 500],
        [139.001, 35, 450],
      ],
      { slope_dist_map: 100, elevation_diff_map: 50 },
    ),
    line(
      "Duplicate",
      [
        [140, 36, 900],
        [140.001, 36, 800],
      ],
      { slope_dist_map: 140 },
    ),
  ]);
  const nextBefore = collection([
    line(
      "Changed",
      [
        [139, 35],
        [139.002, 35],
      ],
      { slope_dist_map: 999, elevation_diff_map: 999 },
    ),
    line("New", [
      [142, 38],
      [142.001, 38],
    ]),
    line("Duplicate", [
      [140, 36],
      [140.001, 36],
    ]),
  ]);

  const result = synchronizeDerivedGeometry({
    previousBefore,
    nextBefore,
    existingDerived,
    intervalM: 10,
    kind: "slope",
  });

  assert.equal(result.features.length, 3);
  for (const feature of result.features) {
    const coordinates = feature.geometry?.coordinates;
    assert.ok(Array.isArray(coordinates));
    assert.equal(
      coordinates.every(point => Array.isArray(point) && point.length === 2),
      true,
    );
    assert.equal("slope_dist_map" in (feature.properties ?? {}), false);
    assert.equal("elevation_diff_map" in (feature.properties ?? {}), false);
    assert.ok(Number(feature.properties?.horizontal_dist_map) > 80);
  }
  const changedCoordinates = result.features[0]?.geometry?.coordinates;
  assert.ok(Array.isArray(changedCoordinates));
  assert.ok(changedCoordinates.length >= 18);
});

test("a stale or identifier-conflicting derived line is never reused", () => {
  const currentBefore = collection([
    line(
      "Same name",
      [
        [139, 35],
        [139.002, 35],
      ],
      { "@id": "way/new" },
    ),
  ]);
  const staleDerived = collection([
    line(
      "Same name",
      [
        [140, 36, 700],
        [140.002, 36, 600],
      ],
      {
        "@id": "way/new",
        horizontal_dist_map: 180,
        slope_dist_map: 220,
      },
    ),
  ]);

  const result = synchronizeDerivedGeometry({
    previousBefore: currentBefore,
    nextBefore: currentBefore,
    existingDerived: staleDerived,
    intervalM: 10,
    kind: "slope",
  });

  const coordinates = result.features[0]?.geometry?.coordinates;
  assert.ok(Array.isArray(coordinates));
  assert.deepEqual(coordinates[0], [139, 35]);
  assert.equal(
    "slope_dist_map" in (result.features[0]?.properties ?? {}),
    false,
  );

  const conflictingIdentifier = collection([
    line(
      "Same name",
      [
        [139, 35, 700],
        [139.002, 35, 600],
      ],
      {
        "@id": "way/other",
        horizontal_dist_map: 182,
        slope_dist_map: 220,
      },
    ),
  ]);
  const conflictResult = synchronizeDerivedGeometry({
    previousBefore: currentBefore,
    nextBefore: currentBefore,
    existingDerived: conflictingIdentifier,
    intervalM: 10,
    kind: "slope",
  });
  const conflictCoordinates = conflictResult.features[0]?.geometry?.coordinates;
  assert.ok(Array.isArray(conflictCoordinates));
  assert.equal(
    conflictCoordinates.every(point => point.length === 2),
    true,
  );
});

test("lift midstation elevation is kept only when its horizontal position is unchanged", () => {
  const previousBefore = collection([
    line(
      "Lift",
      [
        [139, 35],
        [139.001, 35],
      ],
      { "@id": "way/10", midstation: [139.0005, 35] },
    ),
  ]);
  const existingDerived = collection([
    line(
      "Lift",
      [
        [139, 35, 500],
        [139.001, 35, 600],
      ],
      { "@id": "way/10", midstation: [139.0005, 35, 550] },
    ),
  ]);

  const unchanged = synchronizeDerivedGeometry({
    previousBefore,
    nextBefore: previousBefore,
    existingDerived,
    intervalM: 20,
    kind: "lift",
  });
  assert.deepEqual(
    unchanged.features[0]?.properties?.midstation,
    [139.0005, 35, 550],
  );

  const movedMidstation = collection([
    line(
      "Lift",
      [
        [139, 35],
        [139.001, 35],
      ],
      { "@id": "way/10", midstation: [139.0006, 35] },
    ),
  ]);
  const changed = synchronizeDerivedGeometry({
    previousBefore,
    nextBefore: movedMidstation,
    existingDerived,
    intervalM: 20,
    kind: "lift",
  });
  assert.deepEqual(changed.features[0]?.properties?.midstation, [139.0006, 35]);
});

test("public resort reader immediately uses the synchronized derived documents", async () => {
  const resortId = "sync-resort";
  const oldBefore = collection([
    line("Old course", [
      [139, 35],
      [139.001, 35],
    ]),
  ]);
  const oldDerived = collection([
    line(
      "Old course",
      [
        [139, 35, 500],
        [139.001, 35, 450],
      ],
      { level: "中級", avg_slope_deg_map: 15 },
    ),
  ]);
  const nextBefore = collection([
    line(
      "New course",
      [
        [140, 36],
        [140.002, 36],
      ],
      { level: "初級" },
    ),
  ]);
  const nextDerived = synchronizeDerivedGeometry({
    previousBefore: oldBefore,
    nextBefore,
    existingDerived: oldDerived,
    intervalM: 10,
    kind: "slope",
  });
  const oldLiftBefore = collection([
    line(
      "Old lift",
      [
        [139, 35],
        [139.001, 35],
      ],
      { "@id": "way/lift" },
    ),
  ]);
  const oldLiftDerived = collection([
    line(
      "Old lift",
      [
        [139, 35, 400],
        [139.001, 35, 500],
      ],
      { "@id": "way/lift", type: "リフト", slope_dist_map: 130 },
    ),
  ]);
  const nextLiftBefore = collection([
    line(
      "New lift",
      [
        [141, 37],
        [141.002, 37],
      ],
      { "@id": "way/lift", type: "リフト" },
    ),
  ]);
  const nextLiftDerived = synchronizeDerivedGeometry({
    previousBefore: oldLiftBefore,
    nextBefore: nextLiftBefore,
    existingDerived: oldLiftDerived,
    intervalM: 20,
    kind: "lift",
  });

  const temporaryRoot = path.resolve("/virtual/resorts-temporary");
  const documents = new Map<string, string>([
    [
      path.join(temporaryRoot, "slope_before", `${resortId}.geojson`),
      JSON.stringify(nextBefore),
    ],
    [
      path.join(temporaryRoot, "slope_10m", `${resortId}.geojson`),
      JSON.stringify(nextDerived),
    ],
    [
      path.join(temporaryRoot, "lift_before", `${resortId}.geojson`),
      JSON.stringify(nextLiftBefore),
    ],
    [
      path.join(temporaryRoot, "lift_20m", `${resortId}.geojson`),
      JSON.stringify(nextLiftDerived),
    ],
  ]);
  const data = await getResortMapDataFromRoots(resortId, {
    temporaryRoot,
    documentLoader: async absoluteFilePath =>
      documents.get(absoluteFilePath) ?? null,
    latestStatusLoader: async () => null,
  });

  assert.equal(data?.courses?.source, "slope_10m");
  assert.deepEqual(
    data?.courses?.features.map(feature => feature.name),
    ["New course"],
  );
  assert.deepEqual(
    data?.courses?.features[0]?.coordinates.at(-1),
    [140.002, 36],
  );
  assert.equal(
    data?.courses?.features[0]?.coordinates.every(
      coordinate => coordinate.length === 2,
    ),
    true,
  );
  assert.equal(data?.lifts?.source, "lift_20m");
  assert.deepEqual(
    data?.lifts?.features.map(feature => feature.name),
    ["New lift"],
  );
  assert.deepEqual(data?.lifts?.features[0]?.coordinates.at(-1), [141.002, 37]);
  assert.ok((data?.lifts?.features[0]?.coordinates.length ?? 0) >= 9);
  assert.ok((data?.lifts?.features[0]?.coordinates.length ?? 0) <= 11);
  assert.equal(
    data?.lifts?.features[0]?.coordinates.every(
      coordinate => coordinate.length === 2,
    ),
    true,
  );
});
