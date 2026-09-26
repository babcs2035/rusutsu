import assert from "node:assert/strict";
import { test } from "node:test";
import { sourceLabelOf, splitSources } from "./sources";

test("全行が同じ出典なら共通にまとめ、行ごとには出さない", () => {
  assert.deepEqual(splitSources([[1], [1], [1]]), {
    common: [1],
    extras: [[], [], []],
  });
});

test("一部の行だけ別の出典を使うなら、その行にだけ追加分を出す", () => {
  assert.deepEqual(splitSources([[1], [1, 2], [1]]), {
    common: [1],
    extras: [[], [2], []],
  });
});

test("別ページ由来の行が一部だけなら、主な出典は見出しに残してその行にだけ出す", () => {
  assert.deepEqual(splitSources([[1], [1], [4], [1]]), {
    common: [1],
    extras: [[], [], [4], []],
  });
});

test("半分に満たない出典は見出しに出さない", () => {
  assert.deepEqual(splitSources([[1], [2], [3]]), {
    common: [],
    extras: [[1], [2], [3]],
  });
});

test("出典の無い行は共通判定に使わない", () => {
  assert.deepEqual(splitSources([[1], [], [1]]), {
    common: [1],
    extras: [[], [], []],
  });
});

test("ページ名からサイト名を落とす", () => {
  const url = "https://example.com/";
  assert.equal(
    sourceLabelOf({
      number: 1,
      url,
      title: "ゴンドラ・リフト券 - 北海道 ルスツリゾート",
    }),
    "ゴンドラ・リフト券",
  );
  assert.equal(
    sourceLabelOf({
      number: 1,
      url,
      title: "料金・リフト券｜札幌国際スキー場",
    }),
    "料金・リフト券",
  );
  assert.equal(
    sourceLabelOf({
      number: 1,
      url,
      title: "各種料金 | MEIHO RESORT Winter2026-27",
    }),
    "各種料金",
  );
  assert.equal(
    sourceLabelOf({ number: 1, url: "https://www.example.com/a", title: null }),
    "example.com",
  );
});
