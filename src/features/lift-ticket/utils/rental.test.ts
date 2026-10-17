import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  LiftTicketData,
  LiftTicketRental,
  LiftTicketSearchInput,
  TicketPartyGroup,
} from "../types";
import {
  calculateRentalPlan,
  defaultRentalRequestOf,
  formatRentalRequest,
  rentalOptionsOf,
} from "./rental";

const rental = (
  id: string,
  items: string[],
  amount: number,
  overrides: Partial<LiftTicketRental> = {},
): LiftTicketRental => ({
  id,
  name_ja: id,
  items,
  audience_ids: ["adult"],
  duration: { mode: "day" },
  price: { currency: "JPY", amount },
  source_refs: ["src-rental"],
  ...overrides,
});

/** 架空のスキー場。券の区分は大人・シニア、レンタルは大人・キッズ（小学生以下） */
const data = (rentals: LiftTicketRental[]): LiftTicketData => ({
  schema_version: "1.0.0",
  resort: { id: "test-resort" },
  season: {
    id: "2026-2027",
    label_ja: "2026-2027",
    start_date: "2026-12-01",
    end_date: "2027-03-31",
  },
  sources: [{ id: "src-rental", url: "https://example.com/rental/" }],
  audiences: [
    { id: "adult", name_ja: "大人", is_default: true },
    { id: "senior", name_ja: "シニア", age_min: 60 },
  ],
  rental_audiences: [
    {
      id: "rental-kids",
      name_ja: "キッズ",
      school_levels: ["preschool", "elementary_school"],
    },
  ],
  calendars: [
    {
      id: "cal-holiday",
      name_ja: "土日祝",
      included_day_types: ["saturday", "sunday", "national_holiday"],
    },
  ],
  products: [],
  channels: [{ id: "web", name_ja: "Web予約" }],
  offers: [],
  party_rules: [],
  fees: [],
  rentals,
  data_quality: { status: "complete" },
});

const RENTALS = [
  rental("ski-set", ["ski_set"], 5000),
  rental("skis", ["skis"], 3500),
  rental("ski-boots", ["ski_boots"], 2000),
  rental("poles", ["poles"], 800),
  rental("wear", ["wear"], 3000),
  rental("ski-set-wear", ["ski_set", "wear"], 7000),
  rental("ski-set-kids", ["ski_set"], 3500, { audience_ids: ["rental-kids"] }),
  rental("board-set", ["snowboard_set"], 5500),
  rental("ski-set-2days", ["ski_set"], 9000, {
    duration: { mode: "days", days: 2 },
  }),
];

const group = (
  rentalRequest: TicketPartyGroup["rental"],
  overrides: Partial<TicketPartyGroup> = {},
): TicketPartyGroup => ({
  id: "g1",
  category: "adult",
  age: null,
  count: 1,
  rental: rentalRequest,
  ...overrides,
});

const input = (
  party: TicketPartyGroup[],
  dates = ["2027-01-13"],
): LiftTicketSearchInput => ({
  visitDate: dates[0],
  usePreference: "full_day",
  days: dates.map((date, index) => ({
    id: `d${index}`,
    date,
    duration: { kind: "day", withNight: false },
  })),
  party,
  today: "2026-10-15",
});

test("借りない人だけなら none、レンタル未収集なら not_collected", () => {
  assert.equal(
    calculateRentalPlan(data(RENTALS), input([group(null)])).status,
    "none",
  );
  assert.equal(
    calculateRentalPlan(
      data([]),
      input([group({ sport: "ski", items: ["skis"] })]),
    ).status,
    "not_collected",
  );
});

test("板だけ・板＋ブーツ・3点・3点＋ウェアで最安の組み合わせを選ぶ", () => {
  const totalOf = (items: TicketPartyGroup["rental"]) =>
    calculateRentalPlan(data(RENTALS), input([group(items)])).total;
  assert.equal(totalOf({ sport: "ski", items: ["skis"] }), 3500);
  // 板3,500＋ブーツ2,000 = 5,500 より、3点セット 5,000 のほうが安い
  assert.equal(totalOf({ sport: "ski", items: ["skis", "ski_boots"] }), 5000);
  assert.equal(
    totalOf({ sport: "ski", items: ["skis", "ski_boots", "poles"] }),
    5000,
  );
  // 3点5,000＋ウェア3,000 = 8,000 より、セット＋ウェア 7,000
  assert.equal(
    totalOf({ sport: "ski", items: ["skis", "ski_boots", "poles", "wear"] }),
    7000,
  );
  assert.equal(totalOf({ sport: "ski", items: ["wear"] }), 3000);
});

test("料金表に無い用具（ゴーグル）を選ぶと未確定にする", () => {
  const result = calculateRentalPlan(
    data(RENTALS),
    input([group({ sport: "ski", items: ["skis", "goggles"] })]),
  );
  assert.equal(result.status, "partial");
  assert.equal(result.total, null);
});

test("レンタルだけの区分（キッズ＝小学生以下）を学校区分で引き、シニアは基準区分へ戻す", () => {
  const set = {
    sport: "ski" as const,
    items: ["skis" as const, "ski_boots" as const, "poles" as const],
  };
  const result = calculateRentalPlan(
    data(RENTALS),
    input([
      group(set, { id: "kid", category: "elementary" }),
      group(set, { id: "senior", category: "adult", age: 70, count: 2 }),
    ]),
  );
  assert.equal(result.lines[0].unitTotal, 3500);
  assert.equal(result.lines[1].subtotal, 10000);
  assert.equal(result.total, 13500);
});

test("連続2日は「2日間」の料金と1日×2を比べる。飛び石の日には使わない", () => {
  const set = {
    sport: "ski" as const,
    items: ["skis" as const, "ski_boots" as const, "poles" as const],
  };
  const consecutive = calculateRentalPlan(
    data(RENTALS),
    input([group(set)], ["2027-01-13", "2027-01-14"]),
  );
  assert.equal(consecutive.total, 9000);
  const apart = calculateRentalPlan(
    data(RENTALS),
    input([group(set)], ["2027-01-13", "2027-01-15"]),
  );
  assert.equal(apart.total, 10000);
});

test("「以降1日＋」は基準の料金に残りの日数ぶん足す", () => {
  const rentals = [
    rental("ski-set", ["ski_set"], 5600),
    rental("ski-set-extra", ["ski_set"], 5000, {
      duration: { mode: "extra_day", after_days: 1 },
    }),
  ];
  const result = calculateRentalPlan(
    data(rentals),
    input(
      [group({ sport: "ski", items: ["skis", "ski_boots", "poles"] })],
      ["2027-01-13", "2027-01-14", "2027-01-15"],
    ),
  );
  assert.equal(result.total, 5600 + 5000 * 2);
});

test("土日祝だけの料金・宿泊者限定・前日までのWeb予約を日付と条件で判定する", () => {
  const rentals = [
    rental("ski-set", ["ski_set"], 5000),
    rental("ski-set-holiday", ["ski_set"], 6000, {
      calendar_ids: ["cal-holiday"],
    }),
    rental("ski-set-hotel", ["ski_set"], 3000, {
      target_qualification: {
        official_label_ja: "ホテル宿泊者",
        description_ja: "ホテルに宿泊する人",
      },
    }),
    rental("ski-set-web", ["ski_set"], 4500, {
      channel_ids: ["web"],
      purchase_deadline: {
        same_day_allowed: false,
        days_before_use: 1,
        official_text_ja: "前日まで",
      },
    }),
  ];
  const set = {
    sport: "ski" as const,
    items: ["skis" as const, "ski_boots" as const, "poles" as const],
  };
  const future = calculateRentalPlan(data(rentals), input([group(set)]));
  assert.equal(future.total, 4500);
  assert.equal(future.lines[0].picks[0].purchaseNote, "Web予約・前日まで");
  // 当日の照会ならWeb予約は間に合わない
  const sameDay = calculateRentalPlan(data(rentals), {
    ...input([group(set)]),
    today: "2027-01-13",
  });
  assert.equal(sameDay.total, 5000);
});

test("入力欄の要約", () => {
  assert.equal(formatRentalRequest(null), "なし");
  assert.equal(
    formatRentalRequest({
      sport: "ski",
      items: ["skis", "ski_boots", "poles", "wear"],
    }),
    "スキー3点＋ウェア",
  );
  assert.equal(
    formatRentalRequest({ sport: "snowboard", items: ["snowboard"] }),
    "ボード板",
  );
  assert.equal(
    formatRentalRequest({ sport: "ski", items: ["wear", "helmet"] }),
    "ウェア＋ヘルメット",
  );
});

test("年齢未入力の未就学児は、0〜6歳で区分が変わらなければ年齢制の子供料金を使う", () => {
  const rentals = [
    rental("ski-set", ["ski_set"], 7000),
    rental("ski-set-12", ["ski_set"], 5000, {
      audience_ids: ["rental-under-12"],
    }),
  ];
  const withUnder12 = (under: LiftTicketData["rental_audiences"]) => ({
    ...data(rentals),
    rental_audiences: under,
  });
  const set = {
    sport: "ski" as const,
    items: ["skis" as const, "ski_boots" as const, "poles" as const],
  };
  const preschool = group(set, { category: "preschool" });
  assert.equal(
    calculateRentalPlan(
      withUnder12([
        { id: "rental-under-12", name_ja: "12歳以下", age_max: 12 },
      ]),
      input([preschool]),
    ).total,
    5000,
  );
  // 3歳から料金が分かれるなら年齢を求める
  const split = calculateRentalPlan(
    withUnder12([
      { id: "rental-under-12", name_ja: "3〜12歳", age_min: 3, age_max: 12 },
    ]),
    input([preschool]),
  );
  assert.equal(split.total, null);
  assert.match(split.lines[0].note ?? "", /年齢を入力/);
});

test("選べる物は、誰でも借りられる料金表にある用具だけ", () => {
  const options = rentalOptionsOf(
    data([
      rental("ski-set", ["ski_set"], 5000),
      rental("wear", ["wear"], 3000),
      // 宿泊者限定のボードは選択肢に出さない
      rental("board-hotel", ["snowboard_set"], 4000, {
        target_qualification: {
          official_label_ja: "宿泊者",
          description_ja: "ホテルに宿泊する人",
        },
      }),
    ]),
  );
  assert.deepEqual(options?.sports, ["ski"]);
  assert.deepEqual(options?.itemsBySport.ski, [
    "skis",
    "ski_boots",
    "poles",
    "wear",
  ]);
  assert.equal(rentalOptionsOf(data([])), null);
});

test("「あり」にしたときは借りられる板・ブーツ（ストック）から始め、種目を変えてもウェアは引き継ぐ", () => {
  const options = rentalOptionsOf(
    data([
      rental("ski-set", ["ski_set"], 5000),
      rental("board", ["snowboard"], 3000),
      rental("wear", ["wear"], 3000),
    ]),
  );
  assert.ok(options);
  assert.deepEqual(defaultRentalRequestOf(options), {
    sport: "ski",
    items: ["skis", "ski_boots", "poles"],
  });
  // ボードはブーツが無いので板だけ。ウェアは引き継ぐ
  assert.deepEqual(
    defaultRentalRequestOf(options, "snowboard", ["skis", "wear"]),
    { sport: "snowboard", items: ["snowboard", "wear"] },
  );
});
