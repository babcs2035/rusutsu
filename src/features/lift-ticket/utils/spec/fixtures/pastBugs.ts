/** 仕様書 PB（過去の不具合の再発防止）の架空スキー場。test() は含めない */
import type {
  LiftTicketAudience,
  LiftTicketData,
  LiftTicketOffer,
} from "../../../types";
import {
  type SpecHours,
  type SpecTicket,
  specResort,
} from "../../testing/specResort";

const day = (
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
const hourTicket = (
  id: string,
  name: string,
  hours: number,
  price: number,
  extra: Partial<SpecTicket> = {},
): SpecTicket => ({
  id,
  name,
  validity: { mode: "hours_from_first_use", hours },
  prices: { adult: price },
  ...extra,
});
const REGULAR: SpecHours = { type: "regular", start: "08:30", end: "16:30" };

// ---- PB-B ----
/** PB15: ゴゴイチ券（13:00〜17:00）が最安 */
export const gogoichiResort = specResort({
  id: "spec-pb-gogoichi",
  hours: [{ type: "regular", start: "08:30", end: "17:00" }],
  tickets: [
    hourTicket("h4", "4時間券", 4, 4000),
    {
      id: "gogo",
      name: "ゴゴイチ券",
      validity: {
        mode: "fixed_time_window",
        start_time: "13:00",
        end_time: "17:00",
      },
      covers: ["regular"],
      prices: { adult: 3000 },
    },
    day({ adult: 6000 }),
  ],
});
/** PB16: 営業時間が未掲載の1日券と25時間券 */
export const unknownHoursPoolResort = specResort({
  id: "spec-pb-unknown-pool",
  hours: [{ type: "unknown" }],
  tickets: [
    day({ adult: 6000 }),
    {
      id: "pool25",
      name: "25時間券",
      validity: { mode: "hours_pool", hours: 25 },
      prices: { adult: 15000 },
    },
  ],
});
/** PB17: 回数券（ポイント券）だけ */
export const pointsOnlyResort = specResort({
  id: "spec-pb-points-only",
  tickets: [
    {
      id: "points",
      name: "ポイント券",
      validity: { mode: "points", rides: 10 },
      prices: { adult: 3000 },
    },
  ],
});
/** PB18: 通常営業とナイターの時間が重なる */
export const overlapHoursResort = specResort({
  id: "spec-pb-overlap",
  hours: [
    { type: "regular", start: "08:30", end: "17:00" },
    { type: "night", start: "16:00", end: "21:00" },
  ],
  tickets: [
    hourTicket("h9", "9時間券", 9, 6300),
    day({ adult: 7000 }, { covers: ["regular", "night"] }),
  ],
});
/** PB18: 日中が未掲載でナイターだけ時刻がある */
export const nightOnlyKnownResort = specResort({
  id: "spec-pb-night-only-known",
  hours: [{ type: "unknown" }, { type: "night", start: "17:00", end: "21:00" }],
  tickets: [hourTicket("h9", "9時間券", 9, 6300)],
});
/** PB19: ナイター券にだけ「18歳ナイター無料」がある */
const AGE18: LiftTicketAudience[] = [
  { id: "adult", name_ja: "大人", is_default: true },
  { id: "age18", name_ja: "18歳", age_min: 18, age_max: 18 },
];
export const night18FreeResort = specResort({
  id: "spec-pb-night18",
  audiences: AGE18,
  hours: [REGULAR, { type: "night", start: "17:00", end: "21:00" }],
  tickets: [
    day({ adult: 6000 }),
    {
      id: "night",
      name: "ナイター券",
      validity: {
        mode: "fixed_time_window",
        start_time: "17:00",
        end_time: "21:00",
      },
      covers: ["night"],
      prices: { adult: 3000, age18: 0 },
    },
  ],
});
/** PB20: ナイター券が日中の券より安い */
export const cheapNightResort = specResort({
  id: "spec-pb-cheap-night",
  hours: [REGULAR, { type: "night", start: "17:00", end: "21:00" }],
  tickets: [
    hourTicket("h4", "4時間券", 4, 4000, { covers: ["regular"] }),
    {
      id: "night",
      name: "ナイター券",
      validity: {
        mode: "fixed_time_window",
        start_time: "17:00",
        end_time: "21:00",
      },
      covers: ["night"],
      prices: { adult: 2000 },
    },
  ],
});
/** PB21: 1日券・ナイター券・ナイター込み1日券 */
export const nightKindsResort = specResort({
  id: "spec-pb-night-kinds",
  hours: [REGULAR, { type: "night", start: "17:00", end: "21:00" }],
  tickets: [
    day({ adult: 6000 }),
    {
      id: "night",
      name: "ナイター券",
      validity: {
        mode: "fixed_time_window",
        start_time: "17:00",
        end_time: "21:00",
      },
      covers: ["night"],
      prices: { adult: 3000 },
    },
    {
      id: "day-night",
      name: "1日券（ナイター付）",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular", "night"],
      prices: { adult: 8000 },
    },
  ],
});
/** PB22: ナイターは金・土だけ営業 */
export const weekendNightResort = specResort({
  id: "spec-pb-weekend-night",
  hours: [
    REGULAR,
    {
      type: "night",
      start: "17:00",
      end: "21:00",
      days: { dayTypes: ["friday", "saturday"] },
    },
  ],
  tickets: [
    day({ adult: 6000 }),
    {
      id: "night",
      name: "ナイター券",
      validity: {
        mode: "fixed_time_window",
        start_time: "17:00",
        end_time: "21:00",
      },
      covers: ["night"],
      prices: { adult: 3000 },
    },
  ],
});
/** PB23・PB24: 1日券が無い施設（3・6・9時間券だけ。営業 8:30〜16:30） */
export const hoursTicketsOnlyResort = specResort({
  id: "spec-pb-hours-only",
  hours: [REGULAR],
  tickets: [
    hourTicket("h3", "3時間券", 3, 4000),
    hourTicket("h6", "6時間券", 6, 5200),
    hourTicket("h9", "9時間券", 9, 6300),
  ],
});

// ---- PB-C ----
/** PB26・PB27: 毎週火曜定休（12/30は営業）。シーズンは 2025/12/1〜2026/5/6 */
export const closedTuesdayResort = specResort({
  id: "spec-pb-closed-tuesday",
  season: { start: "2025-12-01", end: "2026-05-06" },
  hours: [
    REGULAR,
    {
      type: "closed",
      days: { dayTypes: ["tuesday"], exceptDates: ["2025-12-30"] },
    },
  ],
  tickets: [day({ adult: 6000 })],
});
/** PB28: 12/29〜1/3 は平日でも休日料金 */
const YEAR_END = [
  "2026-12-29",
  "2026-12-30",
  "2026-12-31",
  "2027-01-01",
  "2027-01-02",
  "2027-01-03",
];
export const yearEndResort = specResort({
  id: "spec-pb-year-end",
  tickets: [
    day(undefined, {
      priceBy: [
        {
          days: { dayTypes: ["weekday"], exceptDates: YEAR_END },
          prices: { adult: 6000 },
        },
        {
          days: {
            dayTypes: ["saturday", "sunday", "public_holiday"],
            dates: YEAR_END,
          },
          prices: { adult: 7000 },
        },
      ],
    }),
  ],
});
/** PB29: カレンダーに「全日」と期間を両方書いたデータ（3月だけの料金） */
export const allPlusRangeResort = specResort({
  id: "spec-pb-all-plus-range",
  tickets: [
    day(undefined, {
      priceBy: [
        { days: "all", prices: { adult: 6000 } },
        {
          days: {
            dayTypes: ["all"],
            ranges: [{ start: "2027-03-01", end: "2027-03-31" }],
          },
          prices: { adult: 4000 },
        },
      ],
    }),
  ],
});
const webOffer = (extra: Partial<LiftTicketOffer>): LiftTicketOffer => ({
  id: "day-web",
  name_ja: "1日券（Web）",
  product_id: "day",
  audience_ids: ["adult"],
  channel_ids: ["web"],
  discount_reasons: ["online_purchase"],
  price: { currency: "JPY", amount: 5500 },
  source_refs: ["src"],
  ...extra,
});
const withOffer = (id: string, offer: Partial<LiftTicketOffer>) => {
  const base = specResort({ id, tickets: [day({ adult: 6000 })] });
  return {
    ...base,
    offers: [
      ...base.offers,
      webOffer({ calendar_ids: [base.calendars[0].id], ...offer }),
    ],
  };
};
/** PB31: 利用日の3日前までに買う券 */
export const threeDaysBeforeResort = withOffer("spec-pb-3days", {
  purchase_deadline: { same_day_allowed: false, days_before_use: 3 },
});
/** PB34: 購入期限が日付の券 */
export const deadlineDateResort = withOffer("spec-pb-deadline-date", {
  purchase_deadline: { deadline_date: "2026-12-20" },
});
/** PB33: 野沢温泉型。前日までに購入するスペシャルパック（食事付き） */
export const specialPackResort = specResort({
  id: "spec-pb-special-pack",
  tickets: [
    day({ adult: 6000 }),
    {
      id: "special-pack",
      name: "スペシャルパック",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      channel: "web",
      reasons: ["advance_purchase"],
      deadline: { same_day_allowed: false, days_before_use: 1 },
      included: [{ type: "meal", name_ja: "ランチ券" }],
      prices: { adult: 5500 },
    },
  ],
});

// ---- PB-D ----
/** PB35: 選択日券（不連続可）・25時間券しか無い */
export const selectableOnlyResort = specResort({
  id: "spec-pb-selectable-only",
  tickets: [
    {
      id: "select2",
      name: "2日券（選択日）",
      validity: { mode: "selectable_days", days: 2 },
      prices: { adult: 11000 },
    },
    {
      id: "pool25",
      name: "25時間券",
      validity: { mode: "hours_pool", hours: 25 },
      prices: { adult: 39000 },
    },
  ],
});
/** PB37: 25時間券（連続日券なし）と、ナイター込みの1日券（滑る時間が決まらない日） */
export const poolWithNightResort = specResort({
  id: "spec-pb-pool-night",
  hours: [
    { type: "regular", start: "09:00", end: "16:00" },
    { type: "night", start: "16:00", end: "20:00" },
  ],
  tickets: [
    day({ adult: 16700 }, { covers: ["regular", "night"] }),
    hourTicket("h5", "5時間券", 5, 14500),
    {
      id: "pool25",
      name: "25時間券",
      validity: { mode: "hours_pool", hours: 25 },
      prices: { adult: 39000 },
    },
  ],
});
/** PB41・PB42: 恐羅漢型。通常の2日券と、会員・女性の 7,500円の2日券 */
const osorakan = specResort({
  id: "spec-pb-osorakan",
  tickets: [
    day({ adult: 6000 }),
    {
      id: "d2",
      name: "2日券",
      validity: { mode: "consecutive_days", days: 2 },
      prices: { adult: 10500 },
    },
  ],
});
export const osorakanTwoDayResort = {
  ...osorakan,
  offers: [
    ...osorakan.offers,
    webOffer({
      id: "d2-member",
      name_ja: "会員2日券",
      product_id: "d2",
      channel_ids: ["window"],
      calendar_ids: [osorakan.calendars[0].id],
      discount_reasons: [],
      target_qualification: {
        official_label_ja: "メンバーズカード会員",
        description_ja: "メンバーズカード会員",
      },
      price: { currency: "JPY", amount: 7500 },
    }),
  ],
};
/** PB43: 青森スプリング型。全日1日券5枚セット */
export const ticketSetResort = specResort({
  id: "spec-pb-ticket-set",
  tickets: [
    day({ adult: 9400 }),
    {
      id: "set5",
      name: "全日1日券5枚セット",
      validity: { mode: "selectable_days", days: 5 },
      covers: ["regular"],
      prices: { adult: 40000 },
    },
  ],
});
/** PB44: 日ごとに「1日」「1日＋ナイター」「N時間」を変える */
export const perDayDurationResort = specResort({
  id: "spec-pb-per-day",
  hours: [REGULAR, { type: "night", start: "17:00", end: "21:00" }],
  tickets: [
    day({ adult: 6000 }),
    {
      id: "day-night",
      name: "1日券（ナイター付）",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular", "night"],
      prices: { adult: 7500 },
    },
    hourTicket("h3", "3時間券", 3, 3500),
  ],
});

// ---- PB-E ----
/** PB46: 大人1名につき未就学児1名無料（野沢温泉・舞子・GALA型） */
export const preschoolPerAdultResort = specResort({
  id: "spec-pb-preschool-per-adult",
  tickets: [day({ adult: 6000, preschool: 2000 })],
  partyRules: [
    {
      id: "preschool-free",
      name_ja: "大人同伴の未就学児無料",
      components: [
        {
          role_ja: "大人",
          audience_ids: ["adult"],
          min_count: 1,
          price_effect: null,
        },
        {
          role_ja: "未就学児",
          audience_ids: ["preschool"],
          per_qualifying_count: 1,
          price_effect: { type: "free", amount: 0 },
        },
      ],
    },
  ],
});
/** PB47: 人数別セット（5人・2人）。1グループの排他指定は無い */
const headcountRule = (count: number, amount: number) => ({
  id: `kids-${count}`,
  name_ja: `小学生${count}人セット`,
  // 修正#26（グランスノー奥伊吹）: 人数別セットはそれぞれ1回だけ。繰り返して上限を超えない
  exclusive_group_id: `kids-${count}`,
  components: [
    {
      role_ja: "小学生",
      audience_ids: ["elementary"],
      product_ids: ["day"],
      min_count: count,
      max_count: count,
      price_effect: { type: "fixed_total", amount },
    },
  ],
});
export const headcountSetResort = specResort({
  id: "spec-pb-headcount",
  tickets: [day({ adult: 6000, elementary: 3000 })],
  partyRules: [headcountRule(5, 10000), headcountRule(2, 3500)],
});

// ---- PB-F ----
/** PB52: 単独の通常1日券が無く、リフト＋レンタルのパックがある（共通1日券あり） */
export const noSoloDayResort = specResort({
  id: "spec-pb-no-solo-day",
  tickets: [
    {
      id: "shared-day",
      name: "共通1日券",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      shared: true,
      prices: { adult: 6500 },
    },
    {
      id: "pack",
      name: "レンタル付きパック",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      included: [{ type: "rental", name_ja: "スキー3点" }],
      prices: { adult: 15400 },
    },
  ],
});
/** PB53: 一部の区分（小学生）が共通券にしか無い（ダイナランド型） */
export const childSharedOnlyResort = specResort({
  id: "spec-pb-child-shared-only",
  tickets: [
    day({ adult: 5900 }),
    {
      id: "shared-day",
      name: "1日券（共通）",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      shared: true,
      prices: { adult: 6400, elementary: 4200 },
    },
  ],
});
/** PB54: 奥志賀型。単独券が売られていない 5/4〜5/5 */
export const soloMissingDaysResort = specResort({
  id: "spec-pb-solo-missing",
  tickets: [
    {
      ...day(undefined),
      id: "solo-day",
      name: "1日券（単独）",
      priceBy: [
        {
          days: {
            dayTypes: ["all"],
            exceptDates: ["2027-05-04", "2027-05-05"],
          },
          prices: { adult: 7000 },
        },
      ],
    },
    {
      id: "shared-day",
      name: "1日券（共通）",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      shared: true,
      prices: { adult: 7500 },
    },
  ],
});
/** PB55: 単独券・2か所共通・多数共通がある（苗場・かぐら型） */
const threeKinds = specResort({
  id: "spec-pb-three-kinds",
  tickets: [
    day({ adult: 6000 }),
    {
      id: "shared-2",
      name: "2か所共通1日券",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      shared: true,
      prices: { adult: 7000 },
    },
    {
      id: "shared-many",
      name: "多数共通1日券",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      shared: true,
      prices: { adult: 8000 },
    },
  ],
});
export const threeKindsResort = {
  ...threeKinds,
  products: threeKinds.products.map(product =>
    product.id === "shared-many"
      ? {
          ...product,
          shared_with_resorts: [
            { resort_id: "r-a", name_ja: "スキー場A" },
            { resort_id: "r-b", name_ja: "スキー場B" },
            { resort_id: "r-c", name_ja: "スキー場C" },
          ],
        }
      : product,
  ),
};

// ---- PB-G ----
/** PB57: 木曜のレディースDAY（2,000円）とレンタル付きセット券 */
export const ladiesPackResort = specResort({
  id: "spec-pb-ladies-pack",
  tickets: [
    day({ adult: 5500 }),
    {
      id: "ladies",
      name: "レディースDAY1日券",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      genders: ["female"],
      reasons: ["special_day"],
      priceBy: [{ days: "thursday", prices: { adult: 2000 } }],
    },
    {
      id: "pack",
      name: "レンタル付きセット券",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      included: [{ type: "rental", name_ja: "スキー3点" }],
      prices: { adult: 8000 },
    },
  ],
  rentals: [{ id: "ski-set", items: ["ski_set"], prices: { adult: 4500 } }],
});
/** PB58: 料金表にゴーグルが無い（スキーセットだけ） */
export const noGogglesResort = specResort({
  id: "spec-pb-no-goggles",
  tickets: [day({ adult: 6000 })],
  rentals: [{ id: "ski-set", items: ["ski_set"], prices: { adult: 4500 } }],
});
/** PB59: 12/29からは休日料金のスキーセット */
export const holidayRentalResort = specResort({
  id: "spec-pb-holiday-rental",
  tickets: [day({ adult: 6000 })],
  rentals: [
    {
      id: "ski-regular",
      items: ["ski_set"],
      prices: { adult: 4500 },
      days: { dayTypes: ["weekday"], exceptDates: YEAR_END },
    },
    {
      id: "ski-holiday",
      items: ["ski_set"],
      prices: { adult: 5500 },
      days: {
        dayTypes: ["saturday", "sunday", "public_holiday"],
        dates: YEAR_END,
      },
    },
  ],
});
/** PB61: レンタル情報が無い施設 */
export const noRentalInfoResort = specResort({
  id: "spec-pb-no-rental",
  tickets: [day({ adult: 6000 })],
});

// ---- 2026-11-07 の計算修正 ----
const DAY_AND_NIGHT_HOURS: SpecHours[] = [
  { type: "regular", start: "08:30", end: "16:30" },
  { type: "night", start: "16:30", end: "20:00" },
];
/**
 * PB85: 「ゲート通過から連続8時間」の券がこのスキー場の1日券（夏油高原型）。
 * 安いエリア限定1日券を1日券の代わりにしない
 */
export const eightHourDayResort = specResort({
  id: "spec-pb-eight-hour-day",
  hours: [{ type: "regular", start: "08:30", end: "16:30" }],
  tickets: [
    {
      id: "area",
      name: "初心者エリア限定1日券",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      areaIds: ["beginner"],
      prices: { adult: 2000 },
    },
    hourTicket("eight", "1日券（ゲート通過から8時間）", 8, 5000),
  ],
});
const withUsableAtNight = (
  base: ReturnType<typeof specResort>,
  usable: Record<string, boolean | null>,
) => ({
  ...base,
  rentals: (base.rentals ?? []).map(rental => ({
    ...rental,
    usable_at_night: usable[rental.id] ?? null,
  })),
});
/**
 * PB86・PB87: 日中料金（16:30返却）・ナイター料金・夜まで使える1日料金がある
 * レンタル（ホワイトワールド尾瀬岩鞍型）
 */
const nightRentalBase = (dayAndNightPrice: number) =>
  withUsableAtNight(
    specResort({
      id: `spec-pb-rental-day-night-${dayAndNightPrice}`,
      hours: DAY_AND_NIGHT_HOURS,
      tickets: [day({ adult: 6000 }, { covers: ["regular", "night"] })],
      rentals: [
        {
          id: "ski-day",
          items: ["ski_set"],
          prices: { adult: 5000 },
          duration: { mode: "day", end_time: "16:30" },
        },
        {
          id: "ski-night",
          items: ["ski_set"],
          prices: { adult: 4000 },
          duration: { mode: "night", start_time: "16:00" },
        },
        {
          id: "ski-day-night",
          items: ["ski_set"],
          prices: { adult: dayAndNightPrice },
        },
      ],
    }),
    {
      "ski-day-adult": false,
      "ski-night-adult": true,
      "ski-day-night-adult": true,
    },
  );
/** PB86: 1日＋ナイター料金 8,000円が、日中5,000＋ナイター4,000より安い */
export const dayNightRentalResort = nightRentalBase(8000);
/** PB87: 1日＋ナイター料金 9,500円が、日中5,000＋ナイター4,000より高い */
export const dayNightRentalExpensiveResort = nightRentalBase(9500);
/**
 * PB88・PB89: 収集データの形の手数料（applies_to_channel_ids・unit）。
 * Web 5,800円＋1決済ごとの手数料100円、窓口 5,900円（飛騨流葉の送料型）
 */
const collectedWebFee = {
  id: "web-fee",
  name_ja: "Web決済手数料",
  amount: 100,
  applies_to_product_ids: [],
  applies_to_channel_ids: ["web"],
  unit: "per_transaction",
};
const webAndWindowBase = (id: string, webChannels: string[]) => {
  const base = specResort({
    id,
    tickets: [day({ adult: 5900 })],
  });
  const allDays = base.calendars[0]?.id;
  return {
    ...base,
    offers: [
      ...base.offers,
      {
        id: "web-adult",
        name_ja: "1日券（Web）",
        product_id: "day",
        audience_ids: ["adult"],
        calendar_ids: allDays ? [allDays] : [],
        channel_ids: webChannels,
        discount_reasons: ["online_purchase"],
        price: { currency: "JPY", amount: 5800 },
        source_refs: ["src"],
      },
    ],
    fees: [collectedWebFee],
  } as unknown as LiftTicketData;
};
/** PB88: Webだけで買える 5,800円に手数料100円が付く */
export const collectedWebFeeResort = webAndWindowBase("spec-pb-web-fee", [
  "web",
]);
/** PB89: 窓口でもWebでも買える 5,800円。手数料のかからない窓口で買えるので足さない */
export const collectedEitherChannelResort = webAndWindowBase(
  "spec-pb-either-channel",
  ["window", "web"],
);
