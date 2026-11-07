import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type GeoCoordinate,
  resolveLiftMidstation,
} from "./finalizedResortGeojsonShared";

const line: GeoCoordinate[] = [
  [138.92, 36.74, 900],
  [138.93, 36.745, 1100],
  [138.94, 36.75, 1300],
];

test("中間駅を線上の [経度, 緯度] に寄せる", () => {
  const result = resolveLiftMidstation([138.93, 36.7452, 1100], line);
  assert.ok(result);
  assert.ok(Math.abs(result[0] - 138.93) < 0.0002);
  assert.ok(Math.abs(result[1] - 36.745) < 0.0002);
});

test("緯度と経度が逆の値も読める", () => {
  const result = resolveLiftMidstation([36.745, 138.93], line);
  assert.ok(result);
  assert.ok(Math.abs(result[0] - 138.93) < 0.0002);
});

test("線から離れた値・端点・空の値は捨てる", () => {
  assert.equal(resolveLiftMidstation([138.93, 36.76], line), null);
  assert.equal(resolveLiftMidstation([138.92, 36.74], line), null);
  assert.equal(resolveLiftMidstation(null, line), null);
  assert.equal(resolveLiftMidstation("", line), null);
});
