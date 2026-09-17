import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createCourseStatusSummary } from "./courseStatusSummary";
import { getResortMapDataFromRoots } from "./finalizedResortGeojson";
import type { LatestSuccessfulStatus } from "./latestStatusFiles";

const snapshot: LatestSuccessfulStatus = {
  fileName: "2026_0101_090000.json",
  time: "2026/1/1 9:00:00",
  sourceUrls: ["https://example.com/status"],
  items: [
    { name: "Aコース", status: "○" },
    { name: "Bコース 上部", status: "△" },
    { name: "Bコース 下部", status: "×" },
    { name: "キッズパーク", status: "○" },
  ],
};
test("対応するクローラー項目だけを数え、複数の地図線から重複加算しない", () => {
  const result = createCourseStatusSummary(
    snapshot,
    ["Aコース", "Aコース", "Bコース 上部", "Bコース 下部"],
    true,
  );
  assert.deepEqual(result, {
    total: 3,
    open: 1,
    partial: 1,
    closed: 1,
    unknown: 0,
    observedAt: snapshot.time,
    sourceUrls: snapshot.sourceUrls,
    updates: [],
  });
});
test("対応付けがなければ全取得項目。上下区間・同名項目も勝手にまとめない", () => {
  const result = createCourseStatusSummary(
    {
      ...snapshot,
      items: [
        ...snapshot.items,
        { name: "Aコース", status: null },
        { name: "Bコース 中部", status: "不明" },
      ],
    },
    [],
    false,
  );
  assert.equal(result?.total, 6);
  assert.equal(result?.open, 2);
  assert.equal(result?.partial, 1);
  assert.equal(result?.closed, 1);
  assert.equal(result?.unknown, 2);
});
test("自動対応も絞り込みに使用し、全閉鎖・不明・未取得を区別する", () => {
  assert.equal(
    createCourseStatusSummary(snapshot, ["Bコース 下部"], false)?.closed,
    1,
  );
  assert.equal(
    createCourseStatusSummary(snapshot, ["存在しないコース"], true)?.total,
    0,
  );
  assert.equal(createCourseStatusSummary(null, [], false), null);
  const result = createCourseStatusSummary(
    {
      ...snapshot,
      items: ["〇", "◯", "△", "✕", "✖", "未取得", null, 1].map(
        (status, index) => ({ name: String(index), status }),
      ),
    },
    [],
    false,
  );
  assert.equal(result?.open, 2);
  assert.equal(result?.partial, 1);
  assert.equal(result?.closed, 2);
  assert.equal(result?.unknown, 3);
});
test("地図生成から公式項目の集計を渡す。地図がなくても公式の集計と出典を保持する", async () => {
  const parent = path.join(
    process.cwd(),
    "src/private/data/resorts-temporary/tmp/course-status-summary",
  );
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "test-"));
  try {
    const latestStatusLoader = async (
      _id: string,
      kind: "courses" | "lifts",
    ) => (kind === "courses" ? snapshot : null);
    const noMap = await getResortMapDataFromRoots("sample", {
      temporaryRoot: root,
      latestStatusLoader,
    });
    assert.equal(noMap?.courses, null);
    assert.equal(noMap?.courseStatusSummary?.total, 4);
    for (const folder of ["slope_before", "latest_status_mapping"])
      await fs.mkdir(path.join(root, folder));
    await fs.writeFile(
      path.join(root, "slope_before", "sample.geojson"),
      JSON.stringify({
        type: "FeatureCollection",
        features: ["地図A", "地図A別線", "地図B上", "地図B下"].map(name => ({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [140, 43, 100],
              [140.001, 43, 90],
            ],
          },
          properties: { name },
        })),
      }),
    );
    await fs.writeFile(
      path.join(root, "latest_status_mapping", "sample.json"),
      JSON.stringify({
        version: 1,
        courses: {
          sourceFile: snapshot.fileName,
          updatedAt: "2026-01-01",
          rows: [
            { geojsonName: "地図A", crawledName: "Aコース" },
            { geojsonName: "地図A別線", crawledName: "Aコース" },
            { geojsonName: "地図B上", crawledName: "Bコース 上部" },
            { geojsonName: "地図B下", crawledName: "Bコース 下部" },
            { geojsonName: null, crawledName: "キッズパーク" },
          ],
        },
      }),
    );
    const mapped = await getResortMapDataFromRoots("sample", {
      temporaryRoot: root,
      latestStatusLoader,
    });
    assert.equal(mapped?.courses?.features.length, 4);
    assert.equal(mapped?.courseStatusSummary?.total, 3);
    assert.equal(mapped?.courseStatusSummary?.open, 1);
    assert.equal(mapped?.courseStatusSummary?.partial, 1);
    assert.equal(mapped?.courseStatusSummary?.closed, 1);
    assert.deepEqual(
      mapped?.courseStatusSummary?.sourceUrls,
      snapshot.sourceUrls,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
