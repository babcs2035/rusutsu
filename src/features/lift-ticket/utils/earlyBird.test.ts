import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type {
  LiftTicketData,
  LiftTicketOffer,
  LiftTicketSearchInput,
} from "../types";
import { calculateLiftTicket } from "./calculateLiftTicket";
import { buildLiftTicketPriceTables } from "./priceTable";

const NAEBA = path.join(
  process.cwd(),
  "src/private/data/lift-ticket/naeba/2025-2026.json",
);

/**
 * 苗場の通常1日券（おとな 7,800円）に、誰でも買える早割を足したデータ。
 * 早割は 11/30 まで販売、利用日の3日前まで購入可。
 */
const withEarlyBird = (
  amount: number,
  salesEnd = "2025-11-30",
): LiftTicketData => {
  const data = JSON.parse(fs.readFileSync(NAEBA, "utf8")) as LiftTicketData;
  const standard = data.offers.find(
    offer => offer.id === "offer-naeba-1day-adult",
  ) as LiftTicketOffer;
  data.offers.push({
    ...standard,
    id: "offer-naeba-1day-adult-early",
    name_ja: "早割 苗場エリア1日券（おとな）",
    official_label_ja: "早割1日券",
    discount_reasons: ["online_purchase", "advance_purchase"],
    channel_ids: ["channel-webket-advance"],
    sales_period: { start: "2025-10-01", end: salesEnd },
    purchase_deadline: {
      same_day_allowed: false,
      days_before_use: 3,
      deadline_date: null,
      official_text_ja: "利用日の3日前まで",
    },
    price: { currency: "JPY", amount },
  });
  return data;
};

const input = (visitDate: string, today: string): LiftTicketSearchInput => ({
  visitDate,
  today,
  usePreference: "full_day",
  party: [{ id: "adult", category: "adult", age: 30, count: 1 }],
});

test("販売期間中で通常料金より安い早割は、計算結果そのものに使う", () => {
  const result = calculateLiftTicket(
    withEarlyBird(6000),
    input("2026-01-10", "2025-11-15"),
    "prod-naeba-1day",
  );

  assert.equal(result.payableTotal, 6000);
  assert.equal(result.lines[0].offerName, "早割 苗場エリア1日券（おとな）");
  assert.equal(result.lines[0].standardUnitAmount, 7800);
  // 買い方は1行に短くまとめる（いつまでに買うかだけ）
  assert.equal(
    result.lines[0].purchaseNote,
    "Webで事前購入（利用日の3日前まで・11/30まで販売）",
  );
  assert.equal(
    result.conditionalOffers.some(offer => offer.offerName.includes("早割")),
    false,
    "計算に使った早割を条件付き候補にも重ねて出している",
  );
});

test("販売期間が終わった早割は、利用日がまだ先でも計算にも候補にも出さない", () => {
  const result = calculateLiftTicket(
    withEarlyBird(6000),
    input("2026-01-10", "2025-12-01"),
    "prod-naeba-1day",
  );

  assert.equal(result.payableTotal, 7800);
  assert.equal(result.lines[0].offerName, "苗場エリア1日券（おとな）");
  assert.equal(
    result.conditionalOffers.some(offer => offer.offerName.includes("早割")),
    false,
  );
});

test("販売期間中でも「利用日の3日前まで」を過ぎていれば使わない", () => {
  const result = calculateLiftTicket(
    withEarlyBird(6000, "2026-03-31"),
    input("2025-12-14", "2025-12-12"),
    "prod-naeba-1day",
  );

  assert.equal(result.payableTotal, 7800);
  assert.equal(
    result.conditionalOffers.some(offer => offer.offerName.includes("早割")),
    false,
  );
});

test("通常料金と同額の早割は使わず、窓口の通常料金を出す", () => {
  const result = calculateLiftTicket(
    withEarlyBird(7800),
    input("2026-01-10", "2025-11-15"),
    "prod-naeba-1day",
  );

  assert.equal(result.lines[0].offerName, "苗場エリア1日券（おとな）");
  assert.equal(result.lines[0].standardUnitAmount, null);
});

test("料金表は販売中の早割を販売期間付きで載せ、販売終了後は一切載せない", () => {
  const data = withEarlyBird(6000);
  const findEarlyRow = (today: string) =>
    buildLiftTicketPriceTables(data, {
      scope: "single",
      today,
    }).discount.rows.find(row => row.label === "早割1日券");

  const onSale = findEarlyRow("2025-11-15");
  assert.ok(onSale, "販売中の早割が料金表にない");
  assert.ok(onSale.notes.includes("販売期間: 2025/10/1〜2025/11/30"));

  assert.equal(findEarlyRow("2025-12-01"), undefined);
});
