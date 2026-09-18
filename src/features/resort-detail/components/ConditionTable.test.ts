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
      update: "今日",
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
