import assert from "node:assert/strict";
import test from "node:test";
import { MAX_RESORT_TILES, planResortTiles } from "./tilePlan";

test("全画面の大きさとDPRから背景2種類を複数倍率で保存する", () => {
  const points = [
    [140.89, 42.72],
    [140.93, 42.76],
  ];
  const phone = planResortTiles(points, {
    width: 390,
    height: 844,
    pixelRatio: 2,
  });
  assert.equal(phone.minZoom, 12);
  assert.equal(phone.maxZoom, 17);
  assert.ok(phone.urls.some(url => url.includes("pale/17/")));
  assert.ok(phone.urls.some(url => url.includes("seamlessphoto/17/")));
  assert.equal(phone.urls.length, new Set(phone.urls).size);
  const small = planResortTiles(points, {
    width: 390,
    height: 210,
    pixelRatio: 1,
  });
  assert.ok((phone.total ?? 0) > (small.total ?? 0));
  assert.equal(small.maxZoom, 16);
});
test("上限超過と欠損形状は完了としない", () => {
  const plan = planResortTiles(
    [
      [130, 30],
      [145, 45],
    ],
    { width: 1920, height: 1080, pixelRatio: 3 },
  );
  assert.equal(plan.complete, false);
  assert.ok(plan.urls.length <= MAX_RESORT_TILES);
  assert.equal(
    planResortTiles([], { width: 390, height: 844, pixelRatio: 2 }).complete,
    false,
  );
});
