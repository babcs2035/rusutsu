import assert from "node:assert/strict";
import test from "node:test";
import { removeGeneratedCommentLinks } from "./commentContent";

test("生成した案内だけを除去し、公式本文と本文のリンクは残す", () => {
  const generated =
    '最新ニュースは<a href="https://example.com/news">こちら</a>から。\n最新ブログは<a href="https://example.com/blog">こちら</a>から。';
  assert.equal(removeGeneratedCommentLinks(generated, "rusutsu-resort"), "");
  const actual =
    '本日は営業します。<a href="https://example.com/status">コース規制</a>をご確認ください。<a href="https://example.com/other">こちら</a>もご覧ください。';
  assert.equal(
    removeGeneratedCommentLinks(`${actual}\n\n${generated}`, "rusutsu-resort"),
    actual,
  );
  assert.equal(
    removeGeneratedCommentLinks(generated, "another-resort"),
    generated,
  );
});
