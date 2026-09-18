import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ObservationTimes } from "./ObservationTimes";

const textOf = (entries: Array<{ label: string; time?: string | null }>) =>
  renderToStaticMarkup(createElement(ObservationTimes, { entries })).replace(
    /<[^>]+>/g,
    "",
  );

test("取得日時が同じなら対象を書かずにまとめる", () => {
  const text = textOf([
    { label: "コース", time: "2026/1/1 8:00" },
    { label: "リフト", time: "2026/1/1 8:00" },
    { label: "コンディション", time: "2026/1/1 8:00" },
  ]);
  assert.equal(text, "2026/1/1 8:00 取得");
});

test("取得日時が分かれたら対象を前置きする", () => {
  const text = textOf([
    { label: "コース", time: "2026/1/1 8:00" },
    { label: "リフト", time: "2026/1/1 8:00" },
    { label: "コンディション", time: "2026/6/1 8:00" },
  ]);
  assert.equal(
    text,
    "コース, リフト: 2026/1/1 8:00 取得コンディション: 2026/6/1 8:00 取得",
  );
});

test("日時が取れない対象は取得日時不明として分ける", () => {
  const text = textOf([
    { label: "コース", time: null },
    { label: "コンディション", time: "2026/1/1 8:00" },
  ]);
  assert.equal(text, "コース: 取得日時不明コンディション: 2026/1/1 8:00 取得");
});

test("行ごとに時計アイコンを出す", () => {
  const html = renderToStaticMarkup(
    createElement(ObservationTimes, {
      entries: [
        { label: "コース", time: "2026/1/1 8:00" },
        { label: "コンディション", time: "2026/6/1 8:00" },
      ],
    }),
  );
  assert.equal(html.match(/<svg/g)?.length, 2);
});
