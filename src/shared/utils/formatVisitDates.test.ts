import assert from "node:assert/strict";
import test from "node:test";
import { formatVisitDates } from "./formatVisitDates";

test("同じ月は月を省略し、重複と空の日付を除く", () => {
  assert.equal(
    formatVisitDates(["2026-10-18", "", "2026-10-19", "2026-10-18"]),
    "10/18~19",
  );
  assert.equal(formatVisitDates(["2026-02-03", "2026-02-05"]), "2/3,5");
});

test("月が変わるところでは月を表示し、入力順を保つ", () => {
  assert.equal(
    formatVisitDates(["2026-10-31", "2026-11-01", "2026-11-02"]),
    "10/31~11/2",
  );
  assert.equal(
    formatVisitDates(["2026-10-18", "2026-11-01", "2026-10-19"]),
    "10/18・11/1・10/19",
  );
});

test("年をまたぐ日付は同じ月でも省略しない", () => {
  assert.equal(formatVisitDates(["2026-12-31", "2027-01-01"]), "12/31~1/1");
  assert.equal(formatVisitDates(["2026-10-18", "2027-10-19"]), "10/18・10/19");
});

test("同月・月またぎの連続した期間をまとめる", () => {
  assert.equal(
    formatVisitDates(["2026-10-18", "2026-10-19", "2026-10-20"]),
    "10/18~20",
  );
  assert.equal(
    formatVisitDates(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]),
    "10/30~11/2",
  );
});

test("連続する期間と飛び飛びの日付を区切る", () => {
  assert.equal(
    formatVisitDates(["2026-10-18", "2026-10-19", "2026-10-20", "2026-11-01"]),
    "10/18~20・11/1",
  );
  assert.equal(
    formatVisitDates(["2026-10-18", "2026-10-20", "2026-10-21", "2026-10-24"]),
    "10/18,20~21,24",
  );
  assert.equal(
    formatVisitDates(["2026-10-31", "2026-11-01", "2026-11-03"]),
    "10/31~11/1,3",
  );
});

test("月末・うるう年・年末の連続日を正しく判定する", () => {
  assert.equal(formatVisitDates(["2026-02-28", "2026-03-01"]), "2/28~3/1");
  assert.equal(
    formatVisitDates(["2024-02-28", "2024-02-29", "2024-03-01"]),
    "2/28~3/1",
  );
  assert.equal(formatVisitDates(["2024-02-28", "2024-03-01"]), "2/28・3/1");
  assert.equal(
    formatVisitDates(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]),
    "12/30~1/2",
  );
});

test("単日と未設定の日付を表示する", () => {
  assert.equal(formatVisitDates(["2026-10-18"]), "10/18");
  assert.equal(formatVisitDates([]), "");
  assert.equal(formatVisitDates([""]), "");
});
