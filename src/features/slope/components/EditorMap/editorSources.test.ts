import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCorrectionMaskCollection,
  buildCorrectionSelectionCollection,
  buildLineCollection,
} from "./editorSources";

test("correction preview masks use the current section statuses and selected interval", () => {
  const lines = [
    {
      id: "course-a",
      name: "コースA",
      kind: "slope" as const,
      coordinates: [
        [0, 0],
        [1, 0],
      ] as [number, number][],
      properties: {
        piste: "○",
        pisteSegments: [
          { from: 0.25, to: 0.5, value: "×" },
          { from: 0.5, to: 0.75, value: "△" },
        ],
      },
    },
  ];
  const masks = buildCorrectionMaskCollection(lines);
  assert.deepEqual(
    masks.features.map(feature => feature.properties?.grooming),
    ["ungroomed", "variable"],
  );
  assert.deepEqual(
    masks.features.map(feature =>
      feature.geometry.type === "LineString"
        ? feature.geometry.coordinates
        : [],
    ),
    [
      [
        [0.25, 0],
        [0.5, 0],
      ],
      [
        [0.5, 0],
        [0.75, 0],
      ],
    ],
  );
  const selected = buildCorrectionSelectionCollection(lines, {
    lineId: "course-a",
    from: 0.25,
    to: 0.75,
  });
  const selectedGeometry = selected.features[0]?.geometry;
  assert.deepEqual(
    selectedGeometry?.type === "LineString" ? selectedGeometry.coordinates : [],
    [
      [0.25, 0],
      [0.75, 0],
    ],
  );
});

test("correction map preview retains stored elevation colors without changing coordinates", () => {
  const coordinates = [
    [0, 0],
    [1, 0],
    [1, 1],
  ] as [number, number][];
  const collection = buildLineCollection(
    [
      {
        id: "course-elevation",
        name: "斜度データあり",
        kind: "slope",
        coordinates,
        properties: {
          _previewCoordinates: [
            [0, 0, 1000],
            [1, 0, 900],
            [1, 1, 700],
          ],
        },
      },
    ],
    null,
    null,
    undefined,
    true,
  );
  assert.equal(collection.features.length, 2);
  assert.ok(
    collection.features.every(
      feature => typeof feature.properties?.previewColor === "string",
    ),
  );
  assert.deepEqual(coordinates, [
    [0, 0],
    [1, 0],
    [1, 1],
  ]);
});
