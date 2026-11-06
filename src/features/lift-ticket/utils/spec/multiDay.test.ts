// 仕様書 T（25時間券、T01〜T08）と L（複数日、L01〜L20）
import assert from "node:assert/strict";
import { test } from "node:test";
import type { LiftTicketData } from "../../types";
import { calculateLiftTicketPlan } from "../calculateLiftTicket";
import { calculateRentalPlan } from "../rental";
import {
  adult,
  type DAY,
  daysInput,
  elementary,
  hours,
  party,
  type SpecMember,
} from "../testing/specResort";
import {
  hoursPoolNoDaysResort,
  hoursPoolResort,
  multiDayClosedResort,
  multiDayResort,
  topupOnlyResort,
} from "./fixtures/multiDay";

type Plan = Array<{
  date: string;
  duration?: Parameters<typeof hours>[0] extends number
    ? ReturnType<typeof hours>
    : never;
}>;
const dates = (from: string, count: number) => {
  const start = new Date(`${from}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start.getTime() + index * 86400000);
    return day.toISOString().slice(0, 10);
  });
};
const run = (
  data: LiftTicketData,
  plans: Array<{
    date: string;
    duration?: ReturnType<typeof hours> | typeof DAY;
  }>,
  members: SpecMember[] = [adult(1)],
) => calculateLiftTicketPlan(data, daysInput(plans, party(...members)));
const consecutiveDays = (
  from: string,
  count: number,
  duration?: ReturnType<typeof hours>,
) => dates(from, count).map(date => ({ date, duration }));
void ({} as Plan);

// ---------- T ----------
test("T01 1日・5時間（5時間券 14,500円。25時間券のほうが高い）", () => {
  const plan = run(hoursPoolResort, [
    { date: "2027-01-18", duration: hours(5) },
  ]);
  assert.equal(plan.total, 14500);
  assert.equal(plan.days[0].result.productName, "5時間券");
});
test("T02 4日連続・各日6時間（計24時間）は25時間券 39,000円", () => {
  const plan = run(hoursPoolResort, consecutiveDays("2027-01-18", 4, hours(6)));
  assert.equal(plan.total, 39000);
  assert.equal(plan.multiDay?.kind, "hours_pool");
});
test("T03 5日連続・各日6時間（計30時間）は25時間券＋トップアップ5時間 46,300円", () => {
  const plan = run(hoursPoolResort, consecutiveDays("2027-01-18", 5, hours(6)));
  assert.equal(plan.total, 46300);
  assert.equal(plan.multiDay?.kind, "hours_pool");
  assert.equal(plan.multiDay?.addOns.length, 1);
});
test("T04 2日連続・各日1日（計22時間）は2日券 26,000円", () => {
  const plan = run(hoursPoolResort, consecutiveDays("2027-01-18", 2));
  assert.equal(plan.total, 26000);
  assert.equal(plan.multiDay?.kind, "consecutive_days");
});
test("T05 3日連続・各日5時間（計15時間）は3日券と25時間券が同額 39,000円", () => {
  const plan = run(hoursPoolResort, consecutiveDays("2027-01-18", 3, hours(5)));
  assert.equal(plan.total, 39000);
  // 決めた規則: 同額なら連続日券（3日券）を上にする
  assert.equal(plan.multiDay?.kind, "consecutive_days");
  // 仕様: 25時間券は「10時間残ります」と注記する（案として表示される想定）
  assert.ok(
    JSON.stringify(plan).includes("10時間残ります"),
    "25時間券の「10時間残ります」の注記が無い",
  );
});
test("T06 大人2名・2日連続・各日6時間は25時間券を2人で分けず、各人の券で計算する", () => {
  const plan = run(
    hoursPoolResort,
    consecutiveDays("2027-01-18", 2, hours(6)),
    [adult(2)],
  );
  // 各人 12時間: 2日券 26,000円×2人（25時間券を2人で24時間として分けると 39,000円になってしまう）
  assert.equal(plan.total, 52000);
  assert.notEqual(plan.total, 39000);
});
test("T07 トップアップだけ・1日5時間（単独では使わない）", () => {
  const plan = run(topupOnlyResort, [
    { date: "2027-01-18", duration: hours(5) },
  ]);
  assert.equal(plan.total, null);
});
test("T08 1/18と1/25の2日・各日1日（25時間券 39,000円と1日券×2 33,400円を比べて 33,400円）", () => {
  const plan = run(hoursPoolNoDaysResort, [
    { date: "2027-01-18" },
    { date: "2027-01-25" },
  ]);
  assert.equal(plan.total, 33400);
  assert.notEqual(plan.multiDay?.kind, "consecutive_days");
});

// ---------- L ----------
const lTotal = (
  plans: Array<{
    date: string;
    duration?: ReturnType<typeof hours> | typeof DAY;
  }>,
  data = multiDayResort,
  members: SpecMember[] = [adult(1)],
) => run(data, plans, members);
const d = (...list: string[]) => list.map(date => ({ date }));
const span = (from: string, count: number) => d(...dates(from, count));

test("L01 1/18〜19（2日券 10,500円）", () => {
  assert.equal(lTotal(span("2027-01-18", 2)).total, 10500);
});
test("L02 1/18〜20（3日券 15,000円）", () => {
  assert.equal(lTotal(span("2027-01-18", 3)).total, 15000);
});
test("L03 1/18〜21（21,000円）", () => {
  assert.equal(lTotal(span("2027-01-18", 4)).total, 21000);
});
test("L04 1/18〜22（3日券＋2日券で 25,500円）", () => {
  assert.equal(lTotal(span("2027-01-18", 5)).total, 25500);
});
test("L05 1/18〜23（3日券×2で 30,000円）", () => {
  assert.equal(lTotal(span("2027-01-18", 6)).total, 30000);
});
test("L06 1/18〜19と1/21〜22（2日券×2で 21,000円）", () => {
  assert.equal(
    lTotal(d("2027-01-18", "2027-01-19", "2027-01-21", "2027-01-22")).total,
    21000,
  );
});
test("L07 1/18と1/21（選択日券 11,000円）", () => {
  const plan = lTotal(d("2027-01-18", "2027-01-21"));
  assert.equal(plan.total, 11000);
  assert.equal(plan.perDayTotal, 12000);
});
test("L08 1/18〜19と1/21（2日券＋1日券で 16,500円）", () => {
  assert.equal(
    lTotal(d("2027-01-18", "2027-01-19", "2027-01-21")).total,
    16500,
  );
});
test("L09 1/18〜20（1/19は臨時休業）: 1/18と1/20は選択日券 11,000円、1/19は料金なし", () => {
  const plan = lTotal(span("2027-01-18", 3), multiDayClosedResort);
  assert.equal(plan.days[1].result.payableTotal, null);
  assert.equal(plan.days[1].result.status, "closed");
  assert.equal(plan.total, 11000);
});
test("L10 2/27〜28と3/3〜4（通常期 2日券 10,500円＋春期 2日券 9,000円で 19,500円）", () => {
  assert.equal(
    lTotal(d("2027-02-27", "2027-02-28", "2027-03-03", "2027-03-04")).total,
    19500,
  );
});
test("L11 2/28〜3/1（初日の期間の 2日券 10,500円＋「期間をまたぎます」の注記）", () => {
  const plan = lTotal(d("2027-02-28", "2027-03-01"));
  assert.equal(plan.total, 10500);
  // 仕様: 「期間をまたぎます」と注記する。複数日券の案か日ごとの注記に出る想定
  const text = JSON.stringify([
    plan.days.map(day => day.result.notes),
    plan.multiDay?.lines.map(line => [line.note, line.warnings]),
    plan.multiDay?.notes,
  ]);
  assert.ok(text.includes("期間をまたぎます"), "期間をまたぐ注記が無い");
});
test("L12 1/18は1日、1/19は4時間（2日券と1日券＋4時間券が同額 10,500円）", () => {
  const plan = lTotal([
    { date: "2027-01-18" },
    { date: "2027-01-19", duration: hours(4) },
  ]);
  assert.equal(plan.total, 10500);
  // 決めた規則: 同額なら1日ずつ買う案（複数日券は安いときだけ採用）
  assert.equal(plan.multiDay, null);
});
test("L13 女性・1/20〜22（3日券 15,000円。レディースDAYで 14,000円を条件付きで出す）", () => {
  const plan = lTotal(span("2027-01-20", 3));
  assert.equal(plan.total, 15000);
  const offers = plan.multiDay?.conditionalOffers ?? [];
  assert.ok(
    offers.some(offer => offer.subtotal === 14000),
    `14,000円の条件付き候補が無い: ${JSON.stringify(offers.map(o => [o.label, o.subtotal]))}`,
  );
});
test("L14 大人1＋小学生1・1/18〜21（大人 21,000円＋小学生 11,000円で 32,000円）", () => {
  assert.equal(
    lTotal(span("2027-01-18", 4), multiDayResort, [adult(1), elementary(1)])
      .total,
    32000,
  );
});

// レンタル込み（リフト券＋レンタル）
const SKI_SET = {
  sport: "ski" as const,
  items: ["skis" as const, "ski_boots" as const, "poles" as const],
};
const withRental = (
  plans: Array<{
    date: string;
    duration?: ReturnType<typeof hours> | typeof DAY;
  }>,
) => {
  const input = daysInput(plans, party({ ...adult(1), rental: SKI_SET }));
  const plan = calculateLiftTicketPlan(multiDayResort, input);
  const rental = calculateRentalPlan(multiDayResort, input);
  return { plan, rental, total: (plan.total ?? 0) + (rental.total ?? 0) };
};
test("L15 1/18〜19＋スキーセット（10,500円＋8,700円で 19,200円）", () => {
  const r = withRental(span("2027-01-18", 2));
  assert.equal(r.plan.total, 10500);
  assert.equal(r.rental.total, 8700);
  assert.equal(r.total, 19200);
});
test("L16 1/18〜20＋スキーセット（3日券 15,000円＋レンタル 12,700円で 27,700円）", () => {
  const r = withRental(span("2027-01-18", 3));
  assert.equal(r.plan.total, 15000);
  assert.equal(r.rental.total, 12700);
  assert.equal(r.total, 27700);
});
test("L17 1/18〜23＋スキーセット（リフト券 30,000円＋レンタル 24,700円）", () => {
  const r = withRental(span("2027-01-18", 6));
  assert.equal(r.plan.total, 30000);
  assert.equal(r.rental.total, 24700);
  assert.equal(
    r.rental.lines[0]?.picks.every(pick => pick.shopName === "店舗A"),
    true,
  );
});
test("L18 1/18〜25（8日）＋スキーセット（店舗Aの2日＋延長6日で 32,700円・店舗混在なし）", () => {
  const r = withRental(span("2027-01-18", 8));
  assert.equal(r.rental.total, 32700);
  const shops = new Set(
    r.rental.lines.flatMap(line => line.picks.map(pick => pick.shopName)),
  );
  assert.deepEqual([...shops], ["店舗A"]);
});
test("L19 1/18と1/21＋スキーセット（選択日券 11,000円＋レンタル1日×2で 9,400円）", () => {
  const r = withRental(d("2027-01-18", "2027-01-21"));
  assert.equal(r.plan.total, 11000);
  assert.equal(r.rental.total, 9400);
});
test("L20 1/18〜19＋スキーセット、1/19だけ4時間（リフト券 10,500円＋レンタル2日 8,700円）", () => {
  const r = withRental([
    { date: "2027-01-18" },
    { date: "2027-01-19", duration: hours(4) },
  ]);
  assert.equal(r.plan.total, 10500);
  assert.equal(r.rental.total, 8700);
});
