import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceLine } from "./CompactInfo";

test("出典はURLを本文に出さないリンクで、発表日時は現在を併記する", () => {
  const html = renderToStaticMarkup(
    createElement(SourceLine, {
      label: "コース",
      urls: ["https://example.com/courses"],
      updates: ["2026/1/1 8:00 現在"],
      showFetched: false,
      showLabel: false,
    }),
  );
  assert.match(html, /href="https:\/\/example.com\/courses"/);
  const text = html.replace(/<[^>]+>/g, "");
  assert.match(text, /出典/);
  assert.match(text, /2026\/1\/1 8:00現在/);
  assert.doesNotMatch(text, /https|取得|現在現在/);
});
test("地点別に日時を表示する場合は共通出典リンクのみ表示する", () => {
  const html = renderToStaticMarkup(
    createElement(SourceLine, {
      label: "コンディション",
      urls: ["https://example.com/weather"],
      updates: ["2026/04/24 08:37", "2026/04/13 07:22"],
      showFetched: false,
      showLabel: false,
      showPublished: false,
    }),
  );
  assert.equal((html.match(/href=/g) ?? []).length, 1);
  assert.doesNotMatch(html, /出典未登録|日時不明|2026|出典1/);
});
test("掲載日時が分からない出典は日時を書かない", () => {
  const html = renderToStaticMarkup(
    createElement(SourceLine, {
      label: "コース",
      urls: ["https://example.com/courses"],
      showLabel: false,
    }),
  );
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ""), /不明|取得/);
});
