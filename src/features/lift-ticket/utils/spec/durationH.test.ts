// 仕様書 節H（曜日で営業が変わる型）・I（期間で営業が変わる型）・J（早朝営業がある型）・K（券の選び方）を実装
import assert from "node:assert/strict";
import { test } from "node:test";
import { DAY, DAY_NIGHT, hours, NIGHT } from "../testing/specResort";
import {
  resortH,
  resortI,
  resortJ,
  resortK01,
  resortK02,
  resortK03,
  resortK04,
  resortK05,
  resortK06,
  resortK07,
  resortK08,
  resortK09,
} from "./fixtures/h";
import { check, D, planText } from "./helpers";

test("H01 火 1/19・1日", () => {
  check(resortH, D.tue, DAY, { primary: "1日券 2500" });
});

test("H02 水 1/20・1日（その日の営業は13:00〜16:30だけ）", () => {
  check(resortH, D.wed, DAY, { primary: "午後券 1300" });
});

test("H03 水・3時間", () => {
  check(resortH, D.wed, hours(3), {
    primary: "午後券 1300",
    shorter: ["ナイター券 700(2.5時間)"],
  });
});

test("H04 水・4時間（休止の1時間は数えない）", () => {
  check(resortH, D.wed, hours(4), {
    primary: "午後券＋ナイター券 2000",
    shorter: ["午後券 1300(3.5時間)"],
  });
});

test("H05 水・ナイター", () => {
  check(resortH, D.wed, NIGHT, { primary: "ナイター券 700" });
});

test("H06 水・1日＋ナイター", () => {
  check(resortH, D.wed, DAY_NIGHT, { primary: "午後券＋ナイター券 2000" });
});

test("H07 火・ナイター", () => {
  check(resortH, D.tue, NIGHT, { primary: null });
});

test("H08 月 1/18・1日（定休日）", () => {
  check(resortH, D.mon, DAY, { primary: null });
});

test("H09 月 1/11（成人の日）・1日", () => {
  check(resortH, D.holidayMon, DAY, { primary: "1日券 2500" });
});

test("H10 月 1/11・ナイター", () => {
  check(resortH, D.holidayMon, NIGHT, { primary: null });
});

test("H11 土 1/23・1日＋ナイター", () => {
  check(resortH, D.sat, DAY_NIGHT, { primary: "1日券＋ナイター券 3200" });
});

test("H12 日 1/24・3時間", () => {
  check(resortH, D.sun, hours(3), {
    primary: "1日券 2500",
    timeRestricted: ["午前券 1300(9:30〜13:00)", "午後券 1300(13:00〜16:30)"],
  });
});

test("H13 日・4時間", () => {
  check(resortH, D.sun, hours(4), {
    primary: "1日券 2500",
    shorter: ["午前券 1300(3.5時間)", "午後券 1300(3.5時間)"],
  });
});

test("H14 土・9時間", () => {
  check(resortH, D.sat, hours(9), { primary: "1日券＋ナイター券 3200" });
});

test("H15 火・9時間", () => {
  check(resortH, D.tue, hours(9), {
    primary: "1日券 2500",
    notes: ["この日の営業は7時間（9:30〜16:30）です"],
  });
});

test("I01 12/30・8時間", () => {
  check(resortI, D.dec30, hours(8), {
    primary: "1日券 4000",
    notes: ["この日の営業は7.5時間（8:30〜16:00）です"],
  });
});

test("I02 1/20・8時間", () => {
  check(resortI, D.wed, hours(8), { primary: "1日券 4000" });
});

test("I03 12/30・4時間", () => {
  check(resortI, D.dec30, hours(4), {
    primary: "1日券 4000",
    shorter: ["午後券 3000(3.5時間)"],
  });
});

test("I04 1/20・4時間", () => {
  check(resortI, D.wed, hours(4), {
    primary: "1日券 4000",
    timeRestricted: ["午後券 3000(12:30〜16:30)"],
  });
});

test("J01 土・1日（早朝は含まない）", () => {
  check(resortJ, D.sat, DAY, { primary: "1日券 5000" });
});

test("J02 土・9時間（早朝を足さない）", () => {
  check(resortJ, D.sat, hours(9), {
    primary: "1日券 5000",
    notes: ["この日の営業は8.5時間（8:00〜16:30）です"],
  });
});

test("K01 6時間券・8時間券・9時間券・1日券で7時間", () => {
  check(resortK01, D.wed, hours(7), {
    primary: "9時間券 5500",
    shorter: ["6時間券 5000(6時間)"],
  });
});

test("K02 トワイライト券と4時間券（ナイター営業日）で2時間", () => {
  check(resortK02, D.wed, hours(2), {
    primary: "4時間券 3500",
    timeRestricted: ["トワイライト券 2500(15:00〜21:00)"],
  });
});

test("K03 初心者エリア限定1日券と1日券で1日", () => {
  check(resortK03, D.wed, DAY, { primary: "1日券 5000" });
});

test("K04 回数券・ポイント券だけで4時間", () => {
  check(resortK04, D.wed, hours(4), { primary: null });
});

test("K05 4時間券 平日 3,500円・休日 4,000円で、土曜・4時間", () => {
  check(resortK05, D.sat, hours(4), { primary: "4時間券 4000" });
});

test("K06 単独の1日券 5,000円と共通券 8,000円で1日", () => {
  check(resortK06, D.wed, DAY, { primary: "1日券 5000" });
});

test("K07 温泉入浴付き9時間券 6,000円だけで7時間", () => {
  check(resortK07, D.wed, hours(7), { primary: "温泉入浴付き9時間券 6000" });
});

test("K08 1日券 5,000円と食事券付き1日券 5,500円で1日", () => {
  check(resortK08, D.wed, DAY, { primary: "1日券 5000" });
  // 食事券付き 5,500円も「食事券1,000円分付き」として候補に出す
  const text = planText(resortK08, D.wed, DAY);
  assert.ok(text.includes("食事券付き1日券") && text.includes("5500"));
});

test("K09 食事券付き1日券 5,500円しか無い日で1日", () => {
  check(resortK09, D.wed, DAY, { primary: "食事券付き1日券 5500" });
  assert.ok(planText(resortK09, D.wed, DAY).includes("食事券1,000円分"));
});
