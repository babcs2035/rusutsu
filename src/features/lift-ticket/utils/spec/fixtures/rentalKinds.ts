/** 仕様書 R（レンタルの種類）・RT（レンタルの時間帯）の架空スキー場。test() は含めない */
import {
  type SpecRental,
  type SpecResortInput,
  type SpecTicket,
  specResort,
} from "../../testing/specResort";

const RENTAL_AUDIENCES: SpecResortInput["rentalAudiences"] = [
  { id: "adult", name_ja: "大人", is_default: true },
  {
    id: "kids",
    name_ja: "子ども（小学生以下）",
    school_levels: ["elementary_school", "preschool"],
  },
];
const DAY_TICKET: SpecTicket = {
  id: "day",
  name: "1日券",
  validity: { mode: "calendar_day", days: 1 },
  covers: ["regular"],
  prices: { adult: 5000, elementary: 3000, junior: 4500 },
};

const a = (
  id: string,
  items: string[],
  adult: number,
  kids?: number,
  extra: Partial<SpecRental> = {},
): SpecRental => ({
  id,
  items,
  shop: "店舗A",
  prices: kids == null ? { adult } : { adult, kids },
  ...extra,
});

/** 店舗A（実データの集計から作った種類） */
const SHOP_A: SpecRental[] = [
  a("a-ski-set", ["ski_set"], 5000, 3500),
  a("a-board-set", ["snowboard_set"], 5500, 4000),
  a("a-ski-full", ["ski_set", "wear"], 8000, 6000),
  a("a-board-full", ["snowboard_set", "wear"], 8500, 6500),
  a("a-hands-free", ["ski_set", "wear", "goggles", "gloves"], 9000, 7000),
  a("a-skis", ["skis"], 3500),
  a("a-ski-boots", ["ski_boots"], 2000),
  a("a-poles", ["poles"], 500),
  a("a-snowboard", ["snowboard"], 4000),
  a("a-snowboard-boots", ["snowboard_boots"], 2000),
  a("a-wear", ["wear"], 4000),
  a("a-helmet", ["helmet"], 1000),
  a("a-goggles", ["goggles"], 1000),
  a("a-gloves", ["gloves"], 500),
  a("a-goggles-gloves", ["goggles", "gloves"], 1200),
  a("a-ski-set-high", ["ski_set"], 7000, undefined, { grade: "ハイグレード" }),
  // ショートスキー・上だけ・下だけ・帽子などは画面の用具に無い種類（データには残す）
  a("a-short-ski", ["short_ski_set"], 3500),
  a("a-wear-top", ["wear_top"], 2500),
  a("a-wear-bottom", ["wear_bottom"], 2000),
  a("a-hat", ["hat", "neck_warmer"], 500),
];
/** 店舗B（大人だけ） */
const SHOP_B: SpecRental[] = [
  { id: "b-skis", items: ["skis"], shop: "店舗B", prices: { adult: 2500 } },
  {
    id: "b-ski-boots",
    items: ["ski_boots"],
    shop: "店舗B",
    prices: { adult: 1500 },
  },
  { id: "b-poles", items: ["poles"], shop: "店舗B", prices: { adult: 500 } },
];
const build = (id: string, rentals: SpecRental[]) =>
  specResort({
    id,
    rentalAudiences: RENTAL_AUDIENCES,
    tickets: [DAY_TICKET],
    rentals,
  });

export const rentalKindsResort = build("spec-rental-kinds", [
  ...SHOP_A,
  ...SHOP_B,
]);
/** R02: 店舗Bを外したデータ */
export const rentalKindsNoShopBResort = build("spec-rental-no-b", SHOP_A);
/** R09: ウェアの上下セットが無いデータ（上・下のみ） */
export const rentalKindsNoWearSetResort = build(
  "spec-rental-no-wear-set",
  SHOP_A.filter(rental => !rental.items.includes("wear")).concat([
    a("a-ski-set-only", ["ski_set"], 5000, 3500),
  ]),
);
/** R16: ビンディングが別料金（1,000円）の施設 */
export const rentalBindingResort = build("spec-rental-binding", [
  a("a-snowboard", ["snowboard"], 4000),
  a("a-snowboard-boots", ["snowboard_boots"], 2000),
  a("a-binding", ["snowboard_bindings"], 1000),
]);
/** RT10: スキーのレンタルしか無い */
export const skiOnlyRentalResort = build("spec-rental-ski-only", [
  a("a-ski-set", ["ski_set"], 5000, 3500),
]);
/** RT07: 店舗A・Bとも単品がある。Bの合計（4,500円）がAのセット（5,000円）より安い */
export const shopMixResort = build("spec-rental-shop-mix", [
  a("a-ski-set", ["ski_set"], 5000),
  a("a-skis", ["skis"], 2000),
  a("a-ski-boots", ["ski_boots"], 3000),
  a("a-poles", ["poles"], 1000),
  ...SHOP_B,
]);
/** RT08: 宿泊者限定のレンタル料金がある */
export const qualifiedRentalResort = build("spec-rental-qualified", [
  a("a-ski-set", ["ski_set"], 5000),
  a("a-ski-set-guest", ["ski_set"], 3000, undefined, {
    qualification: "宿泊者限定",
    name: "宿泊者限定スキーセット",
  }),
]);
/** RT12: 料金の書かれていないレンタルだけ */
export const unpricedRentalResort = build("spec-rental-unpriced", [
  {
    id: "a-ski-set",
    items: ["ski_set"],
    shop: "店舗A",
    prices: { adult: null },
  },
]);

// ---- RT: 時間帯 ----
const hourTicket = (
  id: string,
  name: string,
  hours: number,
  price: number,
): SpecTicket => ({
  id,
  name,
  validity: { mode: "hours_from_first_use", hours },
  prices: { adult: price },
});
/** RT01: 半日（13:00〜）3,500円と1日 5,000円。リフト券は3時間券 */
export const halfDayRentalResort = specResort({
  id: "spec-rental-half-day",
  hours: [{ type: "regular", start: "08:30", end: "16:30" }],
  tickets: [
    hourTicket("h3", "3時間券", 3, 3000),
    {
      id: "pm",
      name: "午後券",
      validity: {
        mode: "fixed_time_window",
        start_time: "13:00",
        end_time: "16:30",
      },
      covers: ["regular"],
      prices: { adult: 3500 },
    },
    DAY_TICKET,
  ],
  rentals: [
    a("half", ["ski_set"], 3500, undefined, {
      duration: { mode: "half_day", start_time: "13:00", end_time: "16:30" },
    }),
    a("day", ["ski_set"], 5000),
  ],
});
/** RT02: 午後券（13:00〜）だけを売るデータ */
export const afternoonOnlyRentalResort = specResort({
  id: "spec-rental-pm-only",
  hours: [{ type: "regular", start: "08:30", end: "16:30" }],
  tickets: [
    {
      id: "pm",
      name: "午後券",
      validity: {
        mode: "fixed_time_window",
        start_time: "13:00",
        end_time: "16:30",
      },
      covers: ["regular"],
      prices: { adult: 3500 },
    },
  ],
  rentals: [
    a("half", ["ski_set"], 3500, undefined, {
      duration: { mode: "half_day", start_time: "13:00", end_time: "16:30" },
    }),
    a("day", ["ski_set"], 5000),
  ],
});
/** RT03: ナイター用レンタル（16:00〜）6,000円だけ */
export const nightRentalResort = specResort({
  id: "spec-rental-night",
  hours: [
    { type: "regular", start: "08:30", end: "16:00" },
    { type: "night", start: "16:00", end: "20:00" },
  ],
  tickets: [hourTicket("h3", "3時間券", 3, 3000), DAY_TICKET],
  rentals: [
    a("night", ["ski_set"], 6000, undefined, {
      duration: { mode: "night", start_time: "16:00", end_time: "20:00" },
    }),
  ],
});
/** RT04: 開始時刻の書かれていない半日レンタル */
export const halfDayNoStartResort = specResort({
  id: "spec-rental-half-no-start",
  hours: [{ type: "regular", start: "08:30", end: "16:30" }],
  tickets: [
    hourTicket("h4", "4時間券", 4, 3500),
    hourTicket("h6", "6時間券", 6, 4500),
    DAY_TICKET,
  ],
  rentals: [
    a("half", ["ski_set"], 3500, undefined, { duration: { mode: "half_day" } }),
    a("day", ["ski_set"], 5000),
  ],
});
/** RT05・RT06: 8時間レンタルだけ（1日料金なし） */
const eightHour = (id: string, end: string) =>
  specResort({
    id,
    hours: [{ type: "regular", start: "08:30", end }],
    tickets: [DAY_TICKET],
    rentals: [
      a("h8", ["ski_set"], 4000, undefined, {
        duration: { mode: "hours", hours: 8 },
      }),
    ],
  });
export const eightHourRentalResort = eightHour("spec-rental-8h", "16:30");
export const eightHourRentalLongDayResort = eightHour(
  "spec-rental-8h-long",
  "17:00",
);
/** RT11: ウェア 上だけ・下だけ・上下 */
export const wearPartsResort = build("spec-rental-wear-parts", [
  a("a-ski-set", ["ski_set"], 5000, 3500),
  a("a-wear-top", ["wear_top"], 2500),
  a("a-wear-bottom", ["wear_bottom"], 2000),
  a("a-wear", ["wear"], 4000),
]);
