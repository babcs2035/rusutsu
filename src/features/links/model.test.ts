import assert from "node:assert/strict";
import test from "node:test";
import { parseResortLinksMap } from "@/features/lift/server/liftFiles";
import {
  type LinkSaveRequest,
  linkSaveSchema,
  linksFromDocument,
  patchLinksDocument,
  stripTrackingParams,
} from "./model";

const request: LinkSaveRequest = {
  resortId: "rusutsu",
  platform: "xUrls",
  expectedLinks: [{ url: "https://x.com/old", description: "既存" }],
  links: [{ url: "https://x.com/new", description: "公式" }],
};

test("順序だけの変更を保存し、両編集画面でURLと補足の順序を保持する", () => {
  const original = [
    { url: "https://x.com/main", description: "公式" },
    { url: "https://x.com/park", description: "パーク" },
    { url: "https://x.com/school", description: "スクール" },
  ];
  const reordered = [original[2], original[0], original[1]];
  const content = patchLinksDocument(
    JSON.stringify({ rusutsu: { xUrls: original } }),
    linkSaveSchema.parse({
      ...request,
      expectedLinks: original,
      links: reordered,
    }),
  );
  assert.deepEqual(linksFromDocument(content).rusutsu.xUrls, reordered);
  const liftLinks = parseResortLinksMap(content);
  assert.deepEqual(liftLinks.rusutsu.xUrls, reordered);
  assert.deepEqual(
    linksFromDocument(JSON.stringify(liftLinks)).rusutsu.xUrls,
    reordered,
  );
});

test("リンク保存は対象の1項目だけを変更し、旧形式・未知の項目を保持する", () => {
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
    JSON.parse(patchLinksDocument(JSON.stringify(before), request)),
    { ...before, rusutsu: { ...before.rusutsu, xUrls: request.links } },
  );
});

test("同じ欄への古い編集は拒否し、別の欄の更新は保持する", () => {
  assert.throws(
    () =>
      patchLinksDocument(
        JSON.stringify({
          rusutsu: { xUrls: [{ url: "https://x.com/concurrent" }] },
        }),
        request,
      ),
    /別の操作で更新/,
  );
  assert.throws(() => patchLinksDocument("broken", request));
  assert.throws(() => patchLinksDocument('{"rusutsu":null}', request));
});

test("旧形式を読み込め、最後のリンク削除でも他のリンクは残る", () => {
  const content = JSON.stringify({
    rusutsu: {
      xUrls: ["https://x.com/old"],
      officialSiteUrls: ["https://example.com"],
    },
  });
  assert.deepEqual(linksFromDocument(content).rusutsu.xUrls, [
    { url: "https://x.com/old" },
  ]);
  assert.deepEqual(
    JSON.parse(
      patchLinksDocument(content, {
        ...request,
        expectedLinks: [{ url: "https://x.com/old" }],
        links: [],
      }),
    ).rusutsu,
    { xUrls: [], officialSiteUrls: ["https://example.com"] },
  );
});

test("Instagram共有リンクの?stkn=トークンは保存時に取り除かれる", () => {
  assert.equal(
    stripTrackingParams("https://www.instagram.com/rusutsu/?stkn=abc123"),
    "https://www.instagram.com/rusutsu/",
  );
  assert.equal(
    stripTrackingParams("https://www.instagram.com/rusutsu/?hl=ja&stkn=abc123"),
    "https://www.instagram.com/rusutsu/?hl=ja",
  );
  // stknを含まないURLは変更しない
  assert.equal(
    stripTrackingParams("https://www.instagram.com/rusutsu/?hl=ja"),
    "https://www.instagram.com/rusutsu/?hl=ja",
  );

  assert.deepEqual(
    JSON.parse(
      patchLinksDocument(null, {
        ...request,
        platform: "instagramUrls",
        expectedLinks: [],
        links: [{ url: "https://www.instagram.com/rusutsu/?stkn=abc123" }],
      }),
    ).rusutsu.instagramUrls,
    [{ url: "https://www.instagram.com/rusutsu/" }],
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
      linkSaveSchema.safeParse({ ...request, links: [{ url }] }).success,
      false,
      url,
    );
  }
  assert.equal(
    linkSaveSchema.safeParse({
      ...request,
      links: [
        { url: "https://twitter.com/Account/" },
        { url: "https://x.com/account" },
      ],
    }).success,
    false,
  );
  // 非SNS項目はドメイン制限なしで任意の http(s) URLを受け付ける。
  assert.equal(
    linkSaveSchema.safeParse({
      ...request,
      platform: "officialSiteUrls",
      links: [{ url: "https://example.com" }],
    }).success,
    true,
  );
  assert.equal(
    linkSaveSchema.safeParse({ ...request, resortId: "../other" }).success,
    false,
  );
  assert.equal(linkSaveSchema.safeParse(request).success, true);
});
