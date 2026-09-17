import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseStatusTable } from "./CourseStatusTable";

test("通常表示は等幅の4列の表に記号と件数を分け、説明ボタンを持つ", () => {
  const html = renderToStaticMarkup(
    createElement(CourseStatusTable, {
      summary: {
        total: 40,
        open: 5,
        partial: 2,
        closed: 30,
        unknown: 3,
        observedAt: null,
        sourceUrls: [],
        updates: [],
      },
    }),
  );
  assert.match(html, /40区間/);
  assert.equal((html.match(/<th /g) ?? []).length, 4);
  assert.equal((html.match(/<td /g) ?? []).length, 4);
  for (const value of [5, 2, 30, 3])
    assert.match(html, new RegExp(`>${value}</td>`));
  assert.match(html, /コースの記号と集計方法について/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ""), /全面滑走|5\/40/);
});
test("未取得をゼロ件の営業情報と誤表示しない", () => {
  const html = renderToStaticMarkup(createElement(CourseStatusTable, {}));
  assert.match(html, /未取得/);
  assert.equal((html.match(/>—<\/td>/g) ?? []).length, 4);
});

test("リフトも太線の記号と4列の件数を表示する", () => {
  const html = renderToStaticMarkup(
    createElement(CourseStatusTable, {
      kind: "lift",
      summary: {
        total: 4,
        open: 1,
        partial: 1,
        closed: 1,
        unknown: 1,
        observedAt: null,
        sourceUrls: [],
        updates: [],
      },
    }),
  );
  assert.match(html, /リフト/);
  assert.match(html, /4本/);
  assert.equal((html.match(/stroke-width="3.25"/g) ?? []).length, 3);
  assert.equal((html.match(/<td /g) ?? []).length, 4);
  assert.match(html, /size-5/);
});
