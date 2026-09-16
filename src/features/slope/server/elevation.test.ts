import assert from "node:assert/strict";
import { test } from "node:test";
import type { SlopeBeforeGeojson } from "../types";
import { enrichSlopeElevations } from "./elevation";

const source = (): SlopeBeforeGeojson => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        name: "テストコース",
        difficulty: "easy",
        slope_deg: [999],
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [139, 35],
          [139.001, 35],
        ],
      },
    },
  ],
});

test("低所始点でも高所から10m間隔の3D線と距離・斜度を生成する", async () => {
  const input = source();
  const original = structuredClone(input);
  const result = await enrichSlopeElevations(
    input,
    async lon => 100 + (lon - 139) * 100_000,
  );
  const feature = result.features[0];
  const points = feature.geometry?.coordinates as number[][];
  assert.equal(points.length, 11);
  assert.ok(Math.abs(points[0][2] - 200) < 0.001);
  assert.equal(points.at(-1)?.[2], 100);
  assert.ok(points.every(point => point.length === 3));
  assert.equal(feature.properties?.elevation_diff_map, 100);
  assert.equal(feature.properties?.horizontal_dist_map, 91);
  assert.equal(feature.properties?.slope_dist_map, 135);
  assert.equal(feature.properties?.avg_slope_deg_map, 36.4);
  assert.equal(feature.properties?.max_slope_deg_map, 47.6);
  assert.equal(feature.properties?.difficulty, "easy");
  assert.equal(feature.properties?.slope_deg, undefined);
  assert.deepEqual(input, original);
});

test("短い平坦線は斜度0になり、毎回標高を取得する", async () => {
  const input = source();
  input.features[0].geometry = {
    type: "LineString",
    coordinates: [
      [139, 35, 123],
      [139.00001, 35, 123],
    ],
  };
  let calls = 0;
  const lookup = async () => {
    calls++;
    return 500;
  };
  const first = await enrichSlopeElevations(input, lookup);
  await enrichSlopeElevations(input, lookup);
  assert.equal(calls, 4);
  assert.equal(first.features[0].properties?.avg_slope_deg_map, 0);
  assert.equal(first.features[0].properties?.max_slope_deg_map, 0);
});

test("取得失敗時は入力の保存済みGeoJSONを変更しない", async () => {
  const input = source();
  const original = structuredClone(input);
  await assert.rejects(
    enrichSlopeElevations(input, async () => {
      throw new Error("取得失敗");
    }),
    /取得失敗/,
  );
  assert.deepEqual(input, original);
});

test("屈曲線でもdistance_10m.pyの計算値と一致する", async () => {
  const input = source();
  input.features[0].geometry = {
    type: "LineString",
    coordinates: [
      [139, 35],
      [139.0005, 35.0005],
      [139.001, 35],
    ],
  };
  const result = await enrichSlopeElevations(
    input,
    async lon => 100 + (lon - 139) * 100_000,
  );
  const properties = result.features[0].properties;
  // distance_10m.py の build_feature に同じ標高関数を渡して得た値。
  assert.equal(properties?.horizontal_dist_map, 143);
  assert.equal(properties?.slope_dist_map, 175);
  assert.equal(properties?.elevation_diff_map, 100);
  assert.equal(properties?.avg_slope_deg_map, 29.7);
  assert.equal(properties?.max_slope_deg_map, 36.2);
  assert.ok(result.features[0].geometry);
  assert.equal(
    (result.features[0].geometry.coordinates as number[][]).length,
    16,
  );
});
