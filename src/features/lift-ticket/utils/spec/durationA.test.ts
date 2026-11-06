// 仕様書 節A（標準型）と節A2（午前券・午後券だけの型）を実装
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adult,
  DAY,
  DAY_NIGHT,
  hours,
  NIGHT,
  party,
} from "../testing/specResort";
import { resortA, resortA2, resortA09 } from "./fixtures/a";
import { check, D, rentalTotalOf } from "./helpers";

const sat = D.sat;
const withRental = (
  items: readonly ("skis" | "ski_boots" | "poles" | "wear")[],
) => party({ ...adult(), rental: { sport: "ski", items: [...items] } });
const SKI = ["skis", "ski_boots", "poles"] as const;

test("A01 1日", () => {
  check(resortA, sat, DAY, { primary: "1日券 5000" });
});

test("A02 4時間", () => {
  check(resortA, sat, hours(4), {
    primary: "4時間券 4000",
    timeRestricted: ["午前券 3500(8:30〜12:30)", "午後券 3500(12:30〜16:30)"],
  });
});

test("A03 3時間（A02と同じ）", () => {
  check(resortA, sat, hours(3), {
    primary: "4時間券 4000",
    timeRestricted: ["午前券 3500(8:30〜12:30)", "午後券 3500(12:30〜16:30)"],
  });
});

test("A04 5時間", () => {
  check(resortA, sat, hours(5), {
    primary: "1日券 5000",
    shorter: ["4時間券 4000", "午前券 3500", "午後券 3500"],
  });
});

test("A05 8時間", () => {
  check(resortA, sat, hours(8), { primary: "1日券 5000" });
});

test("A06 9時間", () => {
  check(resortA, sat, hours(9), {
    primary: "1日券 5000",
    notes: ["この日の営業は8時間（8:30〜16:30）です"],
  });
});

test("A07 1日＋ナイター", () => {
  check(resortA, sat, DAY_NIGHT, {
    primary: "1日券 5000",
    notes: ["この日はナイター営業がありません"],
  });
});

test("A08 ナイター", () => {
  check(resortA, sat, NIGHT, { primary: null });
});

test("A09 4時間（4時間券を3,000円に変更）", () => {
  check(resortA09, sat, hours(4), { primary: "4時間券 3000" });
});

test("A10 1日＋スキーセット", () => {
  check(resortA, sat, DAY, { primary: "1日券 5000" }, withRental(SKI));
  assert.equal(rentalTotalOf(resortA, sat, DAY, withRental(SKI)), 5000);
});

test("A11 4時間＋スキーセット", () => {
  check(
    resortA,
    sat,
    hours(4),
    {
      primary: "4時間券 4000",
      timeRestricted: ["午前券 3500(8:30〜12:30)", "午後券 3500(12:30〜16:30)"],
    },
    withRental(SKI),
  );
  assert.equal(rentalTotalOf(resortA, sat, hours(4), withRental(SKI)), 3800);
});

test("A12 1日＋板とブーツだけ", () => {
  const members = withRental(["skis", "ski_boots"]);
  check(resortA, sat, DAY, { primary: "1日券 5000" }, members);
  assert.equal(rentalTotalOf(resortA, sat, DAY, members), 5000);
});

test("A13 1日＋スキーセット＋ウェア", () => {
  const members = withRental([...SKI, "wear"]);
  check(resortA, sat, DAY, { primary: "1日券 5000" }, members);
  assert.equal(rentalTotalOf(resortA, sat, DAY, members), 9000);
});

test("A2-01 1時間", () => {
  check(resortA2, sat, hours(1), {
    primary: "1日券 5000",
    timeRestricted: ["午前券 3000", "午後券 3000"],
  });
});

test("A2-02 4時間", () => {
  check(resortA2, sat, hours(4), {
    primary: "1日券 5000",
    timeRestricted: ["午前券 3000(4時間)", "午後券 3000(4.5時間)"],
  });
});

test("A2-03 5時間", () => {
  check(resortA2, sat, hours(5), {
    primary: "1日券 5000",
    shorter: ["午後券 3000(4.5時間)", "午前券 3000(4時間)"],
  });
});

test("A2-04 1日（午前券＋午後券の6,000円より安い）", () => {
  check(resortA2, sat, DAY, { primary: "1日券 5000" });
});
