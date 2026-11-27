import assert from "node:assert/strict";
import { test } from "node:test";
import { detectMobilePlatform, getAppLink } from "./appLinks";

const windy =
  "https://www.windy.com/42.75/140.9?42.75,140.9,14,i:pressure,p:cities";

test("端末は名乗りで見分け、iPadOS はタッチ対応で見分ける", () => {
  assert.equal(
    detectMobilePlatform("Mozilla/5.0 (Linux; Android 14)"),
    "android",
  );
  assert.equal(
    detectMobilePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)"),
    "ios",
  );
  assert.equal(
    detectMobilePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 5),
    "ios",
  );
  assert.equal(
    detectMobilePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 0),
    "other",
  );
});

test("PCと対象外のサイトは変えない", () => {
  assert.equal(getAppLink(windy, "other"), null);
  assert.equal(getAppLink("https://tenki.jp/season/ski/1/", "ios"), null);
  assert.equal(getAppLink("not a url", "android"), null);
});

test("iPhone は同じURLを同じタブで開く", () => {
  assert.deepEqual(getAppLink(windy, "ios"), { href: windy, target: "_self" });
});

test("Android はアプリを名指しし、無ければ元のページへ戻す", () => {
  assert.deepEqual(getAppLink(windy, "android"), {
    href:
      "intent://www.windy.com/42.75/140.9?42.75,140.9,14,i:pressure,p:cities" +
      "#Intent;scheme=https;package=com.windyty.android;" +
      `S.browser_fallback_url=${encodeURIComponent(windy)};end`,
    target: "_self",
  });
});
