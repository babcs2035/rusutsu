import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDefaultSearchWord,
  toSearchWordItemName,
  updateDefaultSearchWord,
} from "./searchWord";

test("leading course codes are dropped only when a name follows", () => {
  const cases: [string, string][] = [
    ["A1 ファミリー", "ファミリー"],
    ["DG1 ドラゴンドラ連絡", "ドラゴンドラ連絡"],
    ["C-1 ハツカ石第1トリプル", "ハツカ石第1トリプル"],
    ["[C1] メロディ", "メロディ"],
    ["⑪ ももんが", "ももんが"],
    ["➄ すいすいファミリー", "すいすいファミリー"],
    ["Ⅲ クロス", "クロス"],
    ["5-A マイペース", "マイペース"],
    ["9 ゴールド1", "ゴールド1"],
    ["A 中央ゲレンデ", "中央ゲレンデ"],
    // 名前そのもの
    ["A2", "A2"],
    ["4B", "4B"],
    ["E.T", "E.T"],
    ["N1トリプル", "N1トリプル"],
    ["Base ゲレンデ", "Base ゲレンデ"],
    ["X-JAM 第5ペア", "X-JAM 第5ペア"],
    ["Hakuba47 Line-8", "Hakuba47 Line-8"],
    ["1000林間", "1000林間"],
    ["無名峰トリプル", "無名峰トリプル"],
  ];
  for (const [input, expected] of cases)
    assert.equal(toSearchWordItemName(input), expected, input);
});

test("section ids and unnamed markers are removed", () => {
  assert.equal(toSearchWordItemName("[S4, S5] ブロンコ_#上部"), "ブロンコ");
  assert.equal(toSearchWordItemName("1-2 ダイナミック_2"), "ダイナミック");
  assert.equal(toSearchWordItemName("Ⅳ_1"), "Ⅳ");
  assert.equal(toSearchWordItemName("無名_連絡通路"), "連絡通路");
  assert.equal(toSearchWordItemName("無名_1448328440"), "");
  assert.equal(toSearchWordItemName("名前不明"), "");
  assert.equal(toSearchWordItemName("*"), "");
});

test("default search word uses the official resort name", () => {
  assert.equal(
    buildDefaultSearchWord("富良野スキー場", "B1 ファミリーR"),
    "富良野スキー場 ファミリーR",
  );
  assert.equal(buildDefaultSearchWord("ルスツリゾート", "名前不明"), "");
});

test("hand-written search words are kept when the name changes", () => {
  assert.equal(
    updateDefaultSearchWord("ルスツ　イゾラA", "ルスツリゾート", "A", "B"),
    "ルスツ　イゾラA",
  );
  assert.equal(
    updateDefaultSearchWord(
      "ルスツリゾート イゾラA",
      "ルスツリゾート",
      "イゾラA",
      "イゾラB",
    ),
    "ルスツリゾート イゾラB",
  );
});
