import assert from "node:assert/strict";
import { test } from "node:test";
import { synchronizeDerivedGeometry } from "@/server/derivedGeometry";
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

test("明示的な全件再取得では既存標高を置換し、平坦線は斜度0になる", async () => {
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

for (const legacy of [false, true]) {
  test(`保存済みの逆向きコースも再取得せず、属性・並び順を更新する（旧形式=${legacy}）`, async () => {
    const before = source();
    const existing = await enrichSlopeElevations(
      before,
      async lon => (lon - 139) * 100_000,
    );
    if (legacy) delete existing.features[0].properties?._source_line_sha256;
    const next = structuredClone(before);
    assert.ok(next.features[0].properties);
    next.features[0].properties.difficulty = "hard";
    next.features[0].properties.name = "改名コース";
    const synced = synchronizeDerivedGeometry({
      previousBefore: before,
      nextBefore: next,
      existingDerived: existing,
      intervalM: 10,
      kind: "slope",
    });
    const result = await enrichSlopeElevations(
      next,
      async () => {
        throw new Error("再取得禁止");
      },
      synced,
    );
    assert.deepEqual(
      result.features[0].geometry,
      existing.features[0].geometry,
    );
    assert.equal(result.features[0].properties?.difficulty, "hard");
    assert.equal(
      result.features[0].properties?.slope_dist_map,
      existing.features[0].properties?.slope_dist_map,
    );
  });
}

test("複数コースの保存は位置変更・新規・標高欠損のみ取得し、標高データがなければ全件取得する", async () => {
  const before = source();
  before.features = [0, 1, 2].map(index => ({
    ...structuredClone(before.features[0]),
    properties: { name: `コース${index}` },
    geometry: {
      type: "LineString",
      coordinates: [
        [139, 35 + index],
        [139.001, 35 + index],
      ],
    },
  }));
  const existing = await enrichSlopeElevations(before, async () => 0);
  assert.ok(existing.features[2].geometry);
  (existing.features[2].geometry.coordinates as number[][])[0].pop();
  const next = structuredClone(before);
  assert.ok(next.features[1].geometry);
  (next.features[1].geometry.coordinates as number[][])[1][0] += 0.001;
  next.features.push({
    ...structuredClone(next.features[0]),
    properties: { name: "新規" },
    geometry: {
      type: "LineString",
      coordinates: [
        [139, 38],
        [139.001, 38],
      ],
    },
  });
  next.features.reverse();
  const synced = synchronizeDerivedGeometry({
    previousBefore: before,
    nextBefore: next,
    existingDerived: existing,
    intervalM: 10,
    kind: "slope",
  });
  const latitudes = new Set<number>();
  const lookup = async (_lon: number, lat: number) => {
    latitudes.add(lat);
    return 500;
  };
  const result = await enrichSlopeElevations(next, lookup, synced);
  assert.deepEqual([...latitudes].sort(), [36, 37, 38]);
  assert.deepEqual(
    result.features.at(-1)?.geometry,
    existing.features[0].geometry,
  );
  latitudes.clear();
  await enrichSlopeElevations(next, lookup);
  assert.deepEqual([...latitudes].sort(), [35, 36, 37, 38]);
  await enrichSlopeElevations(
    next,
    async () => {
      throw new Error("再保存で再取得禁止");
    },
    result,
  );
});
