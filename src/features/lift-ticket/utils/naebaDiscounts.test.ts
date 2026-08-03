import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type {
  LiftTicketData,
  LiftTicketSearchInput,
  TicketPartyCategory,
} from "../types";
import { calculateLiftTicket } from "./calculateLiftTicket";

const NAEBA = path.join(
  process.cwd(),
  "src/private/data/lift-ticket/naeba/tickets/2025-2026.json",
);

const data = JSON.parse(fs.readFileSync(NAEBA, "utf8")) as LiftTicketData;

const input = (
  date: string,
  age: number,
  category: TicketPartyCategory = "adult",
): LiftTicketSearchInput => ({
  visitDate: date,
  usePreference: "full_day",
  party: [
    {
      id: "adult",
      category,
      age,
      count: 1,
    },
  ],
});

test("平日の20歳は無料を自動適用し、対象生年月日を警告する", () => {
  const result = calculateLiftTicket(
    data,
    input("2026-01-06", 20),
    "prod-naeba-1day",
  );

  assert.equal(result.status, "complete");
  assert.equal(result.payableTotal, 0);
  assert.equal(result.lines[0].offerName, "平日20才リフト無料");
  assert.equal(result.lines[0].standardUnitAmount, 7800);
  assert.match(
    result.lines[0].warnings?.join(" ") ?? "",
    /2005年4月2日〜2006年4月1日生まれ/,
  );
  assert.deepEqual(
    result.conditionalOffers,
    [],
    "適用後の0円より高い条件付き料金を表示している",
  );
});

test("障がい者区分は専用料金を適用する", () => {
  const result = calculateLiftTicket(
    data,
    input("2026-01-06", 30, "disabled"),
    "prod-naeba-1day",
  );

  assert.equal(result.payableTotal, 3900);
  assert.equal(
    result.lines[0].offerName,
    "苗場エリア1日券（障がい者本人・対象介護者）",
  );
  assert.equal(result.lines[0].standardUnitAmount, 7800);
  assert.match(result.lines[0].warnings?.join(" ") ?? "", /証明書|ミライロID/);
});

test("障がい者専用料金が無い場合は通常の大人料金へ戻す", () => {
  const withoutDisabilityOffers: LiftTicketData = {
    ...data,
    offers: data.offers.filter(
      offer => !offer.id.startsWith("offer-disability-"),
    ),
  };
  const result = calculateLiftTicket(
    withoutDisabilityOffers,
    input("2026-01-06", 30, "disabled"),
    "prod-naeba-1day",
  );

  assert.equal(result.payableTotal, 7800);
  assert.equal(result.lines[0].offerName, "苗場エリア1日券（おとな）");
});

test("20歳でも対象期間外は通常料金になり、資格割引は条件付きで別掲する", () => {
  const result = calculateLiftTicket(
    data,
    input("2025-12-16", 20),
    "prod-naeba-1day",
  );

  assert.equal(result.payableTotal, 7800);
  assert.equal(result.lines[0].offerName, "苗場エリア1日券（おとな）");
  assert.equal(
    result.conditionalOffers.some(
      offer => offer.offerName === "宿泊者専用 苗場エリア1日券",
    ),
    true,
  );
  const hotelOffer = result.conditionalOffers.find(
    offer => offer.offerName === "宿泊者専用 苗場エリア1日券",
  );
  assert.equal(hotelOffer?.unitAmount, 5500);
  assert.match(hotelOffer?.conditions.join(" ") ?? "", /苗場プリンスホテル/);
  assert.match(hotelOffer?.conditions.join(" ") ?? "", /利用日前日まで/);
});

test("年齢が20歳でなければ平日20才無料を適用しない", () => {
  const result = calculateLiftTicket(
    data,
    input("2026-01-06", 21),
    "prod-naeba-1day",
  );

  assert.equal(result.payableTotal, 7800);
  assert.equal(result.lines[0].offerName, "苗場エリア1日券（おとな）");
  assert.equal(
    result.conditionalOffers.some(
      offer => offer.offerName === "平日20才リフト無料",
    ),
    false,
  );
});
