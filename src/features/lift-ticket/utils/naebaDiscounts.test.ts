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
  "src/private/data/lift-ticket-test-fixtures/ui/naeba/2025-2026.json",
);

const data = JSON.parse(fs.readFileSync(NAEBA, "utf8")) as LiftTicketData;

const input = (
  date: string,
  age: number,
  category: TicketPartyCategory = "adult",
): LiftTicketSearchInput => ({
  visitDate: date,
  // 前日までの宿泊者券が「もう買えない」と判定されないよう、照会日をシーズン前に固定する
  today: "2025-11-01",
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
  assert.match(hotelOffer?.conditions.join(" ") ?? "", /利用日の前日まで/);
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

test("条件説明に含むカード名は繰り返さず、別の提示物は残す", () => {
  const standard = data.offers.find(
    offer => offer.id === "offer-naeba-1day-adult",
  );
  assert.ok(standard);
  const member = {
    ...standard,
    id: "member",
    name_ja: "メンバーズカード会員",
    discount_reasons: ["membership"],
    target_qualification: {
      description_ja: "メンバーズカードをお持ちの方",
    },
    requirements: [
      { proof_ja: "メンバーズカード" },
      { proof_ja: "本人確認書類" },
    ],
    price: { amount: 5000 },
  };
  const result = calculateLiftTicket(
    { ...data, offers: [...data.offers, member] },
    input("2026-01-06", 30),
    "prod-naeba-1day",
  );
  assert.deepEqual(
    result.conditionalOffers.find(offer => offer.offerName === member.name_ja)
      ?.conditions,
    ["メンバーズカードをお持ちの方", "要提示: 本人確認書類"],
  );
});
