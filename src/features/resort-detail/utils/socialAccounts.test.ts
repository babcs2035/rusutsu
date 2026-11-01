import assert from "node:assert/strict";
import test from "node:test";
import { parseResortLinksMap } from "@/features/lift/server/liftFiles";
import { collectSocialAccounts } from "./socialAccounts";

test("merges source resorts in order and deduplicates X aliases while retaining descriptions", () => {
  const links = parseResortLinksMap(
    JSON.stringify({
      combined: {
        xUrls: [
          { url: "https://twitter.com/Resort/", description: "営業情報" },
        ],
      },
      source: { xUrls: ["https://x.com/resort", "https://x.com/another"] },
    }),
  );
  assert.deepEqual(
    collectSocialAccounts(links, ["combined", "source", "source"]).X,
    [
      { url: "https://x.com/Resort", handle: "Resort", label: "営業情報" },
      { url: "https://x.com/another", handle: "another", label: "@another" },
    ],
  );
});

test("rejects invalid and foreign URLs and preserves Facebook numeric profile IDs", () => {
  const links = parseResortLinksMap(
    JSON.stringify({
      resort: {
        xUrls: [
          "javascript:alert(1)",
          "https://x.com.evil.test/account",
          "invalid",
        ],
        instagramUrls: ["https://www.instagram.com/resort/?hl=ja"],
        facebookUrls: ["https://www.facebook.com/profile.php?id=123"],
      },
    }),
  );
  const accounts = collectSocialAccounts(links, ["missing", "resort"]);
  assert.deepEqual(accounts.X, []);
  assert.equal(accounts.Instagram[0].url, "https://www.instagram.com/resort/");
  assert.equal(
    accounts.Facebook[0].url,
    "https://www.facebook.com/profile.php?id=123",
  );
  assert.deepEqual(collectSocialAccounts({}, ["missing"]), {
    X: [],
    Instagram: [],
    Facebook: [],
  });
});

test("normalizes Facebook URLs that point to a numeric ID so the page plugin can embed them", () => {
  const links = parseResortLinksMap(
    JSON.stringify({
      resort: {
        facebookUrls: [
          "https://www.facebook.com/people/%E5%8D%94%E5%92%8C%E3%82%B9%E3%82%AD%E3%83%BC%E5%A0%B4/100063713343579/",
          "https://www.facebook.com/profile.php?id=100063713343579#",
          "https://www.facebook.com/p/%E9%A3%9B%E9%A8%A8%E9%AB%98%E5%B1%B1%E3%82%B9%E3%82%AD%E3%83%BC%E5%A0%B4-100064025529147/",
          "https://www.facebook.com/pages/%E3%82%B5%E3%83%9B%E3%83%AD/127748797337702",
          "https://facebook.com/dogoski/",
        ],
      },
    }),
  );
  assert.deepEqual(collectSocialAccounts(links, ["resort"]).Facebook, [
    {
      url: "https://www.facebook.com/profile.php?id=100063713343579",
      handle: "協和スキー場",
      label: "協和スキー場",
    },
    {
      url: "https://www.facebook.com/profile.php?id=100064025529147",
      handle: "飛騨高山スキー場",
      label: "飛騨高山スキー場",
    },
    {
      url: "https://www.facebook.com/profile.php?id=127748797337702",
      handle: "サホロ",
      label: "サホロ",
    },
    {
      url: "https://www.facebook.com/dogoski",
      handle: "dogoski",
      label: "dogoski",
    },
  ]);
});
