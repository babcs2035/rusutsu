import assert from "node:assert/strict";
import test from "node:test";
import {
  patchSocialDocument,
  type SocialSaveRequest,
  socialLinksFromDocument,
  socialSaveSchema,
} from "./model";

const request: SocialSaveRequest = {
  resortId: "rusutsu",
  platform: "xUrls",
  expectedLinks: [{ url: "https://x.com/old", description: "既存" }],
  links: [{ url: "https://x.com/new", description: "公式" }],
};

test("SNS保存は対象の1項目だけを変更し、旧形式・未知の項目を保持する", () => {
  const before = {
    rusutsu: {
      xUrls: request.expectedLinks,
      instagramUrls: ["https://instagram.com/keep"],
      officialSiteUrls: ["https://example.com"],
      custom: { keep: true },
    },
    other: { xUrls: ["https://x.com/other"] },
  };
  assert.deepEqual(
    JSON.parse(patchSocialDocument(JSON.stringify(before), request)),
    { ...before, rusutsu: { ...before.rusutsu, xUrls: request.links } },
  );
});

test("同じSNS欄への古い編集は拒否し、別のSNS欄の更新は保持する", () => {
  assert.throws(
    () =>
      patchSocialDocument(
        JSON.stringify({
          rusutsu: { xUrls: [{ url: "https://x.com/concurrent" }] },
        }),
        request,
      ),
    /別の操作で更新/,
  );
  assert.throws(() => patchSocialDocument("broken", request));
  assert.throws(() => patchSocialDocument('{"rusutsu":null}', request));
});

test("旧形式を読み込め、最後のリンク削除でも他のリンクは残る", () => {
  const content = JSON.stringify({
    rusutsu: {
      xUrls: ["https://x.com/old"],
      officialSiteUrls: ["https://example.com"],
    },
  });
  assert.deepEqual(socialLinksFromDocument(content).rusutsu.xUrls, [
    { url: "https://x.com/old" },
  ]);
  assert.deepEqual(
    JSON.parse(
      patchSocialDocument(content, {
        ...request,
        expectedLinks: [{ url: "https://x.com/old" }],
        links: [],
      }),
    ).rusutsu,
    { xUrls: [], officialSiteUrls: ["https://example.com"] },
  );
});

test("URLの種類、偽装ホスト、重複、SNS以外の項目とパスを検証する", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://x.com.evil.test/a",
    "https://instagram.com/a",
    "https://user@x.com/a",
    "",
  ]) {
    assert.equal(
      socialSaveSchema.safeParse({ ...request, links: [{ url }] }).success,
      false,
      url,
    );
  }
  assert.equal(
    socialSaveSchema.safeParse({
      ...request,
      links: [
        { url: "https://twitter.com/Account/" },
        { url: "https://x.com/account" },
      ],
    }).success,
    false,
  );
  assert.equal(
    socialSaveSchema.safeParse({ ...request, platform: "officialSiteUrls" })
      .success,
    false,
  );
  assert.equal(
    socialSaveSchema.safeParse({ ...request, resortId: "../other" }).success,
    false,
  );
  assert.equal(socialSaveSchema.safeParse(request).success, true);
});
