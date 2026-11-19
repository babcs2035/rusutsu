import assert from "node:assert/strict";
import test from "node:test";
import { withMapElevation } from "./resortElevation";

const resort = {
  id: "resort-1",
  topElevation: 994,
  baseElevation: 400,
  verticalDrop: 593,
};

test("map elevation replaces source values and derives the vertical drop", () => {
  assert.deepEqual(withMapElevation(resort, { top: 990, base: 422 }), {
    id: "resort-1",
    topElevation: 990,
    baseElevation: 422,
    verticalDrop: 568,
  });
});

test("source values stay when the map has no elevation", () => {
  assert.equal(withMapElevation(resort, null), resort);
  assert.equal(withMapElevation(resort, undefined), resort);
  assert.equal(withMapElevation(resort, { top: 400, base: 400 }), resort);
});
