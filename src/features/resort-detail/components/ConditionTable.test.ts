import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConditionTable } from "./ConditionTable";

const render = (data: unknown) =>
  renderToStaticMarkup(createElement(ConditionTable, { data }));
test("中腹だけの場合は地点を省き、値のある全項目を表示する（0を含む）", () => {
  const html = render({
    中腹: {
      snowDepth: 100,
      snowfall: 0,
      weather: "晴れ",
      temperature: -3,
      windSpeed: 0,
      condition: "粉雪",
    },
  });
  for (const value of [
    "積雪",
    "新雪",
    "天候",
    "気温",
    "風速",
    "雪質・状態",
    "0cm",
    "0m/s",
    "粉雪",
  ])
    assert.ok(html.includes(value));
  assert.doesNotMatch(html, /中腹|今日/);
});
test("更新日時は地点ごとの全列を使う青い行に表示し、欠損日時を補完しない", () => {
  const html = render({
    中央エリア: { snowDepth: 40, update: "2026/04/24 08:37" },
    上の台エリア: { temperature: 4, update: "2026/04/13 07:22" },
    山頂: { temperature: -1, update: null },
  });
  const rows = html.match(/<tbody\b[^>]*>.*?<\/tbody>/g) ?? [];
  assert.ok(rows[0]);
  assert.ok(rows[1]);
  assert.ok(rows[2]);
  assert.match(rows[0], /中央エリア.*2026\/04\/24 08:37現在/);
  assert.doesNotMatch(rows[0], /2026\/04\/13/);
  assert.match(rows[1], /上の台エリア.*2026\/04\/13 07:22現在/);
  assert.match(rows[2], /山頂.*更新日時不明/);
  for (const row of rows) {
    assert.match(row, /colSpan="3"/i);
    assert.match(row, /whitespace-nowrap[^"]*border-blue-100[^"]*bg-blue-50/);
  }
});
test("単一地点でも更新日時を表示する", () => {
  assert.match(
    render({ 中腹: { snowDepth: 40, update: "2026/04/24 08:37" } }),
    /中腹.*2026\/04\/24 08:37現在/,
  );
});
test("全地点で空の項目は列を作らず、地点ごとの欠測はダッシュで表示する", () => {
  const html = render({
    山頂: { snowDepth: 100, windSpeed: null },
    山麓: { snowDepth: null, windSpeed: "—" },
  });
  assert.match(html, /地点/);
  assert.match(html, /山頂/);
  assert.match(html, /山麓/);
  assert.doesNotMatch(html, /新雪|天候|気温|風速|雪質・状態/);
});
test("観測値がなければ空の表を作らない", () => {
  assert.doesNotMatch(
    render({ 中腹: { snowDepth: null, update: "今日" } }),
    /<table/,
  );
});
