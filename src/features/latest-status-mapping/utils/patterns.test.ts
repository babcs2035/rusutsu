import assert from "node:assert/strict";
import { test } from "node:test";
import { rowCrawledNames, withCrawledNames } from "./aliases";
import { applyGeometryAssignments } from "./geometryAssignments";
import { groupMappingPatterns } from "./patterns";
import { listUnmappedCrawledNames, reconcileSavedRows } from "./rows";

test("状態と順序が違う取得は同じパターン、名称の変化は別パターン", () => {
  const captures = [
    {
      fileName: "new",
      time: "2026-02-02",
      items: [
        { name: "A", status: "○" },
        { name: "B", status: "×" },
      ],
      sourceUrls: [],
    },
    {
      fileName: "old",
      time: "2026-02-01",
      items: [
        { name: "B", status: "○" },
        { name: "A", status: "×" },
      ],
      sourceUrls: [],
      archiveTimestamp: "20260201",
    },
    {
      fileName: "renamed",
      time: null,
      items: [{ name: "C", status: null }],
      sourceUrls: [],
    },
  ];
  const patterns = groupMappingPatterns([...captures, captures[0]]);
  assert.equal(patterns.length, 2);
  assert.equal(patterns[0].captureCount, 2);
  assert.equal(patterns[0].fileName, "new");
});

test("パターン変更・名前追加・地図名変更で以前の別名を保持し、解除できる", () => {
  const row = withCrawledNames(
    { geometryId: "id", geojsonName: "地図", crawledName: null },
    ["旧名", "別名"],
  );
  const rows = applyGeometryAssignments(
    [row],
    [{ id: "id", name: "新しい地図名" }],
    { id: "新名" },
    true,
  );
  assert.deepEqual(rowCrawledNames(rows[0]), ["新名", "旧名", "別名"]);
  const reconciled = reconcileSavedRows(
    "courses",
    rows,
    ["別名"],
    ["新しい地図名"],
  );
  assert.equal(reconciled.length, 1);
  assert.deepEqual(listUnmappedCrawledNames(["別名"], reconciled), []);
  const removed = withCrawledNames(rows[0], ["旧名", "別名"]);
  assert.deepEqual(
    rowCrawledNames(
      applyGeometryAssignments(
        [removed],
        [{ id: "id", name: "新しい地図名" }],
        { id: "旧名" },
        true,
      )[0],
    ),
    ["旧名", "別名"],
  );
  assert.deepEqual(
    rowCrawledNames(
      applyGeometryAssignments(
        rows,
        [{ id: "id", name: "新しい地図名" }],
        { id: null },
        true,
      )[0],
    ),
    [],
  );
});
