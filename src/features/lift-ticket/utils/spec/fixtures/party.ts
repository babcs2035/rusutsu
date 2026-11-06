/** 仕様書 P-1〜P-12（同行者ルール）の架空スキー場。test() は含めない */
import type {
  LiftTicketAudience,
  LiftTicketPartyRule,
  LiftTicketPartyRuleComponent,
} from "../../../types";
import {
  type SpecResortInput,
  type SpecTicket,
  specResort,
} from "../../testing/specResort";

type Rule = SpecResortInput["partyRules"] extends Array<infer R> | undefined
  ? R
  : never;

export const dayProduct = (
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

/** 「大人a＋子どもc で合計 amount」のセット。人数は min=max */
export const packRule = (
  id: string,
  name: string,
  adults: number,
  childAudiences: string[],
  children: number,
  amount: number,
  extra: Partial<Rule> = {},
): Rule => ({
  id,
  name_ja: name,
  components: [
    {
      role_ja: "大人",
      audience_ids: ["adult"],
      product_ids: ["day"],
      min_count: adults,
      max_count: adults,
      price_effect: { type: "fixed_total", amount },
    },
    {
      role_ja: "子ども",
      audience_ids: childAudiences,
      product_ids: ["day"],
      min_count: children,
      max_count: children,
      price_effect: null,
    },
  ],
  ...extra,
});

// ---- P-1 ブランシュたかやま型 ----
const P1_AMOUNTS: Record<string, number> = {
  "1-1": 8500,
  "1-2": 11500,
  "1-3": 14500,
  "1-4": 17500,
  "2-1": 14000,
  "2-2": 17000,
  "2-3": 20000,
  "2-4": 23000,
};
const p1Rules = (): Rule[] =>
  Object.entries(P1_AMOUNTS).map(([key, amount]) => {
    const [adults, children] = key.split("-").map(Number);
    return packRule(
      `family-${key}`,
      `パック（大人${adults}＋小学生${children}）`,
      adults,
      ["elementary"],
      children,
      amount,
    );
  });
export const familyPackResort = specResort({
  id: "spec-family-pack",
  tickets: [
    dayProduct({ adult: 6000, junior: 4500, elementary: 3500, preschool: 0 }),
  ],
  partyRules: p1Rules(),
});
/** P08: パックの並び順を逆にした同じデータ */
export const familyPackReversedResort = specResort({
  id: "spec-family-pack-reversed",
  tickets: [
    dayProduct({ adult: 6000, junior: 4500, elementary: 3500, preschool: 0 }),
  ],
  partyRules: p1Rules().reverse(),
});

// ---- P-2 シャトレーゼ小海型 ----
const CHILD_AUDIENCES: LiftTicketAudience[] = [
  { id: "adult", name_ja: "大人", is_default: true },
  {
    id: "child",
    name_ja: "子ども（小中学生）",
    school_levels: ["elementary_school", "junior_high_school"],
  },
];
export const kominoResort = specResort({
  id: "spec-komi",
  audiences: CHILD_AUDIENCES,
  tickets: [dayProduct({ adult: 5000, child: 3000 })],
  partyRules: [
    packRule("set-window", "ファミリーセット（窓口）", 2, ["child"], 2, 15800, {
      channel: "window",
    }),
    packRule("set-web", "ファミリーセット（Web）", 2, ["child"], 2, 15400, {
      channel: "web",
      // 仕様: Webは前日まで。型に無いが実データと同じく購入期限を持たせる
      ...({
        discount_reasons: ["online_purchase"],
        purchase_deadline: { same_day_allowed: false, days_before_use: 1 },
      } as object),
    }),
  ],
});

// ---- P-3 保護者同伴の子ども無料 ----
const accompaniedFree = (
  id: string,
  name: string,
  audience: string,
  days?: Rule["days"],
): Rule => ({
  id,
  name_ja: name,
  days,
  components: [
    {
      role_ja: "大人（リフト券購入者）",
      audience_ids: ["adult"],
      product_ids: ["day"],
      min_count: 1,
      max_count: 1,
      price_effect: null,
    },
    {
      role_ja: name,
      audience_ids: [audience],
      price_effect: { type: "free", amount: 0 },
    },
  ],
});
export const accompaniedFreeResort = specResort({
  id: "spec-accompanied-free",
  tickets: [dayProduct({ adult: 6000, elementary: 3500, preschool: null })],
  partyRules: [
    accompaniedFree("preschool-free", "大人同伴の未就学児無料", "preschool"),
    accompaniedFree("kids-day", "スキーこどもの日", "elementary", {
      dates: ["2027-01-24"],
    }),
  ],
});

// ---- P-4 石打丸山型 ----
const INFANT_AUDIENCES: LiftTicketAudience[] = [
  { id: "adult", name_ja: "大人", is_default: true },
  { id: "infant", name_ja: "3歳以下", age_min: 0, age_max: 3 },
];
export const infantFreeResort = specResort({
  id: "spec-infant-free",
  audiences: INFANT_AUDIENCES,
  tickets: [dayProduct({ adult: 6000, infant: 1000 })],
  partyRules: [
    {
      id: "infant-free",
      name_ja: "3歳以下は大人1名につき1名無料",
      components: [
        {
          role_ja: "大人",
          audience_ids: ["adult"],
          min_count: 1,
          price_effect: null,
        },
        {
          role_ja: "3歳以下",
          audience_ids: ["infant"],
          per_qualifying_count: 1,
          price_effect: { type: "free", amount: 0 },
        },
      ],
    },
  ],
});

// ---- P-5 親子券（1人ずつ値段が決まる） ----
const perPerson = (
  role: string,
  audiences: string[],
  amount: number,
  min = 1,
  max: number | null = 1,
): LiftTicketPartyRuleComponent => ({
  role_ja: role,
  audience_ids: audiences,
  product_ids: ["day"],
  min_count: min,
  max_count: max,
  price_effect: { type: "fixed_per_person", amount },
});
const P5_DAY = {
  adult: 6500,
  junior: 4500,
  elementary: 3500,
  high: 6500,
} as const;
/** ファミリー券（Web・前日まで・1組だけ） */
export const familyTicketResort = specResort({
  id: "spec-family-ticket",
  tickets: [dayProduct({ ...P5_DAY })],
  partyRules: [
    {
      id: "family-ticket",
      name_ja: "ファミリー券",
      exclusive_group_id: "family-ticket",
      channel: "web",
      components: [
        perPerson("大人", ["adult"], 5600),
        perPerson("小・中学生", ["elementary", "junior"], 3000),
      ],
      ...({
        discount_reasons: ["online_purchase"],
        purchase_deadline: { same_day_allowed: false, days_before_use: 1 },
      } as object),
    } as Rule,
  ],
  // Web販売経路を持たせるための店頭の通常料金は dayProduct が窓口で持つ
});
/** 子育て応援パック（大人1〜2名と18歳以下1名以上で全員1名3,500円） */
export const childcareResort = specResort({
  id: "spec-childcare",
  tickets: [dayProduct({ ...P5_DAY })],
  partyRules: [
    {
      id: "childcare",
      name_ja: "子育て応援パック",
      components: [
        perPerson("大人", ["adult"], 3500, 1, 2),
        perPerson("18歳以下", ["elementary", "junior", "high"], 3500, 1, null),
      ],
    },
  ],
});

// ---- P-6 条件付き親子券 ----
export const conditionalFamilyResort = specResort({
  id: "spec-conditional-family",
  tickets: [dayProduct({ adult: 5000, elementary: 3000 })],
  partyRules: [
    packRule("pair", "親子セット券", 1, ["elementary"], 1, 7500),
    {
      ...packRule(
        "pair-nagano",
        "長野県民の親子セット券",
        1,
        ["elementary"],
        1,
        5700,
      ),
      target_qualification: {
        official_label_ja: "長野県民（住所入りの身分証が必要）",
      },
    },
  ],
});
/** 菅平型: 通常の1日券と、エリア1日券（エントリーパスの対象） */
export const entryPassResort = specResort({
  id: "spec-entry-pass",
  tickets: [
    dayProduct({ adult: 5000, elementary: 3000 }),
    {
      id: "area-day",
      name: "エリア1日券",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      areaIds: ["area-1"],
      prices: { adult: 5000, elementary: 3000 },
    },
  ],
  partyRules: [
    {
      id: "entry-pass",
      name_ja: "エントリーパス",
      target_qualification: { official_label_ja: "同居のご家族" },
      components: [
        {
          role_ja: "大人",
          audience_ids: ["adult"],
          product_ids: ["area-day"],
          min_count: 1,
          price_effect: null,
        },
        {
          role_ja: "小学生",
          audience_ids: ["elementary"],
          product_ids: ["area-day"],
          per_qualifying_count: 1,
          price_effect: { type: "free", amount: 0 },
        },
      ],
    },
  ],
});

// ---- P-7 期間・曜日で変わる親子券 ----
export const sapporoResort = specResort({
  id: "spec-sapporo",
  tickets: [dayProduct({ adult: 6000, elementary: 3000 })],
  // 仕様: ICカード保証金500円（返却で返金）は別。1枚ぶんの費用として持たせる
  fees: [
    {
      id: "ic-deposit",
      name_ja: "ICカード保証金（返却で返金）",
      amount: 500,
      applies_to_product_ids: ["day"],
      // カード1枚（1決済）ぶん。人数では数えない
      charge_unit: "per_payment" as const,
    },
  ],
  partyRules: [
    packRule(
      "pair-normal",
      "親子パック（通常期間）",
      1,
      ["elementary"],
      1,
      8000,
      {
        channel: "web",
        days: { ranges: [{ start: "2026-12-01", end: "2027-03-14" }] },
      },
    ),
    packRule(
      "pair-spring",
      "親子パック（スプリング期間）",
      1,
      ["elementary"],
      1,
      7500,
      {
        channel: "web",
        days: { ranges: [{ start: "2027-03-15", end: "2027-05-06" }] },
      },
    ),
  ],
});
export const whitepiaResort = specResort({
  id: "spec-whitepia",
  tickets: [dayProduct({ adult: 6000, elementary: 3000 })],
  partyRules: [
    packRule(
      "family-weekday",
      "ファミリーパック（平日・食事券1,000円分付き）",
      1,
      ["elementary"],
      1,
      6800,
      {
        days: "weekday",
        description_ja: "食事券1,000円分付き",
      },
    ),
    packRule(
      "family-holiday",
      "ファミリーパック（休日・食事券1,000円分付き）",
      1,
      ["elementary"],
      1,
      7800,
      {
        days: "holiday",
        description_ja: "食事券1,000円分付き",
      },
    ),
  ],
});

// ---- P-8 ダイナランド型 ----
const DYNA_AUDIENCES: LiftTicketAudience[] = [
  { id: "adult", name_ja: "大人", is_default: true },
  {
    id: "child",
    name_ja: "子ども",
    school_levels: ["elementary_school", "preschool"],
  },
];
export const dynalandResort = specResort({
  id: "spec-dynaland",
  audiences: DYNA_AUDIENCES,
  tickets: [
    {
      id: "day",
      name: "1日券（単独）",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      prices: { adult: 5900, child: 3500 },
    },
    {
      id: "day-shared",
      name: "1日券（共通）",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      shared: true,
      prices: { adult: 6400, child: 4200 },
    },
  ],
  partyRules: [
    {
      ...packRule("family-solo", "ファミリー券（単独）", 1, ["child"], 1, 6800),
    },
    {
      id: "family-shared",
      name_ja: "ファミリー券（共通）",
      components: [
        {
          role_ja: "大人",
          audience_ids: ["adult"],
          product_ids: ["day-shared"],
          min_count: 1,
          max_count: 1,
          price_effect: { type: "fixed_total", amount: 7100 },
        },
        {
          role_ja: "子ども",
          audience_ids: ["child"],
          product_ids: ["day-shared"],
          min_count: 1,
          max_count: 1,
          price_effect: null,
        },
      ],
    },
  ],
});

// ---- P-9 奥志賀高原型 ----
const OKU_AUDIENCES: LiftTicketAudience[] = [
  { id: "adult", name_ja: "大人", is_default: true },
  {
    id: "child",
    name_ja: "こども（小学生以下）",
    school_levels: ["elementary_school", "preschool"],
  },
  {
    id: "teen",
    name_ja: "中高生",
    school_levels: ["junior_high_school", "high_school"],
  },
];
const consecutive = (
  days: number,
  prices: Record<string, number>,
): SpecTicket => ({
  id: `d${days}`,
  name: `${days}日券`,
  validity: { mode: "consecutive_days", days },
  covers: ["regular"],
  prices,
});
const okuPack = (
  days: number,
  kind: "child" | "teen",
  amount: number,
): Rule => ({
  id: `pack-${kind}-${days}`,
  name_ja: `おとな・${kind === "child" ? "こども" : "中高生"}パック ${days}日`,
  components: [
    {
      role_ja: "おとな",
      audience_ids: ["adult"],
      product_ids: [`d${days}`],
      min_count: 1,
      max_count: 1,
      price_effect: { type: "fixed_total", amount },
    },
    {
      role_ja: kind === "child" ? "こども" : "中高生",
      audience_ids: [kind],
      product_ids: [`d${days}`],
      min_count: 1,
      max_count: 1,
      price_effect: null,
    },
  ],
});
export const okushigaResort = specResort({
  id: "spec-okushiga",
  audiences: OKU_AUDIENCES,
  tickets: [
    {
      id: "day",
      name: "1日券",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      prices: { adult: 7000, child: 4000 },
    },
    // 1日券は連続日券の1日と同じ。2日券・3日券は連続日券
    consecutive(2, { adult: 13000, child: 7500, teen: 11000 }),
    consecutive(3, { adult: 19000, child: 11000 }),
  ],
  partyRules: [
    okuPack(2, "child", 18000),
    okuPack(3, "child", 26000),
    okuPack(2, "teen", 22000),
  ],
});

// ---- P-10 恐羅漢型（レンタル込みファミリーパック） ----
const RENTAL_AUDIENCES: LiftTicketAudience[] = [
  { id: "adult", name_ja: "大人", is_default: true },
  {
    id: "kids",
    name_ja: "子ども",
    school_levels: ["elementary_school", "preschool"],
  },
];
const packProduct = (id: string, name: string): SpecTicket => ({
  id,
  name,
  validity: { mode: "calendar_day", days: 1 },
  covers: ["regular"],
  included: [{ type: "rental", name_ja: "スキーセット＋ウェア" }],
  // 別々に買う合計と同じ（大人 5,500+6,000、小学生 3,000+4,000）。パックの割引は同行者ルールで表す
  prices: { adult: 11500, elementary: 7000 },
});
/** 1日20枚限定のファミリーパック（大人1＋子ども1、または子ども2） */
export const osorakanFamilyPackResort = specResort({
  id: "spec-osorakan-pack",
  rentalAudiences: RENTAL_AUDIENCES,
  tickets: [
    dayProduct({ adult: 5500, elementary: 3000 }),
    packProduct("family-pack", "ファミリーパック（1日20枚限定）"),
  ],
  rentals: [
    {
      id: "ski-wear",
      items: ["ski_set", "wear"],
      prices: { adult: 6000, kids: 4000 },
    },
  ],
  partyRules: [
    {
      id: "family-adult-child",
      name_ja: "ファミリーパック",
      description_ja: "1日20枚限定",
      components: [
        {
          role_ja: "大人",
          audience_ids: ["adult"],
          product_ids: ["family-pack"],
          min_count: 1,
          max_count: 1,
          price_effect: { type: "fixed_total", amount: 10000 },
        },
        {
          role_ja: "子ども",
          audience_ids: ["elementary"],
          product_ids: ["family-pack"],
          min_count: 1,
          max_count: 1,
          price_effect: null,
        },
      ],
    },
    {
      id: "family-two-children",
      name_ja: "ファミリーパック",
      description_ja: "1日20枚限定",
      components: [
        {
          role_ja: "子ども",
          audience_ids: ["elementary"],
          product_ids: ["family-pack"],
          min_count: 2,
          max_count: 2,
          price_effect: { type: "fixed_total", amount: 10000 },
        },
      ],
    },
  ],
});

// ---- P-11 川場型（まとめ買い） ----
const bulkRule = (count: number, amount: number): Rule => ({
  id: `bulk-${count}`,
  name_ja: `早割まとめ買い（${count}枚）`,
  exclusive_group_id: "bulk",
  channel: "web",
  sales_period: { start: "2026-10-01", end: "2026-11-30" },
  components: [
    {
      role_ja: `大人${count}名`,
      audience_ids: ["adult"],
      product_ids: ["day"],
      min_count: count,
      max_count: count,
      price_effect: { type: "fixed_total", amount },
    },
  ],
  ...({
    discount_reasons: ["advance_purchase"],
  } as object),
});
export const bulkBuyResort = specResort({
  id: "spec-bulk",
  tickets: [
    dayProduct({ adult: 6500 }),
    {
      id: "d3",
      name: "3日券",
      validity: { mode: "consecutive_days", days: 3 },
      covers: ["regular"],
      prices: { adult: 19500 },
    },
  ],
  partyRules: [
    bulkRule(5, 28000),
    bulkRule(4, 22600),
    bulkRule(3, 17100),
    bulkRule(2, 11500),
  ],
});

// ---- P-12 上越国際型 ----
const JOETSU_AUDIENCES: LiftTicketAudience[] = [
  { id: "adult", name_ja: "大人", is_default: true },
  {
    id: "junior",
    name_ja: "ジュニア（3歳〜小学生）",
    age_min: 3,
    age_max: 12,
  },
];
const earlyBird = (extra: Partial<Rule>): Partial<Rule> => ({
  channel: "web",
  sales_period: { start: "2026-10-01", end: "2026-11-30" },
  ...extra,
  ...({ discount_reasons: ["advance_purchase"] } as object),
});
export const joetsuResort = specResort({
  id: "spec-joetsu",
  audiences: JOETSU_AUDIENCES,
  rentalAudiences: JOETSU_AUDIENCES,
  tickets: [
    dayProduct({ adult: 6000, junior: 3000 }),
    {
      id: "rental-pack",
      name: "リフト券＋レンタル",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      included: [{ type: "rental", name_ja: "スキーセット" }],
      // 別々に買う合計（大人 6,000+5,000、ジュニア 3,000+3,500）
      prices: { adult: 11000, junior: 6500 },
    },
  ],
  rentals: [
    {
      id: "ski-set",
      items: ["ski_set"],
      prices: { adult: 5000, junior: 3500 },
    },
  ],
  partyRules: [
    packRule("happy", "ハッピーセット", 1, ["junior"], 1, 6600, earlyBird({})),
    {
      ...packRule(
        "happy-rental",
        "ハッピーレンタルセット",
        1,
        ["junior"],
        1,
        9600,
        earlyBird({}),
      ),
      components: [
        {
          role_ja: "大人",
          audience_ids: ["adult"],
          product_ids: ["rental-pack"],
          min_count: 1,
          max_count: 1,
          price_effect: { type: "fixed_total", amount: 9600 },
        },
        {
          role_ja: "ジュニア",
          audience_ids: ["junior"],
          product_ids: ["rental-pack"],
          min_count: 1,
          max_count: 1,
          price_effect: null,
        },
      ],
    },
  ],
});

export type { LiftTicketPartyRule };
