// 仕様書 前提: 資格が要る割引は条件付き候補に出す（会員・地元・宿泊者など）。Y02 の網羅用
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateLiftTicketPlan } from "../calculateLiftTicket";
import { DAY, dayInput } from "../testing/specResort";
import { memberDiscountResort } from "./fixtures/conditionalOffers";

test("会員割引（基準料金から500円引き）は確定料金に使わず、条件付き候補に出す", () => {
  const plan = calculateLiftTicketPlan(
    memberDiscountResort,
    dayInput("2027-01-20", DAY),
  );
  assert.equal(plan.total, 6000);
  const offers = plan.days[0].result.conditionalOffers;
  assert.ok(
    offers.some(offer => offer.unitAmount === 5500),
    JSON.stringify(offers),
  );
});
