import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeDocumentChanges,
  mergeDocumentContent,
  mergeValues,
} from "./mergeContent";

const merge = (before: unknown, current: unknown, candidate: unknown) =>
  JSON.parse(
    mergeDocumentChanges(
      JSON.stringify(before),
      JSON.stringify(current),
      JSON.stringify(candidate),
    ),
  );

test("adopting a conflicted link edit preserves other resorts and unchanged fields", () => {
  assert.deepEqual(
    merge(
      {
        a: { official: ["old"], weather: ["old weather"] },
        b: { official: ["b"] },
      },
      {
        a: { official: ["current"], weather: ["new weather"] },
        b: { official: ["new b"] },
        c: {},
      },
      {
        a: { official: ["candidate"], weather: ["old weather"] },
        b: { official: ["b"] },
      },
    ),
    {
      a: { official: ["candidate"], weather: ["new weather"] },
      b: { official: ["new b"] },
      c: {},
    },
  );
});

test("adopting course changes replaces the edited lines and preserves current metadata", () => {
  assert.deepEqual(
    merge(
      { features: [{ id: "old" }], metadata: "before", removed: true },
      { features: [{ id: "current" }], metadata: "current", removed: true },
      { features: [{ id: "candidate" }], metadata: "before" },
    ),
    { features: [{ id: "candidate" }], metadata: "current" },
  );
});

test("a concurrently created shared link file retains other resorts", () => {
  assert.deepEqual(
    JSON.parse(
      mergeDocumentChanges(
        null,
        JSON.stringify({ other: { links: ["current"] } }),
        JSON.stringify({ edited: { links: ["candidate"] } }),
      ),
    ),
    { other: { links: ["current"] }, edited: { links: ["candidate"] } },
  );
});

test("course edits retain concurrent additions and unchanged geometry by entity ID", () => {
  const feature = (id: string, note: string, coordinates: number[][]) => ({
    type: "Feature",
    properties: { entityId: id, note },
    geometry: { type: "LineString", coordinates },
  });
  const old = feature("a", "old", [
    [140, 43],
    [140.1, 43.1],
  ]);
  const current = feature("a", "current", [
    [140, 43, 100],
    [140.1, 43.1, 200],
  ]);
  const added = feature("concurrent", "new line", [
    [140, 43],
    [140.2, 43.2],
  ]);
  assert.deepEqual(
    merge(
      { features: [old] },
      { features: [current, added] },
      {
        features: [
          { ...old, properties: { ...old.properties, note: "admin" } },
        ],
      },
    ),
    {
      features: [
        { ...current, properties: { ...current.properties, note: "admin" } },
        added,
      ],
    },
  );
});

const conflictsOf = (before: unknown, current: unknown, candidate: unknown) =>
  mergeDocumentContent(
    JSON.stringify(before),
    JSON.stringify(current),
    JSON.stringify(candidate),
    "SkiResortLinks.json",
  ).conflicts;

test("別のスキー場のリンク更新では競合にしない", () => {
  assert.deepEqual(
    conflictsOf(
      { a: { official: ["old"] }, b: { official: ["b"] } },
      { a: { official: ["old"] }, b: { official: ["new b"] } },
      { a: { official: ["new a"] }, b: { official: ["b"] } },
    ),
    [],
  );
});

test("同じスキー場でも別の欄なら競合にしない", () => {
  assert.deepEqual(
    conflictsOf(
      { a: { official: ["old"], map: ["old map"] } },
      { a: { official: ["old"], map: ["new map"] } },
      { a: { official: ["new"], map: ["old map"] } },
    ),
    [],
  );
});

test("同じ欄を別の値に変えたときだけ競合にする", () => {
  assert.deepEqual(
    conflictsOf(
      { a: { official: ["old"] } },
      { a: { official: ["current"] } },
      { a: { official: ["candidate"] } },
    ),
    ["SkiResortLinks.json › a › official"],
  );
  assert.deepEqual(
    conflictsOf(
      { a: { official: ["old"] } },
      { a: { official: ["same"] } },
      { a: { official: ["same"] } },
    ),
    [],
  );
});

const line = (id: string, name: string, level: string, x = 140) => ({
  type: "Feature",
  properties: { entityId: id, name, level },
  geometry: {
    type: "LineString",
    coordinates: [
      [x, 43],
      [x + 0.1, 43.1],
    ],
  },
});

test("コース線は1本ずつ、さらに項目ごとに比べる", () => {
  const before = { features: [line("a", "A", "初級"), line("b", "B", "中級")] };
  // 別の線・同じ線の別の項目の変更は重ねる
  const result = mergeDocumentContent(
    JSON.stringify(before),
    JSON.stringify({
      features: [line("a", "A", "初級", 141), line("b", "B", "上級")],
    }),
    JSON.stringify({
      features: [line("a", "A", "中級"), line("b", "B", "中級")],
    }),
    "slope_before/x.geojson",
  );
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(JSON.parse(result.value), {
    features: [line("a", "A", "中級", 141), line("b", "B", "上級")],
  });
  // 同じ線の同じ項目は競合
  assert.deepEqual(
    mergeDocumentContent(
      JSON.stringify(before),
      JSON.stringify({
        features: [line("a", "A", "上級"), before.features[1]],
      }),
      JSON.stringify({
        features: [line("a", "A", "中級"), before.features[1]],
      }),
      "slope_before/x.geojson",
    ).conflicts,
    ["slope_before/x.geojson › features › 「A」 › properties › level"],
  );
});

test("削除と変更が重なった線は競合にする", () => {
  const before = { features: [line("a", "A", "初級"), line("b", "B", "中級")] };
  assert.deepEqual(
    mergeDocumentContent(
      JSON.stringify(before),
      JSON.stringify({
        features: [line("a", "A", "上級"), before.features[1]],
      }),
      JSON.stringify({ features: [before.features[1]] }),
      "slope_before/x.geojson",
    ).conflicts,
    ["slope_before/x.geojson › features › 「A」"],
  );
});

test("片方だけの並べ替えは採用し、両方が別の並びにしたら競合にする", () => {
  const a = line("a", "A", "初級");
  const b = line("b", "B", "初級");
  const c = line("c", "C", "初級");
  const added = line("d", "D", "初級");
  const reordered = mergeDocumentContent(
    JSON.stringify({ features: [a, b, c] }),
    JSON.stringify({ features: [a, b, c, added] }),
    JSON.stringify({ features: [c, b, a] }),
    "k",
  );
  assert.deepEqual(reordered.conflicts, []);
  assert.deepEqual(
    JSON.parse(reordered.value).features.map(
      (item: { properties: { entityId: string } }) => item.properties.entityId,
    ),
    ["c", "b", "a", "d"],
  );
  assert.deepEqual(
    mergeDocumentContent(
      JSON.stringify({ features: [a, b, c] }),
      JSON.stringify({ features: [b, a, c] }),
      JSON.stringify({ features: [c, b, a] }),
      "k",
    ).conflicts,
    ["k › features › 並び順"],
  );
});

test("詳細の行は entityId ごとに比べる", () => {
  const row = (id: string, note: string, level: string) => ({
    entityId: id,
    name: id,
    note,
    level,
  });
  assert.deepEqual(
    mergeValues(
      [row("a", "", "初級")],
      [row("a", "現在のメモ", "初級")],
      [row("a", "", "中級")],
    ),
    { value: [row("a", "現在のメモ", "中級")], conflicts: [] },
  );
});
