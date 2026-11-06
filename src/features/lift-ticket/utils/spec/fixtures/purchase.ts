/** 仕様書 W（Web・前売・早割）・PF（証明）・SP（特別日）・Z（データの形）の架空スキー場。test() は含めない */
import type { LiftTicketAudience, LiftTicketOffer } from "../../../types";
import {
  type SpecRental,
  type SpecResortInput,
  type SpecTicket,
  specResort,
} from "../../testing/specResort";

const ADULT_ELEMENTARY: LiftTicketAudience[] = [
  { id: "adult", name_ja: "大人", is_default: true },
  { id: "elementary", name_ja: "小学生", school_levels: ["elementary_school"] },
];
const dayTicket = (
  prices: SpecTicket["prices"],
  extra: Partial<SpecTicket> = {},
): SpecTicket => ({
  id: "day",
  name: "1日券",
  validity: { mode: "calendar_day", days: 1 },
  covers: ["regular"],
  prices,
  ...extra,
});
/** 同じ1日券（product 'day'）に、Web・早割の料金（別の販売経路）を足す */
const webOffer = (
  amount: number,
  audience: string,
  extra: Partial<LiftTicketOffer> = {},
): LiftTicketOffer => ({
  id: `day-web-${audience}-${amount}`,
  name_ja: "1日券（Web）",
  product_id: "day",
  audience_ids: [audience],
  calendar_ids: [],
  channel_ids: ["web"],
  discount_reasons: ["online_purchase"],
  price: { currency: "JPY", amount },
  source_refs: ["src"],
  ...extra,
});
const withWeb = (
  base: ReturnType<typeof specResort>,
  offers: LiftTicketOffer[],
) => {
  const allDays = base.calendars[0]?.id;
  return {
    ...base,
    offers: [
      ...base.offers,
      ...offers.map(offer => ({
        ...offer,
        calendar_ids: allDays ? [allDays] : [],
      })),
    ],
  };
};
const baseDay = (
  id: string,
  prices: SpecTicket["prices"],
  extra: Partial<SpecResortInput> = {},
) =>
  specResort({
    id,
    audiences: ADULT_ELEMENTARY,
    tickets: [dayTicket(prices)],
    ...extra,
  });

// ---- W ----
/** W01: Web 5,500円・窓口 6,000円 */
export const webResort = withWeb(baseDay("spec-web", { adult: 6000 }), [
  webOffer(5500, "adult"),
]);
/** W02: Web は利用日の前日まで */
export const webDeadlineResort = withWeb(
  baseDay("spec-web-deadline", { adult: 6000 }),
  [
    webOffer(5500, "adult", {
      purchase_deadline: { same_day_allowed: false, days_before_use: 1 },
    }),
  ],
);
/** W03: Web の販売開始が 12/1 */
export const webSalesStartResort = withWeb(
  baseDay("spec-web-sales-start", { adult: 6000 }),
  [webOffer(5500, "adult", { sales_period: { start: "2026-12-01" } })],
);
/** W04: 早割 4,500円は 11/30 まで販売 */
export const earlyBirdResort = withWeb(
  baseDay("spec-early-bird", { adult: 6000 }),
  [
    webOffer(4500, "adult", {
      discount_reasons: ["advance_purchase"],
      sales_period: { end: "2026-11-30" },
    }),
  ],
);
/** W05: Web が窓口より高い */
export const webExpensiveResort = withWeb(
  baseDay("spec-web-expensive", { adult: 6000 }),
  [webOffer(6200, "adult")],
);
/** W06: Web 料金が大人だけにある */
export const webAdultOnlyResort = withWeb(
  baseDay("spec-web-adult-only", { adult: 6000, elementary: 3000 }),
  [webOffer(5500, "adult")],
);
/**
 * W07〜W09: Web に手数料がかかる。Web は同じ1日券への販売経路 web の料金で、
 * 手数料は商品ではなく販売経路 web に付ける（監査C09・販売経路だけの指定）
 */
const webFeeResort = (id: string, webPrice: number, windowPrice: number) =>
  withWeb(baseDay(id, { adult: windowPrice }), [webOffer(webPrice, "adult")]);
const withFee = (
  base: ReturnType<typeof webFeeResort>,
  chargeUnit: "per_payment" | "per_ticket",
) => ({
  ...base,
  fees: [
    {
      id: "web-fee",
      name_ja: "Web決済手数料",
      amount: 100,
      channel_ids: ["web"],
      charge_unit: chargeUnit,
    },
  ],
});
/** W07・W08: Web 5,800円＋1決済ごとの手数料100円、窓口 5,900円 */
export const webFeeResortA = withFee(
  webFeeResort("spec-web-fee-a", 5800, 5900),
  "per_payment",
);
/** W09: Web 5,500円＋1枚ごとの手数料100円、窓口 5,900円 */
export const webFeeResortB = withFee(
  webFeeResort("spec-web-fee-b", 5500, 5900),
  "per_ticket",
);
/** W10: ICカード保証金 500円（新規発行のみ・返却で返金） */
export const icDepositResort = specResort({
  id: "spec-ic-deposit",
  tickets: [dayTicket({ adult: 6000 })],
  fees: [
    {
      id: "ic",
      name_ja: "ICカード保証金（返却で返金）",
      amount: 500,
      applies_to_product_ids: ["day"],
      notes_ja: "新規発行のみ。お持ちのカードを使えば不要",
    },
  ],
});
/** W11: 子ども用Web料金にだけ手数料（販売経路 web の手数料。大人は窓口） */
export const childWebFeeResort = {
  ...withWeb(baseDay("spec-child-web-fee", { adult: 6000 }), [
    webOffer(3000, "elementary"),
  ]),
  fees: [
    {
      id: "child-fee",
      name_ja: "子どもWeb手数料",
      amount: 100,
      channel_ids: ["web"],
      charge_unit: "per_person" as const,
    },
  ],
};
/** W12: レンタルの Web 予約 4,500円・店頭 5,000円（予約は前日まで） */
const rentalDeadline = { same_day_allowed: false, days_before_use: 1 };
export const webRentalResort = specResort({
  id: "spec-web-rental",
  tickets: [dayTicket({ adult: 6000 })],
  rentals: [
    {
      id: "ski-store",
      items: ["ski_set"],
      prices: { adult: 5000 },
      channel: "window",
    },
    {
      id: "ski-web",
      items: ["ski_set"],
      prices: { adult: 4500 },
      channel: "web",
      deadline: rentalDeadline,
    },
  ] satisfies SpecRental[],
});

// ---- PF ----
/** PF01: ヤング料金に写真付きの年齢確認書類が必要（22歳まで） */
export const youngProofResort = specResort({
  id: "spec-pf-young",
  audiences: [
    { id: "adult", name_ja: "大人", is_default: true },
    { id: "young", name_ja: "ヤング（22歳まで）", age_min: 13, age_max: 22 },
  ],
  tickets: [
    dayTicket(
      { adult: 6000, young: 4500 },
      {
        requirements: [
          {
            description_ja: "写真付きの年齢確認書類の提示",
            proof_ja: "写真付きの年齢確認書類",
          },
        ],
      },
    ),
  ],
});
/** PF02: シニア料金に年齢証明が必要（60歳以上） */
export const seniorProofResort = specResort({
  id: "spec-pf-senior",
  audiences: [
    { id: "adult", name_ja: "大人", is_default: true },
    { id: "senior", name_ja: "シニア（60歳以上）", age_min: 60 },
  ],
  tickets: [
    dayTicket(
      { adult: 6000, senior: 4800 },
      {
        requirements: [
          { description_ja: "年齢証明の提示", proof_ja: "年齢証明" },
        ],
      },
    ),
  ],
});
/** PF04: 早割に「QRコードの提示」が必要 */
export const qrEarlyBirdResort = withWeb(
  baseDay("spec-pf-qr", { adult: 6000 }),
  [
    webOffer(4500, "adult", {
      discount_reasons: ["advance_purchase"],
      sales_period: { end: "2026-12-31" },
      requirements: [
        { description_ja: "QRコードの提示", proof_ja: "QRコードの提示" },
      ],
    }),
  ],
);

// ---- SP ----
const FESTIVAL = "2027-02-11";
/** SP01: 単独券にはフェスティバル日の料金が無く、全山共通券だけがある */
export const festivalResort = specResort({
  id: "spec-sp-festival",
  tickets: [
    {
      id: "solo-day",
      name: "1日券（単独）",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      priceBy: [
        {
          days: { dayTypes: ["all"], exceptDates: [FESTIVAL] },
          prices: { adult: 6000 },
        },
      ],
    },
    {
      id: "all-mountain",
      name: "全山共通1日券",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      shared: true,
      prices: { adult: 7500 },
    },
  ],
});
export const FESTIVAL_DATE = FESTIVAL;

// ---- Z ----
/** Z01: めがひら型（1日券は作らない。時間券だけ） */
export const hoursOnlyResort = specResort({
  id: "spec-z-hours-only",
  hours: [{ type: "unknown" }],
  tickets: [
    {
      id: "h4",
      name: "4時間券",
      validity: { mode: "hours_from_first_use", hours: 4 },
      prices: { adult: 4900 },
    },
    {
      id: "h9",
      name: "9時間券",
      validity: { mode: "hours_from_first_use", hours: 9 },
      prices: { adult: 6300 },
    },
  ],
});
