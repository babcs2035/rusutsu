/** 長さ系の仕様テスト用の共通部品（券の作成と結果の整形）。test() は含めない */
import assert from "node:assert/strict";
import type {
  LiftTicketData,
  TicketDayDuration,
  TicketPartyGroup,
} from "../../types";
import { calculateLiftTicketPlan } from "../calculateLiftTicket";
import type {
  TicketDurationOption,
  TicketDurationOptions,
} from "../durationOptions";
import {
  dayInput,
  type SpecPrices,
  type SpecTicket,
} from "../testing/specResort";

const adultPrice = (price: number): SpecPrices => ({ adult: price });

/** 1日券（営業区分は covers、既定は通常営業のみ） */
export const dayTicket = (
  id: string,
  name: string,
  price: number,
  covers: string[] = ["regular"],
  extra: Partial<SpecTicket> = {},
): SpecTicket => ({
  id,
  name,
  validity: { mode: "calendar_day", days: 1 },
  covers,
  prices: adultPrice(price),
  ...extra,
});

/** 時間券（ゲートを通ってから N 時間）。covers を省くとナイターにも使える */
export const hourTicket = (
  id: string,
  name: string,
  hoursValue: number,
  price: number,
  extra: Partial<SpecTicket> = {},
): SpecTicket => ({
  id,
  name,
  validity: { mode: "hours_from_first_use", hours: hoursValue },
  prices: adultPrice(price),
  ...extra,
});

/** 時間帯が決まった券 */
export const windowTicket = (
  id: string,
  name: string,
  start: string | null,
  end: string | null,
  price: number,
  covers: string[] = ["regular"],
  extra: Partial<SpecTicket> = {},
): SpecTicket => ({
  id,
  name,
  validity: { mode: "fixed_time_window", start_time: start, end_time: end },
  covers,
  prices: adultPrice(price),
  ...extra,
});

export const optionsOf = (
  data: LiftTicketData,
  date: string,
  duration: TicketDayDuration,
  members?: TicketPartyGroup[],
) => {
  const plan = calculateLiftTicketPlan(data, dayInput(date, duration, members));
  return { day: plan.days[0], total: plan.total };
};

import { formatHours } from "../durationOptions";
import { calculateRentalPlan } from "../rental";

/** 実際の券の表記の候補。仕様書は「（時間帯）」や「（N時間）」を付けて書く */
const variantsOf = (option: TicketDurationOption) => {
  const base = `${option.productName} ${option.total}`;
  return [
    base,
    option.windowLabel ? `${base}(${option.windowLabel})` : base,
    `${base}(${formatHours(option.hours)})`,
  ];
};

/** 仕様書の書き方（expected）に合う表記なら expected を、合わなければ実際の完全な表記を返す */
export const fmt = (
  option: TicketDurationOption | null,
  expected?: string | null,
) => {
  if (option == null) return null;
  const variants = variantsOf(option);
  if (expected && variants.includes(expected)) return expected;
  return option.windowLabel
    ? `${option.productName} ${option.total}(${option.windowLabel})`
    : `${option.productName} ${option.total}`;
};

const fmtList = (list: TicketDurationOption[], expected: string[]) =>
  list
    .map(option =>
      fmt(
        option,
        expected.find(e => variantsOf(option).includes(e)),
      ),
    )
    .sort();

export type Expected = {
  /** 一番上。null は料金なし */
  primary: string | null;
  timeRestricted?: string[];
  shorter?: string[];
  longestSingle?: string | null;
  /** options.notes に含まれるべき文字列 */
  notes?: string[];
  /** options.notes に含まれてはいけない文字列 */
  noNotes?: string[];
};

/** 仕様書の1行分を確かめる */
export const check = (
  data: LiftTicketData,
  date: string,
  duration: TicketDayDuration,
  expected: Expected,
  members?: TicketPartyGroup[],
) => {
  const { day, total } = optionsOf(data, date, duration, members);
  const options = day.options as TicketDurationOptions;
  assert.equal(
    fmt(options.primary, expected.primary),
    expected.primary,
    "一番上",
  );
  if (expected.primary == null) {
    assert.equal(total, null, "料金なしなら total は null");
  }
  assert.deepEqual(
    fmtList(options.timeRestricted, expected.timeRestricted ?? []),
    [...(expected.timeRestricted ?? [])].sort(),
    "時間帯が決まっていてもよければ",
  );
  assert.deepEqual(
    fmtList(options.shorter, expected.shorter ?? []),
    [...(expected.shorter ?? [])].sort(),
    "1時間短くてもよければ",
  );
  // 仕様書が1枚で滑れる最長に触れていない行（B03など）は確かめない
  if ("longestSingle" in expected)
    assert.equal(
      fmt(options.longestSingle, expected.longestSingle),
      expected.longestSingle ?? null,
      "1枚で滑れる最長",
    );
  const notes = [...options.notes, ...day.result.notes];
  for (const note of expected.notes ?? [])
    assert.ok(
      notes.some(text => text.includes(note)),
      `注記「${note}」が無い: ${JSON.stringify(notes)}`,
    );
  for (const note of expected.noNotes ?? [])
    assert.ok(
      !notes.some(text => text.includes(note)),
      `注記「${note}」は出さない: ${JSON.stringify(notes)}`,
    );
};

/** レンタルの合計 */
export const rentalTotalOf = (
  data: LiftTicketData,
  date: string,
  duration: TicketDayDuration,
  members: TicketPartyGroup[],
) => calculateRentalPlan(data, dayInput(date, duration, members)).total;

/** 計算結果全体の文字列（表示される文言を探すとき用） */
export const planText = (
  data: LiftTicketData,
  date: string,
  duration: TicketDayDuration,
  members?: TicketPartyGroup[],
) =>
  JSON.stringify(
    calculateLiftTicketPlan(data, dayInput(date, duration, members)),
  );

export const SKI_SET = {
  sport: "ski",
  items: ["skis", "ski_boots", "poles"],
} as const;

/** 曜日を確かめた2027年の日付（月曜=1/18、土曜=1/23、1/11は成人の日） */
export const D = {
  mon: "2027-01-18",
  tue: "2027-01-19",
  wed: "2027-01-20",
  sat: "2027-01-23",
  sun: "2027-01-24",
  holidayMon: "2027-01-11",
  /** 土曜（仕様書の1/31はこの年は日曜なので、同じ週の土曜を使う） */
  satNight: "2027-01-30",
  dec30: "2026-12-30",
  opening: "2026-12-10",
};
