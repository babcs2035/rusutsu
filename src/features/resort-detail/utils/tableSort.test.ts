import assert from "node:assert/strict";
import test from "node:test";
import { nextTableSort, sortRows, symbolSortValue } from "./tableSort";

test("見出しを押すたびに、決めた向き→逆向き→元の並びと切り替わる", () => {
  const first = nextTableSort(null, "圧雪", "asc");
  assert.deepEqual(first, { key: "圧雪", dir: "asc" });
  const second = nextTableSort(first, "圧雪", "asc");
  assert.deepEqual(second, { key: "圧雪", dir: "desc" });
  assert.equal(nextTableSort(second, "圧雪", "asc"), null);
  assert.deepEqual(nextTableSort(second, "距離", "desc"), {
    key: "距離",
    dir: "desc",
  });
});

test("○ を上にし、区間で違うものはその間、値の無い行はどちら向きでも最後", () => {
  const rows = [
    { name: "不明", piste: [null] },
    { name: "非圧雪", piste: ["×"] },
    { name: "上部のみ圧雪", piste: ["○", "×"] },
    { name: "圧雪", piste: ["○"] },
  ];
  const value = (row: (typeof rows)[number]) => symbolSortValue(row.piste);
  assert.deepEqual(
    sortRows(rows, { key: "圧雪", dir: "asc" }, value).map(row => row.name),
    ["圧雪", "上部のみ圧雪", "非圧雪", "不明"],
  );
  assert.deepEqual(
    sortRows(rows, { key: "圧雪", dir: "desc" }, value).map(row => row.name),
    ["非圧雪", "上部のみ圧雪", "圧雪", "不明"],
  );
  assert.equal(sortRows(rows, null, value), rows);
});

test("文字は五十音順、数字を含む名前は数の順に並べる", () => {
  const rows = ["第10リフト", "第2リフト", "あおば"];
  assert.deepEqual(
    sortRows(rows, { key: "名前", dir: "asc" }, row => row),
    ["あおば", "第2リフト", "第10リフト"],
  );
});
