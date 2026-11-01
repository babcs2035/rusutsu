import assert from "node:assert/strict";
import test from "node:test";
import { isFacebookPageUrl, parseFacebookProfile } from "./facebookProfile";

const header = (followers: string) =>
  `<a href="https://www.facebook.com/100632525822643?ref=embed_page" target="_blank"><img alt="" /></a><div class="lfloat"><div><a style="max-width: 240px;" class="_1drp _5lv6" title="&#x9053;&#x5f8c;&#x5c71;&#x9ad8;&#x539f;&#x30b9;&#x30ad;&#x30fc;&#x5834;" href="https://www.facebook.com/100632525822643?ref=embed_page" target="_blank">道後山高原スキー場</a></div><div class="_1drq">${followers}</div></div>`;

test("reads the page name and follower count from the page plugin header", () => {
  assert.deepEqual(parseFacebookProfile(header("766 フォロワー")), {
    name: "道後山高原スキー場",
    followers: "フォロワー766人",
  });
  assert.deepEqual(parseFacebookProfile(header("フォロワー2,739人")), {
    name: "道後山高原スキー場",
    followers: "フォロワー2,739人",
  });
  assert.deepEqual(parseFacebookProfile(header("")), {
    name: "道後山高原スキー場",
    followers: null,
  });
});

test("returns null when the plugin shows no page", () => {
  assert.equal(parseFacebookProfile("<html><body></body></html>"), null);
  assert.equal(
    parseFacebookProfile(
      '<a href="https://example.com/?ref=embed_page" title="偽物">x</a>',
    ),
    null,
  );
});

test("only accepts normalized facebook.com page URLs", () => {
  assert.equal(isFacebookPageUrl("https://www.facebook.com/dogoski"), true);
  assert.equal(
    isFacebookPageUrl("https://www.facebook.com/profile.php?id=123"),
    true,
  );
  for (const url of [
    "https://www.facebook.com/",
    "http://www.facebook.com/dogoski",
    "https://www.facebook.com.evil.test/dogoski",
    "https://user@www.facebook.com/dogoski",
    "invalid",
  ])
    assert.equal(isFacebookPageUrl(url), false, url);
});
