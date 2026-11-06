// 仕様書 節B（1日＋ナイター券がある型）を実装
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateRentalPlan } from "../rental";
import {
  adult,
  DAY,
  DAY_NIGHT,
  dayInput,
  hours,
  NIGHT,
  party,
} from "../testing/specResort";
import { resortB, resortB03, resortB12a, resortB12b } from "./fixtures/b";
import { check, D, rentalTotalOf } from "./helpers";

const SAT = D.sat;
const WED = D.wed;
const skiSet = party({
  ...adult(),
  rental: { sport: "ski", items: ["skis", "ski_boots", "poles"] },
});

test("B01 土・1日", () => {
  check(resortB, SAT, DAY, { primary: "1日券 5000" });
});

test("B02 土・1日＋ナイター", () => {
  check(resortB, SAT, DAY_NIGHT, { primary: "1日＋ナイター券 6000" });
});

test("B03 土・1日＋ナイター（1日＋ナイター券を削除）", () => {
  check(resortB03, SAT, DAY_NIGHT, { primary: "1日券＋ナイター券 7500" });
});

test("B04 土・ナイター", () => {
  check(resortB, SAT, NIGHT, { primary: "ナイター券 2500" });
});

test("B05 水・ナイター", () => {
  check(resortB, WED, NIGHT, { primary: null });
});

test("B06 水・1日＋ナイター", () => {
  check(resortB, WED, DAY_NIGHT, {
    primary: "1日券 5000",
    notes: ["この日はナイター営業がありません"],
  });
});

test("B07 土・4時間", () => {
  check(resortB, SAT, hours(4), {
    primary: "4時間券 4000",
    timeRestricted: ["ナイター券 2500(17:00〜21:00)"],
  });
});

test("B08 土・9時間", () => {
  check(resortB, SAT, hours(9), {
    primary: "1日＋ナイター券 6000",
    shorter: ["1日券 5000(8.5時間)"],
  });
});

test("B09 水・9時間", () => {
  check(resortB, WED, hours(9), {
    primary: "1日券 5000",
    notes: ["この日の営業は8.5時間（8:30〜17:00）です"],
  });
});

test("B10 土・6時間", () => {
  check(resortB, SAT, hours(6), { primary: "1日券 5000" });
});

test("B11 土・ナイター＋スキーセット", () => {
  check(resortB, SAT, NIGHT, { primary: "ナイター券 2500" }, skiSet);
  assert.equal(rentalTotalOf(resortB, SAT, NIGHT, skiSet), 2500);
});

test("B12a 土・1日＋ナイター＋スキーセット（日中のレンタルはナイター終了まで使える）", () => {
  check(
    resortB12a,
    SAT,
    DAY_NIGHT,
    { primary: "1日＋ナイター券 6000" },
    skiSet,
  );
  assert.equal(rentalTotalOf(resortB12a, SAT, DAY_NIGHT, skiSet), 5000);
});

test("B12b 同じ入力（日中のレンタルは17:00まで）", () => {
  check(
    resortB12b,
    SAT,
    DAY_NIGHT,
    { primary: "1日＋ナイター券 6000" },
    skiSet,
  );
  assert.equal(rentalTotalOf(resortB12b, SAT, DAY_NIGHT, skiSet), 7500);
});

test("B12c 同じ入力（公式に書かれていなかった）", () => {
  // 日中のレンタルの終了時刻を持たないデータ。resortB を使う
  check(resortB, SAT, DAY_NIGHT, { primary: "1日＋ナイター券 6000" }, skiSet);
  assert.equal(rentalTotalOf(resortB, SAT, DAY_NIGHT, skiSet), 5000);
  // レンタルの注記・夜の借り足し候補はレンタルの計算結果に出る
  const text = JSON.stringify(
    calculateRentalPlan(resortB, dayInput(SAT, DAY_NIGHT, skiSet)),
  );
  assert.ok(
    text.includes("日中のレンタルが夜も使えるかは公式で確認してください"),
    "確認を促す注記が無い",
  );
  assert.ok(text.includes("2500"), "ナイターレンタル 2,500円の追加候補が無い");
});

test("B13 土・4時間＋スキーセット", () => {
  check(
    resortB,
    SAT,
    hours(4),
    {
      primary: "4時間券 4000",
      timeRestricted: ["ナイター券 2500(17:00〜21:00)"],
    },
    skiSet,
  );
  assert.equal(rentalTotalOf(resortB, SAT, hours(4), skiSet), 5000);
  assert.equal(rentalTotalOf(resortB, SAT, NIGHT, skiSet), 2500);
});
