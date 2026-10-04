import assert from "node:assert/strict";
import { test } from "node:test";
import { courseLinesFromDocuments } from "./mapContext";

test("全体地図用にコースの線を抽出する", () => {
  const documents = [
    {
      content: JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            properties: { name: "第1コース" },
            geometry: {
              type: "LineString",
              coordinates: [
                [138.1, 36.8, 1000],
                [138.2, 36.9, 900],
              ],
            },
          },
          {
            properties: { name: "連絡コース" },
            geometry: {
              type: "MultiLineString",
              coordinates: [
                [
                  [138.2, 36.9],
                  [138.3, 37],
                ],
                [
                  [138.4, 37],
                  [138.5, 37.1],
                ],
              ],
            },
          },
          {
            properties: { name: "不完全" },
            geometry: { type: "LineString", coordinates: [[138.1, 36.8]] },
          },
        ],
      }),
    },
  ];
  assert.deepEqual(courseLinesFromDocuments(documents), [
    {
      name: "第1コース",
      coordinates: [
        [138.1, 36.8],
        [138.2, 36.9],
      ],
    },
    {
      name: "連絡コース",
      coordinates: [
        [138.2, 36.9],
        [138.3, 37],
      ],
    },
    {
      name: "連絡コース",
      coordinates: [
        [138.4, 37],
        [138.5, 37.1],
      ],
    },
  ]);
});
