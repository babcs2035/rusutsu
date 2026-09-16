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
