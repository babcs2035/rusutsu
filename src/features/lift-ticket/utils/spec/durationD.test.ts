// 仕様書 節D（めがひら型）・E（営業時間が短い型）・F（営業時間が不明な型）・G（1日券より安い長時間券がある型）を実装
import assert from "node:assert/strict";
import { test } from "node:test";
import { DAY, DAY_NIGHT, hours, NIGHT } from "../testing/specResort";
import {
  resortD,
  resortD04,
  resortD05,
  resortE,
  resortF,
  resortF07,
  resortG01,
  resortG02,
  resortG03,
  resortG04,
} from "./fixtures/d";
import { check, D, optionsOf } from "./helpers";

test("D01 水・1日", () => {
  check(resortD, D.wed, DAY, { primary: "9時間券 6300" });
});

test("D02 水・9時間", () => {
  check(resortD, D.wed, hours(9), { primary: "9時間券 6300" });
});

test("D03 水・8時間", () => {
  check(resortD, D.wed, hours(8), { primary: "9時間券 6300" });
});

test("D04 水・1日（営業時間を不明に変更）", () => {
  check(resortD04, D.wed, DAY, {
    primary: "9時間券 6300",
    notes: ["営業時間不明のため8:00〜17:00と仮定"],
  });
});

test("D05 水・1日（その日の営業を 8:00〜17:30 に変更）", () => {
  check(resortD05, D.wed, DAY, {
    primary: "9時間券 6300",
    notes: ["この日の営業は9.5時間（8:00〜17:30）です"],
  });
});

test("D06 土（ナイターあり）・1日＋ナイター", () => {
  check(resortD, D.satNight, DAY_NIGHT, {
    primary: "9時間券＋4時間券 12600",
    longestSingle: "9時間券 6800(9時間)",
  });
});

test("D07 土・ナイター", () => {
  check(resortD, D.satNight, NIGHT, { primary: "4時間券 5800" });
});

test("D08 水・4時間", () => {
  check(resortD, D.wed, hours(4), {
    primary: "4時間券 5400",
    timeRestricted: ["平日ゴゴイチ券 3800(13:00〜17:00)"],
    shorter: ["3時間券 4900"],
  });
});

test("D09 土（ナイターなし）・1日", () => {
  check(resortD, D.sat, DAY, { primary: "9時間券 6800" });
});

test("D10 火・1日（定休日）", () => {
  check(resortD, D.tue, DAY, { primary: null });
});

test("E01 7時間", () => {
  check(resortE, D.wed, hours(7), { primary: "1日券 4500" });
});

test("E02 8時間", () => {
  check(resortE, D.wed, hours(8), {
    primary: "1日券 4500",
    notes: ["この日の営業は7.5時間（8:30〜16:00）です"],
  });
});

test("E03 9時間（E02と同じ）", () => {
  check(resortE, D.wed, hours(9), {
    primary: "1日券 4500",
    notes: ["この日の営業は7.5時間（8:30〜16:00）です"],
  });
});

test("E04 5時間", () => {
  check(resortE, D.wed, hours(5), { primary: "5時間券 4000" });
});

test("E05 6時間", () => {
  check(resortE, D.wed, hours(6), {
    primary: "1日券 4500",
    shorter: ["5時間券 4000(5時間)"],
  });
});

const ASSUMED = "営業時間不明のため8:00〜17:00と仮定";

test("F01 1日", () => {
  check(resortF, D.wed, DAY, { primary: "1日券 5000", notes: [ASSUMED] });
});

test("F02 4時間", () => {
  check(resortF, D.wed, hours(4), {
    primary: "1日券 5000",
    timeRestricted: ["午前券 3500(8:00〜12:00)", "午後券 3500(12:00〜17:00)"],
  });
});

test("F03 5時間", () => {
  check(resortF, D.wed, hours(5), {
    primary: "1日券 5000",
    timeRestricted: ["午後券 3500(12:00〜17:00)"],
    shorter: ["午前券 3500(4時間)"],
  });
});

test("F04 6時間", () => {
  check(resortF, D.wed, hours(6), {
    primary: "1日券 5000",
    shorter: ["午後券 3500(5時間)"],
  });
});

test("F05 9時間", () => {
  check(resortF, D.wed, hours(9), { primary: "1日券 5000", notes: [ASSUMED] });
});

test("F06 ナイター", () => {
  check(resortF, D.wed, NIGHT, { primary: null });
});

test("F07 通常営業が不明でナイター 16:00〜20:00 がある日・1日＋ナイター", () => {
  // 通常営業を 8:00〜16:00 と仮定（仮定の終了をナイター開始にそろえる）
  const { day } = optionsOf(resortF07, D.wed, DAY_NIGHT);
  assert.equal(day.options?.assumedHours, true);
  assert.ok(day.options?.notes.includes(ASSUMED));
  assert.equal(day.options?.primary?.productName, "1日券＋ナイター券");
  // 1日券の滑れる時間は 8:00〜16:00 の8時間
  const dayOnly = optionsOf(resortF07, D.wed, DAY).day.options;
  assert.equal(dayOnly?.primary?.hours, 8);
});

test("G01 オープニング期間・1日（営業 8:30〜16:30）", () => {
  check(resortG01, D.opening, DAY, { primary: "9時間券 3900" });
});

test("G02 オープニング期間・1日（営業 8:00〜17:00、注記なし）", () => {
  check(resortG02, D.opening, DAY, {
    primary: "9時間券 3900",
    noNotes: ["営業は", "仮定"],
  });
});

test("G03 オープニング期間・1日（営業時間不明）", () => {
  check(resortG03, D.opening, DAY, {
    primary: "9時間券 3900",
    notes: [ASSUMED],
  });
});

test("G04 オープニング期間・1日（営業 8:00〜17:30）", () => {
  check(resortG04, D.opening, DAY, {
    primary: "1日券 5500",
    shorter: ["9時間券 3900(9時間)"],
  });
});

test("G05 オープニング期間・7時間（営業 8:30〜16:30）", () => {
  check(resortG01, D.opening, hours(7), { primary: "9時間券 3900" });
});

test("G06 通常期間・1日（営業 8:30〜16:30）", () => {
  check(resortG01, D.wed, DAY, {
    primary: "1日券 5500",
    shorter: ["7時間券 5300(7時間)"],
  });
});
