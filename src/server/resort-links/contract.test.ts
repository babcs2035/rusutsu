import assert from "node:assert/strict";
import test from "node:test";
import { resortLinkKey, resortLinkReplaceSchema } from "./contract";

const link = {
  resortId: "rusutsu-resort",
  type: "parking",
  url: "https://rusutsu.com/by-car/",
};

test("スキー場ごとの入れ替えは、そのスキー場のリンクだけを受け付ける", () => {
  const scope = {
    kind: "resort" as const,
    resortId: "rusutsu-resort",
    source: "official",
  };
  const editor = { kind: "skill" as const, id: "collect-official-links" };
  const ok = resortLinkReplaceSchema.parse({ scope, editor, links: [link] });
  assert.deepEqual(ok.links[0], {
    ...link,
    category: null,
    label: null,
    note: null,
    sortOrder: 0,
  });
  assert.equal(
    resortLinkReplaceSchema.safeParse({
      scope,
      editor,
      links: [{ ...link, resortId: "kiroro-snow-world" }],
    }).success,
    false,
  );
});

test("公式リンクを出どころ全体でまとめて入れ替えることはできない", () => {
  const editor = { kind: "crawler" as const, id: "tour-links" };
  assert.equal(
    resortLinkReplaceSchema.safeParse({
      scope: { kind: "source", source: "official" },
      editor,
      links: [],
    }).success,
    false,
  );
  assert.equal(
    resortLinkReplaceSchema.safeParse({
      scope: { kind: "source", source: "orion" },
      editor,
      links: [{ ...link, type: "busTour" }],
    }).success,
    true,
  );
});

test("http(s) 以外のURL・同じリンクの重複・人の編集者は拒否する", () => {
  const scope = { kind: "source" as const, source: "orion" };
  const editor = { kind: "crawler" as const, id: "tour-links" };
  const rejects = (value: unknown) =>
    assert.equal(resortLinkReplaceSchema.safeParse(value).success, false);
  rejects({ scope, editor, links: [{ ...link, url: "javascript:alert(1)" }] });
  rejects({ scope, editor, links: [link, { ...link, note: "同じリンク" }] });
  rejects({ scope, editor: { kind: "admin", id: "user" }, links: [link] });
});

test("ラベルが違えば別のリンクとして扱う", () => {
  const base = { ...link, category: null, label: null };
  assert.notEqual(
    resortLinkKey(base),
    resortLinkKey({ ...base, label: "札幌" }),
  );
  assert.equal(resortLinkKey(base), resortLinkKey({ ...base }));
});
