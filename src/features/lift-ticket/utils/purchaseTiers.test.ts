import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type {
  LiftTicketData,
  LiftTicketOffer,
  LiftTicketSearchInput,
} from "../types";
import { calculateLiftTicketPlan } from "./calculateLiftTicket";
import { buildPlanTiers } from "./planView";
import {
  dataForPurchaseTier,
  firstVisitDateOf,
  purchaseTierKeysOf,
} from "./purchaseTiers";
import { calculateRentalPlan } from "./rental";
import { calculateRentalBundle } from "./rentalBundle";

const NAEBA = path.join(
  process.cwd(),
  "src/private/data/lift-ticket-test-fixtures/ui/naeba/2025-2026.json",
);
const PRODUCT_PAGE = "https://example.test/store/1day";

/**
 * 苗場の通常1日券（おとな 7,800円）に、Web料金（当日まで）と早割（3日前まで）を足したデータ。
 * 金額を null にした買い方は足さない
 */
const withOffers = (
  web: number | null,
  early: number | null,
): LiftTicketData => {
  const data = JSON.parse(fs.readFileSync(NAEBA, "utf8")) as LiftTicketData;
  const standard = data.offers.find(
    offer => offer.id === "offer-naeba-1day-adult",
  ) as LiftTicketOffer;
  data.channels.push({
    id: "channel-test-web",
    name_ja: "テストWebストア",
    url: "https://example.test/store",
  });
  data.sources = [
    ...(data.sources ?? []),
    { id: "src-test-product", url: PRODUCT_PAGE },
  ];
  data.main_links = {
    lift_price_url: "https://example.test/price",
    lift_purchase_url: "https://example.test/store",
  };
  if (web != null)
    data.offers.push({
      ...standard,
      id: "offer-test-web",
      name_ja: "Web 苗場エリア1日券（おとな）",
      discount_reasons: ["online_purchase"],
      channel_ids: ["channel-test-web"],
      purchase_url: PRODUCT_PAGE,
      source_refs: ["src-test-product"],
      source_quotes: [{ source_id: "src-test-product", text: "¥7,000" }],
      purchase_deadline: {
        same_day_allowed: true,
        days_before_use: null,
        deadline_date: null,
        official_text_ja: null,
      },
      price: { currency: "JPY", amount: web },
    });
  if (early != null)
    data.offers.push({
      ...standard,
      id: "offer-test-early",
      name_ja: "早割 苗場エリア1日券（おとな）",
      discount_reasons: ["online_purchase", "advance_purchase"],
      channel_ids: ["channel-test-web"],
      purchase_deadline: {
        same_day_allowed: false,
        days_before_use: 3,
        deadline_date: null,
        official_text_ja: "利用日の3日前まで",
      },
      price: { currency: "JPY", amount: early },
    });
  return data;
};

const input = (visitDate: string, today: string): LiftTicketSearchInput => ({
  visitDate,
  today,
  usePreference: "full_day",
  days: [
    {
      id: "day-1",
      date: visitDate,
      duration: { kind: "day", withNight: false },
    },
  ],
  party: [{ id: "adult", category: "adult", age: 30, count: 1 }],
});

const tiersOf = (data: LiftTicketData, search: LiftTicketSearchInput) => {
  const visitDate = firstVisitDateOf(search);
  return buildPlanTiers(
    data,
    purchaseTierKeysOf(data, visitDate).map(key => {
      const tierData = dataForPurchaseTier(data, key, visitDate);
      const plan = calculateLiftTicketPlan(tierData, search);
      const rental = calculateRentalPlan(tierData, search);
      return {
        key,
        plan,
        rental,
        bundle: calculateRentalBundle(tierData, search, plan, rental),
      };
    }),
  );
};

test("早割・Web・通常を安い順に分け、それぞれの合計を出す", () => {
  const tiers = tiersOf(
    withOffers(7000, 6000),
    input("2026-01-10", "2025-12-20"),
  );
  assert.deepEqual(
    tiers.map(tier => [tier.label, tier.view.total]),
    [
      ["早割", 6000],
      ["Web", 7000],
      ["通常", 7800],
    ],
  );
  // 早割は「利用日の3日前まで」。見出しに期限を1つ出す
  assert.equal(tiers[0].deadline, "2026-01-07");
  assert.equal(tiers[1].deadline, null);
});

test("見出しのリンクは、Web・早割が購入ページの入口、通常が公式の料金表", () => {
  const tiers = tiersOf(
    withOffers(7000, 6000),
    input("2026-01-10", "2025-12-20"),
  );
  assert.deepEqual(
    tiers.map(tier => tier.link),
    [
      { kind: "purchase", url: "https://example.test/store" },
      { kind: "purchase", url: "https://example.test/store" },
      { kind: "source", url: "https://example.test/price" },
    ],
  );
});

test("Web料金の行は、券ごとの商品ページとその金額の場所を持つ", () => {
  const tiers = tiersOf(
    withOffers(7000, null),
    input("2026-01-10", "2025-12-20"),
  );
  const line = tiers[0].view.shownLines[0].line;
  assert.equal(tiers[0].label, "Web");
  assert.equal(line.purchaseUrl, PRODUCT_PAGE);
  assert.equal(line.purchaseQuote?.text, "¥7,000");
});

test("締切を過ぎた早割は出さず、窓口と同額のWeb料金は「Web」として出す", () => {
  // 利用日の2日前。早割（3日前まで）はもう買えない。Web料金は窓口と同額
  const tiers = tiersOf(
    withOffers(7800, 6000),
    input("2026-01-10", "2026-01-08"),
  );
  assert.deepEqual(
    tiers.map(tier => [tier.label, tier.view.total]),
    [
      ["Web", 7800],
      ["通常", 7800],
    ],
  );
  assert.equal(tiers[0].view.shownLines[0].line.purchaseUrl, PRODUCT_PAGE);
});

test("Web・前売の料金が無いデータは、通常の1回だけ計算する", () => {
  const data = JSON.parse(fs.readFileSync(NAEBA, "utf8")) as LiftTicketData;
  const withoutWeb = {
    ...data,
    offers: data.offers.filter(
      offer =>
        !(offer.discount_reasons ?? []).some(reason =>
          ["online_purchase", "advance_purchase"].includes(reason),
        ),
    ),
    party_rules: [],
    rentals: [],
  };
  assert.deepEqual(purchaseTierKeysOf(withoutWeb, "2026-01-10"), ["counter"]);
});
