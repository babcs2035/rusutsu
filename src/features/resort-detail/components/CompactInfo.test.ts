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
  assert.match(text, /2026\/1\/1 08:00現在/);
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

test("出典1件と複数日時を添字対応せず、日時の範囲を一度だけ表示する", () => {
  const html = renderToStaticMarkup(
    createElement(SourceLine, {
      label: "コース",
      urls: ["https://example.com/courses"],
      updates: ["2026/4/4 17:00", "2026/3/29 8:00", "2026/4/1"],
      showFetched: false,
      showLabel: false,
    }),
  );
  assert.equal((html.match(/href=/g) ?? []).length, 1);
  assert.match(html.replace(/<[^>]+>/g, ""), /2026\/3\/29〜4\/4現在/);
  assert.doesNotMatch(html, /出典未登録|出典1|出典2/);
  assert.equal((html.match(/現在/g) ?? []).length, 1);
});

test("出典が複数でも1つの日時に偽の対応を付けず、空の出典枠を作らない", () => {
  const html = renderToStaticMarkup(
    createElement(SourceLine, {
      label: "コース",
      urls: ["https://example.com/a", "https://example.com/b"],
      updates: ["8時"],
      showFetched: false,
      showLabel: false,
    }),
  );
  assert.equal((html.match(/href=/g) ?? []).length, 2);
  assert.equal((html.match(/8時現在/g) ?? []).length, 1);
  const empty = renderToStaticMarkup(
    createElement(SourceLine, { label: "コース", showLabel: false }),
  );
  assert.equal(empty, "");
});
