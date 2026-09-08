import assert from "node:assert/strict";
import { test } from "node:test";
import { synchronizeDerivedGeometry } from "@/server/derivedGeometry";
import type { LiftBeforeGeojson } from "../types";
import { enrichLiftElevations, fetchGsiElevation } from "./elevation";

const source = (): LiftBeforeGeojson => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Lift", morning: "○", midstation: [139, 35] },
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
const sampled = () =>
  synchronizeDerivedGeometry({
    previousBefore: null,
    nextBefore: source(),
    existingDerived: null,
    intervalM: 20,
    kind: "lift",
  });

test("新規線を20m間隔に分割して標高・距離・標高差を算出し、中間駅の座標順を維持する", async () => {
  const input = sampled();
  const original = structuredClone(input);
  const calls: number[][] = [];
  const result = await enrichLiftElevations(input, {
    lookup: async (lon, lat) => {
      calls.push([lon, lat]);
      return 100 + (lon - 139) * 100_000;
    },
  });
  const feature = result.features[0];
  const coordinates = feature.geometry?.coordinates as number[][];
  assert.equal(coordinates.length, 6);
  assert.equal(calls.length, 6); // 中間駅と始点は一度だけ問い合わせる
  assert.equal(feature.properties?.elevation_diff_map, 100);
  assert.equal(feature.properties?.horizontal_dist_map, 91);
  assert.equal(feature.properties?.slope_dist_map, 135);
  assert.equal(feature.properties?.morning, "○");
  assert.deepEqual(feature.properties?.midstation, [139, 35, 100]);
  assert.deepEqual(input, original);
});

test("標高取得済みの線と中間駅は再問い合わせしない", async () => {
  const input = await enrichLiftElevations(sampled(), {
    lookup: async () => 500,
  });
  const result = await enrichLiftElevations(input, {
    lookup: async () => {
      throw new Error("呼んではいけない");
    },
  });
  assert.deepEqual(result, input);
});

test("全件再取得では既存標高も置換する", async () => {
  const input = await enrichLiftElevations(sampled(), {
    lookup: async () => 500,
  });
  let calls = 0;
  const result = await enrichLiftElevations(input, {
    force: true,
    lookup: async () => {
      calls++;
      return 600;
    },
  });
  assert.equal(calls, 6);
  assert.deepEqual(result.features[0].properties?.midstation, [139, 35, 600]);
  assert.ok(result.features[0].geometry);
  assert.equal(
    (result.features[0].geometry.coordinates as number[][])[0][2],
    600,
  );
});

test("中間駅だけ移動した場合はその地点の標高だけ取得する", async () => {
  const before = source();
  const existing = await enrichLiftElevations(sampled(), {
    lookup: async () => 500,
  });
  const next = source();
  assert.ok(next.features[0].properties);
  next.features[0].properties.midstation = [139.0002, 35];
  const synced = synchronizeDerivedGeometry({
    previousBefore: before,
    nextBefore: next,
    existingDerived: existing,
    intervalM: 20,
    kind: "lift",
  });
  const calls: number[][] = [];
  const result = await enrichLiftElevations(synced, {
    lookup: async (lon, lat) => {
      calls.push([lon, lat]);
      return 550;
    },
  });
  assert.deepEqual(calls, [[139.0002, 35]]);
  assert.deepEqual(
    result.features[0].properties?.midstation,
    [139.0002, 35, 550],
  );
});

test("旧データの中間駅が緯度・経度の順でも元の座標から補正して取得する", async () => {
  const before = source();
  const existing = await enrichLiftElevations(sampled(), {
    lookup: async () => 500,
  });
  assert.ok(existing.features[0].properties);
  existing.features[0].properties.midstation = [35, 139, 500];
  const synced = synchronizeDerivedGeometry({
    previousBefore: before,
    nextBefore: before,
    existingDerived: existing,
    intervalM: 20,
    kind: "lift",
  });
  const result = await enrichLiftElevations(synced, {
    lookup: async () => 550,
  });
  assert.deepEqual(result.features[0].properties?.midstation, [139, 35, 550]);
});

test("取得失敗時は途中結果を返さず元データも変更しない", async () => {
  const input = sampled();
  const original = structuredClone(input);
  let calls = 0;
  await assert.rejects(
    enrichLiftElevations(input, {
      lookup: async () => {
        if (++calls === 2) throw new Error("API停止");
        return 0;
      },
    }),
    /API停止/,
  );
  assert.deepEqual(input, original);
});

test("GSI応答の0mを有効値として扱い、座標とJSON指定を送信する", async t => {
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    assert.equal(url.searchParams.get("lon"), "139");
    assert.equal(url.searchParams.get("lat"), "35");
    assert.equal(url.searchParams.get("outtype"), "JSON");
    return Response.json({ elevation: 0, hsrc: "5m（レーザ）" });
  });
  assert.equal(await fetchGsiElevation(139, 35), 0);
});

test("GSIの欠測値は再試行後にエラーになり、次の要求は実行できる", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ elevation: calls <= 3 ? "-----" : 42 });
  });
  await assert.rejects(fetchGsiElevation(139, 35), /標高取得に失敗/);
  assert.equal(calls, 3);
  assert.equal(await fetchGsiElevation(139, 35), 42);
});
