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
