import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Resort } from "../types";
import { OverviewTab } from "./OverviewTab";
import { TerrainTab } from "./TerrainTab";

const resort = {
  id: "test",
  courses: [],
  lifts: [],
  finalizedMapData: null,
  currentConditions: [
    {
      id: "test",
      weather: null,
      comment: {
        data: { value: "本文の一行目\n本文の二行目" },
        sourceUrls: [],
        time: "2026/1/1 08:00",
      },
    },
  ],
} as unknown as Resort;
test("ゲレンデは共通集計・距離の後にコースとリフトを切り替える", () => {
  for (const activeTab of ["コース", "リフト"] as const) {
    const html = renderToStaticMarkup(
      createElement(TerrainTab, {
        resort,
        activeTab,
        onTabChange: () => {},
        selectedFinalizedFeature: null,
        onSelectedFinalizedFeatureChange: () => {},
      }),
    );
    assert.ok(
      html.indexOf("コース総滑走距離") < html.indexOf('role="tablist"'),
    );
    assert.ok(html.indexOf("リフト総延長") < html.indexOf('role="tablist"'));
    assert.match(html, activeTab === "コース" ? /コース一覧/ : /リフト一覧/);
    assert.doesNotMatch(html, /本文の一行目/);
  }
});
test("コメントは見出しと全文を表示し、折り畳み・取得日時を付けない", () => {
  const html = renderToStaticMarkup(createElement(OverviewTab, { resort }));
  assert.match(html, /aria-label="コメント"/);
  assert.match(html, /本文の一行目\n本文の二行目/);
  assert.doesNotMatch(html, /<details|<summary|2026\/1\/1 08:00/);
});

test("コメント本文がなくてもcommentUrlを表示し、取得日時は付けない", () => {
  const withLinks = {
    ...resort,
    currentConditions: [
      {
        id: "kiroro-snow-world",
        weather: null,
        comment: {
          data: { value: null },
          sourceUrls: [
            "https://example.com/news",
            "https://example.com/blog",
            "https://example.com/news",
            "javascript:alert(1)",
          ],
          time: "2026/1/1 08:00",
        },
      },
    ],
  } as unknown as Resort;
  const html = renderToStaticMarkup(
    createElement(OverviewTab, { resort: withLinks }),
  );
  assert.match(html, /aria-label="コメント"/);
  assert.match(html, /href="https:\/\/example.com\/news"/);
  assert.match(html, /href="https:\/\/example.com\/blog"/);
  assert.equal((html.match(/公式情報/g) ?? []).length, 2);
  assert.doesNotMatch(html, /javascript:|2026\/1\/1 08:00/);
});
