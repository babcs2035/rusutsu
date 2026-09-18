import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseStatusTable } from "./CourseStatusTable";

const summary = {
  total: 40,
  open: 5,
  partial: 2,
  closed: 30,
  unknown: 3,
  observedAt: null,
  sourceUrls: [],
  updates: [],
};

test("通常表示は○△×と不明の件数を並べ、説明ボタンを持つ", () => {
  const html = renderToStaticMarkup(
    createElement(CourseStatusTable, { summary }),
  );
  const text = html.replace(/<[^>]+>/g, "");
  assert.match(text, /40区間/);
  for (const value of [5, 2, 30, 3])
    assert.match(html, new RegExp(`>${value}</span>`));
  assert.match(html, /コースの記号と集計方法について/);
  assert.doesNotMatch(text, /未取得|全面滑走|5\/40/);
});

test("未取得は記号の列を出さず、不明の件数だけを出す", () => {
  const html = renderToStaticMarkup(
    createElement(CourseStatusTable, {
      summary: { ...summary, open: 0, partial: 0, closed: 0, unknown: 40 },
      unavailable: true,
    }),
  );
  const text = html.replace(/<[^>]+>/g, "");
  assert.match(text, /未取得/);
  assert.match(text, /40区間/);
  // ○△×のアイコンは出さない（全部0にしかならないため）
  assert.doesNotMatch(html, /stroke-width="3.25"/);
});

test("地図のデータもないときは件数を出さない", () => {
  const html = renderToStaticMarkup(
    createElement(CourseStatusTable, { unavailable: true }),
  );
  const text = html.replace(/<[^>]+>/g, "");
  assert.match(text, /未取得/);
  assert.doesNotMatch(text, /区間/);
});

test("リフトも太線の記号と4つの件数を表示する", () => {
  const html = renderToStaticMarkup(
    createElement(CourseStatusTable, {
      kind: "lift",
      summary: { ...summary, total: 4, open: 1, partial: 1, closed: 1 },
    }),
  );
  assert.match(html, /リフト/);
  assert.match(html.replace(/<[^>]+>/g, ""), /4本/);
  assert.equal((html.match(/stroke-width="3.25"/g) ?? []).length, 3);
  assert.match(html, /size-5/);
});
