import assert from "node:assert/strict";
import test from "node:test";
import { parsePublishedTime } from "@/shared/utils/publishedTime";
import { formatPublishedDate, summarizePublishedDates } from "./operationDates";

test("年月日・月日・時刻だけを補完せず統一表示する", () => {
  assert.equal(formatPublishedDate("2026年3月29日"), "2026/3/29現在");
  assert.equal(formatPublishedDate("3月29日 8時"), "3/29 8時現在");
  assert.equal(formatPublishedDate("午前8時"), "8時現在");
  assert.equal(formatPublishedDate("8:30"), "08:30現在");
  assert.equal(formatPublishedDate("日時未定"), null);
  assert.equal(formatPublishedDate("2026/2/30"), null);
  assert.equal(
    formatPublishedDate(parsePublishedTime("2026/3/29 8:30")),
    "2026/3/29 08:30現在",
  );
});

test("複数の日付を最古から最新までにまとめ、元の配列順に依存しない", () => {
  assert.deepEqual(
    summarizePublishedDates(["2026/4/4 17:00", "2026/3/29 8:00", "2026/4/1"]),
    ["2026/3/29〜4/4現在"],
  );
  assert.deepEqual(summarizePublishedDates(["4/4", "3月29日"]), [
    "3/29〜4/4現在",
  ]);
  assert.deepEqual(summarizePublishedDates(["2026/1/1", "2025/12/31"]), [
    "2025/12/31〜2026/1/1現在",
  ]);
});

test("同日の日時は時刻の範囲、同じ日時は一度だけ表示する", () => {
  assert.deepEqual(
    summarizePublishedDates(["2026年4月4日 17時30分", "2026/4/4 8:00"]),
    ["2026/4/4 08:00〜17:30現在"],
  );
  assert.deepEqual(
    summarizePublishedDates(["2026/4/4 8:00 更新", "2026年4月4日8時00分"]),
    ["2026/4/4 08:00現在"],
  );
  assert.deepEqual(summarizePublishedDates(["08:30:45", "08:30:15"]), [
    "08:30:15〜08:30:45現在",
  ]);
});

test("混在する精度は粗い方にそろえ、未知の日付を他の値で補わない", () => {
  assert.deepEqual(summarizePublishedDates(["2026/4/4", "2026/4/4 8:00"]), [
    "2026/4/4現在",
  ]);
  assert.deepEqual(summarizePublishedDates(["8時", "9:45"]), ["8時〜9時現在"]);
  assert.deepEqual(summarizePublishedDates(["2026/4/4", "4/4", "8:30"]), [
    "2026/4/4現在",
    "4/4現在",
    "08:30現在",
  ]);
  assert.deepEqual(summarizePublishedDates(["12/31", "1/1"]), [
    "12/31現在",
    "1/1現在",
  ]);
  assert.deepEqual(summarizePublishedDates(["更新", "不明", null]), []);
});
