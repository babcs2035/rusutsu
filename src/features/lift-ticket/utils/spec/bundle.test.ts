// 仕様書 BN（リフト券＋レンタルのセット券、BN01〜BN06）
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TicketRentalRequest } from "../../types";
import { calculateLiftTicketPlan } from "../calculateLiftTicket";
import { calculateRentalPlan } from "../rental";
import { calculateRentalBundle } from "../rentalBundle";
import {
  adult,
  daysInput,
  elementary,
  hours,
  type SpecMember,
} from "../testing/specResort";
import {
  adultOnlyPackResort,
  fullPackResort,
  hoursVsPackResort,
  multiDayPackResort,
  noHelmetPackResort,
  studentPackResort,
} from "./fixtures/bundle";
import { grandTotal, withRental } from "./grand";

const JAN13 = "2027-01-13";
const SKI3: TicketRentalRequest = {
  sport: "ski",
  items: ["skis", "ski_boots", "poles"],
};
const rent = (member: SpecMember, request = SKI3): SpecMember => ({
  ...member,
  rental: request,
});

test("BN01 当日学割パック（6時間券＋スキーセット）7,100円。大学生20歳・6時間＋スキーセット", () => {
  const result = withRental(
    studentPackResort,
    JAN13,
    [rent({ category: "university", count: 1, age: 20 })],
    { duration: hours(6) },
  );
  assert.equal(grandTotal(result), 7100);
});
test("BN02 パックに1日・2日・3日がある。2日連続は2日パック 17,000円", () => {
  const input = daysInput(
    [{ date: "2027-01-18" }, { date: "2027-01-19" }],
    [{ id: "g1", category: "adult", age: null, count: 1, rental: SKI3 }],
  );
  const plan = calculateLiftTicketPlan(multiDayPackResort, input);
  const rental = calculateRentalPlan(multiDayPackResort, input);
  const bundle = calculateRentalBundle(multiDayPackResort, input, plan, rental);
  assert.equal(bundle?.total, 17000);
  assert.match(bundle?.lines[0]?.productName ?? "", /2日パック/);
});
test("BN03 パックの中身がスキー3点＋ウェア＋ゴーグル＋グローブで 15,400円（別々なら 19,300円）", () => {
  const result = withRental(fullPackResort, JAN13, [
    rent(adult(1), {
      sport: "ski",
      items: ["skis", "ski_boots", "poles", "wear", "goggles", "gloves"],
    }),
  ]);
  assert.equal(grandTotal(result), 15400);
  assert.equal(result.bundle?.separateTotal, 19300);
});
test("BN04 パックにヘルメットが含まれない。スキー3点＋ヘルメットはパック＋ヘルメット単品 9,000円（別々 11,000円）", () => {
  const result = withRental(noHelmetPackResort, JAN13, [
    rent(adult(1), {
      sport: "ski",
      items: ["skis", "ski_boots", "poles", "helmet"],
    }),
  ]);
  assert.equal(grandTotal(result), 9000);
});
test("BN05 パック対象は大人だけ。大人＋小学生は大人だけパック、小学生は別々（8,000円＋3,000円＋3,500円）", () => {
  const result = withRental(adultOnlyPackResort, JAN13, [
    rent(adult(1)),
    rent(elementary(1)),
  ]);
  assert.equal(grandTotal(result), 14500);
});
test("BN06 1日券＋スキーセットのパック 8,000円より、4時間券＋4時間レンタル 7,800円が安い", () => {
  const result = withRental(hoursVsPackResort, JAN13, [rent(adult(1))], {
    duration: hours(4),
  });
  assert.equal(grandTotal(result), 7800);
});
