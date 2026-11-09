import assert from "node:assert/strict";
import test from "node:test";
import { buildLiftChartRows } from "./liftChartRows";

test("buildLiftChartRows groups lifts by type and sums distance per status", () => {
  const rows = buildLiftChartRows([
    { name: "A", type: "ゴンドラ", speed: null, status: "○", distance: 1000 },
    { name: "B", type: "ゴンドラ", speed: null, status: "×", distance: 500 },
    { name: "C", type: "リフト", speed: "高速", status: null, distance: null },
  ]);
  const gondola = rows.find(row => row.label === "ゴンドラ");
  assert.ok(gondola);
  assert.equal(gondola.distance, 1500);
  assert.equal(gondola.statusDistances.open, 1000);
  assert.equal(gondola.statusDistances.closed, 500);
  assert.equal(gondola.summary.total, 2);
  assert.equal(rows.length, 2);
});
