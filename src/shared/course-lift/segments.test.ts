import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePropertySegments,
  propertyAt,
  sliceLineByFraction,
} from "./segments";

test("property sections are independent, reject overlap, and never change physical input vertices", () => {
  const coords = [
    [140, 43, 1000],
    [140.01, 43, 700],
    [140.02, 43, 500],
  ];
  const original = structuredClone(coords);
  const piste = normalizePropertySegments([
    { from: 0, to: 0.5, value: "○" },
    { from: 0.5, to: 1, value: "×" },
  ]);
  const night = normalizePropertySegments(
    [
      { from: 0, to: 0.75, value: "×" },
      { from: 0.75, to: 1, value: "○" },
    ],
    false,
  );
  assert.equal(propertyAt(piste, 0.6, null), "×");
  assert.equal(propertyAt(night, 0.6, null), "×");
  assert.equal(propertyAt(night, 0.9, null), "○");
  const slice = sliceLineByFraction(coords, 0.25, 0.75);
  const expected = [
    [140.005, 43, 850],
    [140.01, 43, 700],
    [140.015, 43, 600],
  ];
  for (const [i, point] of slice.entries())
    for (const [j, value] of point.entries())
      assert.ok(Math.abs(value - expected[i][j]) < 1e-8);
  assert.deepEqual(coords, original);
  assert.deepEqual(
    normalizePropertySegments([
      { from: 0, to: 0.6, value: "○" },
      { from: 0.5, to: 1, value: "×" },
    ]),
    [],
  );
  assert.deepEqual(
    normalizePropertySegments([{ from: 0, to: 1, value: "△" }], false),
    [],
  );
});
