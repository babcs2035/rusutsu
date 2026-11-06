/** 仕様書 CH（子ども・学生・シニアの区分）と PB-A（人物区分）の架空スキー場。test() は含めない */
import type { LiftTicketAudience } from "../../../types";
import {
  type SpecPrices,
  type SpecResortInput,
  type SpecTicket,
  specResort,
} from "../../testing/specResort";

const ADULT: LiftTicketAudience = {
  id: "adult",
  name_ja: "大人",
  is_default: true,
};
const day = (
  prices: SpecPrices,
  extra: Partial<SpecTicket> = {},
): SpecTicket => ({
  id: "day",
  name: "1日券",
  validity: { mode: "calendar_day", days: 1 },
  covers: ["regular"],
  prices,
  ...extra,
});
const make = (
  id: string,
  audiences: LiftTicketAudience[],
  prices: SpecPrices,
  extra: Partial<SpecResortInput> = {},
) =>
  specResort({
    id,
    audiences: [ADULT, ...audiences],
    tickets: [day(prices)],
    ...extra,
  });

const ES = ["elementary_school"];
const JH = ["junior_high_school"];

// CH01 小人＝12歳以下（年齢だけ記録）
export const childAge12Resort = make(
  "spec-ch-age12",
  [{ id: "child", name_ja: "小人（12歳以下）", age_max: 12 }],
  { adult: 6000, child: 3000 },
);
// CH02 小人＝小学生以下（学校で記録）
export const childSchoolResort = make(
  "spec-ch-school",
  [
    {
      id: "child",
      name_ja: "小人（小学生以下）",
      school_levels: ["elementary_school", "preschool"],
    },
  ],
  { adult: 6000, child: 3000 },
);
// CH03 小人＝6〜12歳
export const child6to12Resort = make(
  "spec-ch-6-12",
  [{ id: "child", name_ja: "小人（6〜12歳）", age_min: 6, age_max: 12 }],
  { adult: 6000, child: 3000 },
);
// CH04・CH05 小人＝12歳未満（11歳以下）
export const childUnder12Resort = make(
  "spec-ch-under12",
  [{ id: "child", name_ja: "小人（12歳未満）", age_max: 11 }],
  { adult: 6000, child: 3000 },
);
// CH06 小人＝15歳以下
export const childAge15Resort = make(
  "spec-ch-age15",
  [{ id: "child", name_ja: "小人（15歳以下）", age_max: 15 }],
  { adult: 6000, child: 3000 },
);
// CH07 小人＝小学生
export const childElementaryOnlyResort = make(
  "spec-ch-elementary-only",
  [{ id: "child", name_ja: "小人（小学生）", school_levels: ES }],
  { adult: 6000, child: 3000 },
);
// CH08 中人＝13〜18歳（ルスツ型）
export const teen13to18Resort = make(
  "spec-ch-teen",
  [
    { id: "child", name_ja: "小人", school_levels: ES },
    { id: "teen", name_ja: "中人（13〜18歳）", age_min: 13, age_max: 18 },
  ],
  { adult: 6000, child: 3000, teen: 4500 },
);
// CH09 小人＝小学生、中高生＝中学生・高校生
export const juniorHighSchoolResort = make(
  "spec-ch-junior-high",
  [
    { id: "child", name_ja: "小人", school_levels: ES },
    {
      id: "teen",
      name_ja: "中高生",
      school_levels: ["junior_high_school", "high_school"],
    },
  ],
  { adult: 6000, child: 3000, teen: 4500 },
);
// CH10・CH11・PB04 未就学児は無料、ただし4歳以上は有料
export const preschoolPaidFrom4Resort = make(
  "spec-ch-preschool",
  [
    {
      id: "preschool-free",
      name_ja: "未就学児（3歳以下）",
      school_levels: ["preschool"],
      age_min: 0,
      age_max: 3,
    },
    {
      id: "preschool-paid",
      name_ja: "未就学児（4歳以上）",
      school_levels: ["preschool"],
      age_min: 4,
      age_max: 6,
    },
  ],
  { adult: 6000, "preschool-free": 0, "preschool-paid": 2000 },
);
// CH12 小人＝7〜12歳（年齢だけ記録）、幼児＝6歳以下
export const infantAndChildByAgeResort = make(
  "spec-ch-infant-child",
  [
    { id: "child", name_ja: "小人（7〜12歳）", age_min: 7, age_max: 12 },
    { id: "infant", name_ja: "幼児（6歳以下）", age_max: 6 },
  ],
  { adult: 6000, child: 3000, infant: 1000 },
);
// CH14 シニア＝60歳以上
export const seniorResort = make(
  "spec-ch-senior",
  [{ id: "senior", name_ja: "シニア（60歳以上）", age_min: 60 }],
  { adult: 6000, senior: 4800 },
);
// CH15 学生料金（学生証が必要）
export const studentResort = specResort({
  id: "spec-ch-student",
  audiences: [
    ADULT,
    {
      id: "university",
      name_ja: "学生",
      school_levels: ["university", "graduate"],
    },
  ],
  tickets: [
    {
      id: "day",
      name: "1日券",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      prices: { adult: 6000, university: 5000 },
      requirements: [{ description_ja: "学生証の提示", proof_ja: "学生証" }],
    },
  ],
});
// CH16 学生料金が無い
export const noStudentResort = make("spec-ch-no-student", [], { adult: 6000 });
// CH17 ヤング＝22歳まで（年齢）、小人＝小学生（学校）。1日券にだけヤング料金がある
export const youngResort = specResort({
  id: "spec-ch-young",
  audiences: [
    ADULT,
    { id: "child", name_ja: "小人", school_levels: ES },
    { id: "young", name_ja: "ヤング（22歳まで）", age_min: 13, age_max: 22 },
  ],
  tickets: [
    day({ adult: 6000, child: 3000, young: 4500 }),
    {
      id: "h4",
      name: "4時間券",
      validity: { mode: "hours_from_first_use", hours: 4 },
      prices: { adult: 4000, child: 2000 },
    },
  ],
});
// CH18 障がい者料金（基準区分が小人）
const DISABLED: LiftTicketAudience[] = [
  { id: "child", name_ja: "小人", school_levels: ES },
  {
    id: "disabled-adult",
    name_ja: "障がい者（大人）",
    is_disability_qualified: true,
    base_audience_id: "adult",
  },
  {
    id: "disabled-child",
    name_ja: "障がい者（小人）",
    is_disability_qualified: true,
    base_audience_id: "child",
  },
];
export const disabledChildResort = make("spec-ch-disabled", DISABLED, {
  adult: 6000,
  child: 3000,
  "disabled-adult": 3000,
  "disabled-child": 1500,
});
/** 障がい者の小人料金が無いデータ */
export const disabledNoChildResort = make(
  "spec-ch-disabled-no-child",
  DISABLED,
  { adult: 6000, child: 3000, "disabled-adult": 3000 },
);
// CH19 レンタルの区分は「大人＝中学生以上」「子ども＝小学生以下」、券の小人＝中学生まで
export const rentalAudienceDiffResort = specResort({
  id: "spec-ch-rental-audience",
  audiences: [
    ADULT,
    {
      id: "child",
      name_ja: "小人（中学生まで）",
      school_levels: ["elementary_school", "junior_high_school", "preschool"],
    },
  ],
  rentalAudiences: [
    {
      id: "r-adult",
      name_ja: "大人（中学生以上）",
      is_default: true,
    },
    {
      id: "r-kids",
      name_ja: "子ども（小学生以下）",
      school_levels: ["elementary_school", "preschool"],
    },
  ],
  tickets: [day({ adult: 6000, child: 3000 })],
  rentals: [
    {
      id: "ski-set",
      items: ["ski_set"],
      prices: { "r-adult": 5000, "r-kids": 3500 },
    },
  ],
});
// CH20 レンタルの子どもが身長で決まる（130cm以下）
export const rentalHeightResort = specResort({
  id: "spec-ch-rental-height",
  audiences: [ADULT, { id: "child", name_ja: "小人", school_levels: ES }],
  rentalAudiences: [
    { id: "r-adult", name_ja: "大人", is_default: true },
    { id: "r-kids", name_ja: "子ども（身長130cm以下）" },
  ],
  tickets: [day({ adult: 6000, child: 3000 })],
  rentals: [
    {
      id: "ski-set",
      items: ["ski_set"],
      prices: { "r-adult": 5000 },
    },
    {
      id: "ski-set-kids",
      items: ["ski_set"],
      prices: { "r-kids": 3500 },
      qualification: "身長130cm以下",
      name: "子ども（身長130cm以下）",
    },
  ],
});

// ---- PB-A ----
// PB01 データの区分が elementary_school・junior_high_school（標準の区分で足りる）
export const schoolLevelResort = make(
  "spec-pb-school-level",
  [
    { id: "elementary", name_ja: "小学生", school_levels: ES },
    { id: "junior", name_ja: "中学生", school_levels: JH },
  ],
  { adult: 6000, elementary: 3500, junior: 4500 },
);
// PB03 若者料金（16〜22歳）。高校生19歳は区分と矛盾する
export const youthAgeResort = make(
  "spec-pb-youth",
  [
    { id: "high", name_ja: "高校生", school_levels: ["high_school"] },
    { id: "youth", name_ja: "若者（16〜22歳）", age_min: 16, age_max: 22 },
  ],
  { adult: 6000, high: 4500, youth: 4000 },
);
// PB06 20歳は平日無料（生年月日の確認書類が必要）
export const age20FreeResort = specResort({
  id: "spec-pb-age20",
  audiences: [
    ADULT,
    { id: "age20", name_ja: "20歳", age_min: 20, age_max: 20 },
  ],
  tickets: [
    day({ adult: 6000 }),
    {
      id: "day-age20",
      name: "20歳無料1日券",
      validity: { mode: "calendar_day", days: 1 },
      covers: ["regular"],
      priceBy: [{ days: "weekday", prices: { age20: 0 } }],
      requirements: [
        {
          description_ja: "生年月日の確認書類",
          proof_ja: "生年月日の確認書類",
        },
      ],
    },
  ],
});
// PB07 子どもの割引条件（購入方法）を満たす入力
// PB08 年齢により料金が変わらない施設（年齢の区分が無い）
export const noAgeAudienceResort = make(
  "spec-pb-no-age",
  [{ id: "elementary", name_ja: "小学生", school_levels: ES }],
  { adult: 6000, elementary: 3000 },
);
// PB11 蔵王温泉型: 大学生料金と未就学（年齢で分かれない）
export const zaoResort = make(
  "spec-pb-zao",
  [
    {
      id: "university",
      name_ja: "大学生",
      school_levels: ["university", "graduate"],
    },
    { id: "preschool", name_ja: "未就学", school_levels: ["preschool"] },
  ],
  { adult: 6000, university: 5000, preschool: 0 },
);
// PB10 レンタルは0〜6歳で同じ料金（年齢を求めない）
export const preschoolRentalResort = specResort({
  id: "spec-pb-preschool-rental",
  audiences: [
    ADULT,
    {
      id: "preschool-free",
      name_ja: "未就学（3歳以下）",
      school_levels: ["preschool"],
      age_max: 3,
    },
    {
      id: "preschool-paid",
      name_ja: "未就学（4歳以上）",
      school_levels: ["preschool"],
      age_min: 4,
      age_max: 6,
    },
  ],
  rentalAudiences: [
    { id: "r-adult", name_ja: "大人", is_default: true },
    { id: "r-preschool", name_ja: "0〜6歳", age_min: 0, age_max: 6 },
  ],
  tickets: [day({ adult: 6000, "preschool-free": 0, "preschool-paid": 2000 })],
  rentals: [
    {
      id: "ski-set",
      items: ["ski_set"],
      prices: { "r-adult": 5000, "r-preschool": 1000 },
    },
  ],
});
// PB12 障がい者＋大人
export const disabledAdultResort = disabledChildResort;
