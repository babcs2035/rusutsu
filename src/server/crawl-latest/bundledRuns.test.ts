import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBundledCategories,
  bundledFileNameFromRunId,
  bundledObservedAt,
  bundledRunId,
  isBundledRunId,
} from "./bundledRuns";

test("file names map to run ids and back", () => {
  assert.equal(bundledRunId("2025_1123_202120.json"), "file-2025_1123_202120");
  assert.equal(isBundledRunId("file-2025_1123_202120"), true);
  assert.equal(isBundledRunId("cmu4fdfef0005zybqnwmclc84"), false);
  assert.equal(
    bundledFileNameFromRunId("file-2025_1123_202120"),
    "2025_1123_202120.json",
  );
  assert.equal(bundledFileNameFromRunId("file-broken"), null);
});

test("the timestamp in a file name is read as JST", () => {
  assert.equal(
    bundledObservedAt("2025_1123_202120.json"),
    "2025-11-23T11:21:20.000Z",
  );
  assert.equal(bundledObservedAt("broken.json"), null);
});

test("a saved crawl result becomes the same four categories as a database run", () => {
  const categories = buildBundledCategories({
    resortName: "dynaland",
    time: "2025/11/23 20:21:20",
    comment: "本日営業中",
    commentUrl: ["https://example.com/condition/#comment"],
    weather: { 中腹: { weather: "曇り", temperature: 12 } },
    weatherUrl: "https://example.com/condition/#gelande",
    courses: [
      { name: "パラダイスA", status: "×" },
      { name: "", status: "○" },
    ],
    courseUrl: [],
    lifts: [{ name: "第1ペア", status: "○" }],
  });

  assert.deepEqual(
    categories.map(category => [
      category.kind,
      category.state,
      category.itemCount,
      category.usableItemCount,
    ]),
    [
      ["COMMENT", "SUCCESS", 1, 1],
      ["WEATHER", "SUCCESS", 1, 1],
      ["COURSES", "SUCCESS", 2, 1],
      ["LIFTS", "SUCCESS", 1, 1],
    ],
  );
  assert.deepEqual(categories[0]?.sourceUrls, [
    "https://example.com/condition/#comment",
  ]);
  assert.deepEqual(categories[1]?.sourceUrls, [
    "https://example.com/condition/#gelande",
  ]);
  assert.notEqual(categories[2]?.nameSetHash, null);
});

test("missing or empty sections are reported as empty, not as values", () => {
  const categories = buildBundledCategories({
    comment: "   ",
    weather: {},
    courses: [],
  });
  assert.deepEqual(
    categories.map(category => [category.kind, category.state]),
    [
      ["COMMENT", "EMPTY"],
      ["WEATHER", "EMPTY"],
      ["COURSES", "EMPTY"],
      ["LIFTS", "EMPTY"],
    ],
  );
  for (const category of categories) {
    assert.equal(category.data, null);
    assert.equal(category.contentHash, null);
    assert.equal(category.nameSetHash, null);
  }
  assert.deepEqual(buildBundledCategories("壊れたJSON").length, 4);
});
