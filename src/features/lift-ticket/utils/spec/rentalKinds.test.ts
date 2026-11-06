// 仕様書 R（レンタルの種類、R01〜R18）と RT（レンタルの時間帯、RT01〜RT12）
import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  LiftTicketData,
  TicketDayDuration,
  TicketRentalRequest,
} from "../../types";
import { calculateRentalPlan } from "../rental";
import {
  adult,
  DAY,
  dayInput,
  elementary,
  hours,
  party,
  type SpecMember,
} from "../testing/specResort";
import {
  afternoonOnlyRentalResort,
  eightHourRentalLongDayResort,
  eightHourRentalResort,
  halfDayNoStartResort,
  halfDayRentalResort,
  nightRentalResort,
  qualifiedRentalResort,
  rentalBindingResort,
  rentalKindsNoShopBResort,
  rentalKindsNoWearSetResort,
  rentalKindsResort,
  shopMixResort,
  skiOnlyRentalResort,
  unpricedRentalResort,
  wearPartsResort,
} from "./fixtures/rentalKinds";

const JAN13 = "2027-01-13";
const SKI3: TicketRentalRequest = {
  sport: "ski",
  items: ["skis", "ski_boots", "poles"],
};
const ski = (...extra: TicketRentalRequest["items"]): TicketRentalRequest => ({
  sport: "ski",
  items: [...SKI3.items, ...extra],
});
const board = (
  ...extra: TicketRentalRequest["items"]
): TicketRentalRequest => ({
  sport: "snowboard",
  items: ["snowboard", "snowboard_boots", ...extra],
});
const only = (
  sport: TicketRentalRequest["sport"],
  ...items: TicketRentalRequest["items"]
): TicketRentalRequest => ({ sport, items });

const rentalOf = (
  data: LiftTicketData,
  members: SpecMember[],
  duration: TicketDayDuration = DAY,
) => calculateRentalPlan(data, dayInput(JAN13, duration, party(...members)));
const adultRent = (request: TicketRentalRequest): SpecMember => ({
  ...adult(1),
  rental: request,
});
const amount = (data: LiftTicketData, request: TicketRentalRequest) =>
  rentalOf(data, [adultRent(request)]);
const names = (result: ReturnType<typeof calculateRentalPlan>) =>
  result.lines.flatMap(line => line.picks.map(pick => pick.name));

// ---------- R ----------
test("R01 スキー（板・ブーツ・ストック）は店舗B 4,500円", () => {
  const result = amount(rentalKindsResort, SKI3);
  assert.equal(result.total, 4500);
  const shops = new Set(
    result.lines.flatMap(l => l.picks.map(p => p.shopName)),
  );
  assert.deepEqual([...shops], ["店舗B"]);
});
test("R02 R01から店舗Bを外したデータは店舗A スキーセット 5,000円", () => {
  const result = amount(rentalKindsNoShopBResort, SKI3);
  assert.equal(result.total, 5000);
  assert.equal(result.lines[0].picks.length, 1);
});
test("R03 スキー＋ウェア上下はスキーフルセット 8,000円", () => {
  const result = amount(rentalKindsResort, ski("wear"));
  assert.equal(result.total, 8000);
  assert.equal(result.lines[0].picks.length, 1);
});
test("R04 スキー＋ウェア上下＋ゴーグル＋グローブは手ぶらパック 9,000円", () => {
  const result = amount(rentalKindsResort, ski("wear", "goggles", "gloves"));
  assert.equal(result.total, 9000);
});
test("R05 スキー＋ゴーグル＋グローブ（ウェアなし）は 5,000円＋1,200円で 6,200円", () => {
  assert.equal(
    amount(rentalKindsResort, ski("goggles", "gloves")).total,
    5000 + 1200,
  );
});
test("R06 スキー＋ウェア上下＋ヘルメットは 8,000円＋1,000円で 9,000円", () => {
  assert.equal(amount(rentalKindsResort, ski("wear", "helmet")).total, 9000);
});
test("R07 ボード（板・ブーツ）＋ウェア上下はボードフルセット 8,500円", () => {
  assert.equal(amount(rentalKindsResort, board("wear")).total, 8500);
});
test.skip("R08 ウェア上だけ 2,500円（対象外: 画面で選べる用具は「ウェア」1種類で、上だけは選べない）", () => {});
test("R09 ウェア上下（上下セットが無いデータ）は上 2,500円＋下 2,000円で 4,500円", () => {
  // データは wear_top / wear_bottom の2件。画面の「ウェア」は上下の両方を借りる意味
  const result = amount(rentalKindsNoWearSetResort, only("ski", "wear"));
  assert.equal(result.total, 4500);
});
test("R10 スキーブーツだけは店舗B 1,500円", () => {
  assert.equal(amount(rentalKindsResort, only("ski", "ski_boots")).total, 1500);
});
test("R11 ゴーグル＋グローブだけは 1,200円", () => {
  assert.equal(
    amount(rentalKindsResort, only("ski", "goggles", "gloves")).total,
    1200,
  );
});
test("R12 小学生・スキー＋ウェア上下はスキーフルセット子ども 6,000円", () => {
  const result = rentalOf(rentalKindsResort, [
    { ...elementary(1), rental: ski("wear") },
  ]);
  assert.equal(result.total, 6000);
});
test("R13 中学生・スキー＋ウェア上下（レンタルの子どもは小学生以下）はスキーフルセット大人 8,000円", () => {
  const result = rentalOf(rentalKindsResort, [
    { category: "junior_high", count: 1, rental: ski("wear") },
  ]);
  assert.equal(result.total, 8000);
});
test("R14 スキー（ハイグレードもある）はスタンダードで計算する", () => {
  const result = amount(rentalKindsNoShopBResort, SKI3);
  assert.equal(result.total, 5000);
  assert.ok(!names(result).some(name => name.includes("high")));
});
test("R15 スキー（ショートスキーセット 3,500円がいちばん安い）でもショートスキーを代わりにしない", () => {
  const result = amount(rentalKindsNoShopBResort, SKI3);
  assert.equal(result.total, 5000);
  assert.ok(!names(result).some(name => name.includes("short")));
});
test("R16 ボード（ビンディングが別料金 1,000円の施設）は板＋ビンディング＋ブーツで 7,000円", () => {
  assert.equal(amount(rentalBindingResort, board()).total, 7000);
});
test("R17 帽子・ネックウォーマー（画面で選べない用具）は計算に含めない", () => {
  const result = amount(rentalKindsNoShopBResort, SKI3);
  assert.equal(result.total, 5000);
  assert.ok(!names(result).some(name => name.includes("hat")));
});
test("R18 大人1＋小学生1・2人ともボード＋ウェア上下は 8,500円＋6,500円で 15,000円", () => {
  const result = rentalOf(rentalKindsResort, [
    { ...adult(1), rental: board("wear") },
    { ...elementary(1), rental: board("wear") },
  ]);
  assert.equal(result.total, 15000);
});

// ---------- RT ----------
test("RT01 半日レンタル（13:00〜）があっても、朝から使う3時間券＋スキーセットは1日レンタル 5,000円", () => {
  const result = rentalOf(halfDayRentalResort, [adultRent(SKI3)], hours(3));
  assert.equal(result.total, 5000);
});
test("RT02 午後券（13:00〜）＋スキーセットは半日 3,500円", () => {
  const result = rentalOf(
    afternoonOnlyRentalResort,
    [adultRent(SKI3)],
    hours(4),
  );
  assert.equal(result.total, 3500);
});
test("RT03 ナイター用レンタル（16:00〜）は日中の3時間には使わない", () => {
  const result = rentalOf(nightRentalResort, [adultRent(SKI3)], hours(3));
  assert.notEqual(result.total, 6000);
  assert.equal(result.total, null);
});
test("RT04 開始時刻の無い半日レンタルは4時間以下にだけ使い、店舗確認の注記を出す", () => {
  const four = rentalOf(halfDayNoStartResort, [adultRent(SKI3)], hours(4));
  assert.equal(four.total, 3500);
  const text = JSON.stringify(four);
  assert.ok(
    text.includes("午前・午後の指定は店舗で確認してください"),
    "店舗確認の注記が無い",
  );
  const six = rentalOf(halfDayNoStartResort, [adultRent(SKI3)], hours(6));
  assert.equal(six.total, 5000);
});
test("RT05 8時間レンタル 4,000円だけ（1日料金なし）。営業 8:30〜16:30・1日は 4,000円", () => {
  const result = rentalOf(eightHourRentalResort, [adultRent(SKI3)], DAY);
  assert.equal(result.total, 4000);
});
test("RT06 RT05で営業 8:30〜17:00は 4,000円＋「この日の営業は8.5時間（8:30〜17:00）です」", () => {
  const result = rentalOf(eightHourRentalLongDayResort, [adultRent(SKI3)], DAY);
  assert.equal(result.total, 4000);
  assert.ok(
    JSON.stringify(result).includes("この日の営業は8.5時間（8:30〜17:00）です"),
    "営業時間の注記が無い",
  );
});
test("RT07 店舗Bの単品合計 4,500円が店舗Aのセット 5,000円より安い（店舗を混ぜない）", () => {
  const result = amount(shopMixResort, SKI3);
  assert.equal(result.total, 4500);
});
test("RT08 宿泊者限定のレンタル料金は確定料金に使わず、条件付き候補に出す", () => {
  const result = amount(qualifiedRentalResort, SKI3);
  assert.equal(result.total, 5000);
  // 仕様: 条件と金額を条件付き候補に出す（レンタルの結果型に条件付き候補の欄が無いため、結果全体から探す）
  const text = JSON.stringify(result);
  assert.ok(
    text.includes("宿泊者限定") && text.includes("3000"),
    "条件付き候補が無い",
  );
});
test("RT09 ハイグレードとスタンダードがある場合はスタンダード", () => {
  const result = amount(rentalKindsNoShopBResort, SKI3);
  assert.equal(result.total, 5000);
});
test("RT10 ボードを選んだがスキーのレンタルしか無い（料金なし＋ボードのレンタルはありません）", () => {
  const result = amount(skiOnlyRentalResort, board());
  // 料金なし（合計に足さない）＋借りられない用具として「ボード」を知らせる
  assert.equal(result.knownTotal, 0);
  assert.ok(
    result.missingLabels.some(label => label.includes("ボード")),
    JSON.stringify(result.missingLabels),
  );
});
test("RT11 ウェア上だけ・下だけ・上下がある。ウェア上下を選ぶと上下 4,000円", () => {
  assert.equal(amount(wearPartsResort, only("ski", "wear")).total, 4000);
});
test("RT12 料金の書かれていないレンタルだけは料金不明＋理由", () => {
  const result = amount(unpricedRentalResort, SKI3);
  assert.equal(result.total, null);
  assert.ok(
    result.lines.some(line => (line.note ?? "").length > 0),
    "理由が無い",
  );
});
