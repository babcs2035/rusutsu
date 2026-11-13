import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayKindSummary,
  dayReportsPath,
  dayResorts,
  dayShareText,
  dayShareTitle,
  formatObservedOn,
  shareTargets,
} from "./dayShare";

const post = (
  resortId: string,
  resortName: string,
  kind: "COURSE" | "LIFT" | "MOGUL" | "ITEM",
) => ({ resortId, resortName, entries: [{ kind }] }) as never;

test("共有ページのURLは投稿者と滑走日で決まる", () => {
  assert.equal(
    dayReportsPath("user 1", "2026-11-13"),
    "/community/day/user%201/2026-11-13",
  );
  assert.equal(
    dayReportsPath("u1", "2026-11-13", "p/1"),
    "/community/day/u1/2026-11-13?post=p%2F1",
  );
});

test("滑走日に曜日を添える", () => {
  assert.equal(formatObservedOn("2026-11-13"), "2026/11/13(金)");
  assert.equal(formatObservedOn("2027-01-01", false), "1/1(金)");
});

test("投稿の多いスキー場を先に並べる", () => {
  const posts = [
    post("a", "Aスキー場", "COURSE"),
    post("b", "Bスキー場", "LIFT"),
    post("b", "Bスキー場", "MOGUL"),
  ];
  assert.deepEqual(dayResorts(posts), [
    { id: "b", name: "Bスキー場", count: 2 },
    { id: "a", name: "Aスキー場", count: 1 },
  ]);
  assert.equal(
    dayShareTitle(posts, "2026-11-13"),
    "Bスキー場・Aスキー場の現地レポート 11/13(金)",
  );
  assert.equal(
    dayShareTitle([...posts, post("c", "Cスキー場", "ITEM")], "2026-11-13"),
    "Bスキー場ほか2か所の現地レポート 11/13(金)",
  );
});

test("種類ごとの件数を決まった順で書く", () => {
  const posts = [
    post("a", "A", "ITEM"),
    post("a", "A", "COURSE"),
    post("a", "A", "COURSE"),
    post("a", "A", "LIFT"),
  ];
  assert.equal(dayKindSummary(posts), "コース2件・パーク1件・リフト1件");
  assert.equal(
    dayShareText(posts, "2026-11-13"),
    "Aの現地レポート 11/13(金)（コース2件・パーク1件・リフト1件）",
  );
});

test("共有先のURLに文とリンクを入れる", () => {
  const targets = shareTargets("https://example.test/a?b=1", "雪 & 晴れ");
  assert.deepEqual(
    targets.map(target => target.id),
    ["x", "line", "facebook"],
  );
  assert.equal(
    targets[0].href,
    "https://x.com/intent/post?text=%E9%9B%AA%20%26%20%E6%99%B4%E3%82%8C&url=https%3A%2F%2Fexample.test%2Fa%3Fb%3D1",
  );
  assert.ok(
    targets[2].href.endsWith("u=https%3A%2F%2Fexample.test%2Fa%3Fb%3D1"),
  );
});
