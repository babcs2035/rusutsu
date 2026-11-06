/** 仕様書 T（25時間券）・L（複数日）の架空スキー場。test() は含めない */
import { type SpecTicket, specResort } from "../../testing/specResort";

const cal = (days: number): SpecTicket["validity"] => ({
  mode: "consecutive_days",
  days,
});

// ---- T: ルスツの25時間券型 ----
const T_TICKETS: SpecTicket[] = [
  {
    id: "day",
    name: "1日券",
    validity: { mode: "calendar_day", days: 1 },
    covers: ["regular"],
    prices: { adult: 16700 },
  },
  {
    id: "h5",
    name: "5時間券",
    validity: { mode: "hours_from_first_use", hours: 5 },
    prices: { adult: 14500 },
  },
  ...[
    [2, 26000],
    [3, 39000],
    [4, 52000],
    [5, 65000],
  ].map(
    ([days, amount]): SpecTicket => ({
      id: `d${days}`,
      name: `${days}日券`,
      validity: cal(days),
      prices: { adult: amount },
    }),
  ),
  {
    id: "pool25",
    name: "25時間券",
    validity: { mode: "hours_pool", hours: 25 },
    prices: { adult: 39000 },
  },
  {
    id: "topup5",
    name: "トップアップ5時間",
    validity: { mode: "hours_pool", hours: 5 },
    addOnTo: ["pool25"],
    prices: { adult: 7300 },
  },
];
const T_HOURS = [{ type: "regular" as const, start: "09:00", end: "20:00" }];
export const hoursPoolResort = specResort({
  id: "spec-hours-pool",
  hours: T_HOURS,
  tickets: T_TICKETS,
});
/** T07: トップアップだけを売っているデータ */
export const topupOnlyResort = specResort({
  id: "spec-topup-only",
  hours: T_HOURS,
  tickets: T_TICKETS.filter(ticket => ticket.id === "topup5"),
});
/** T01〜T05 用に、連続日券を外した版（25時間券の比較だけを見る） */
export const hoursPoolNoDaysResort = specResort({
  id: "spec-hours-pool-no-days",
  hours: T_HOURS,
  tickets: T_TICKETS.filter(
    ticket => !ticket.id.startsWith("d") || ticket.id === "day",
  ),
});

// ---- L: 複数日 ----
const NORMAL = { start: "2026-12-01", end: "2027-02-28" };
const SPRING = { start: "2027-03-01", end: "2027-05-06" };
const seasonal = (
  normal: Record<string, number>,
  spring: Record<string, number>,
): Pick<SpecTicket, "priceBy"> => ({
  priceBy: [
    { days: { ranges: [NORMAL] }, prices: normal },
    { days: { ranges: [SPRING] }, prices: spring },
  ],
});
const L_TICKETS: SpecTicket[] = [
  {
    id: "d1",
    name: "1日券",
    validity: { mode: "calendar_day", days: 1 },
    covers: ["regular"],
    ...seasonal(
      { adult: 6000, elementary: 3000 },
      { adult: 5000, elementary: 3000 },
    ),
  },
  {
    id: "d2",
    name: "2日券",
    validity: cal(2),
    ...seasonal(
      { adult: 10500, elementary: 5500 },
      { adult: 9000, elementary: 5500 },
    ),
  },
  { id: "d3", name: "3日券", validity: cal(3), prices: { adult: 15000 } },
  { id: "d4", name: "4日券", validity: cal(4), prices: { adult: 24000 } },
  { id: "d5", name: "5日券", validity: cal(5), prices: { adult: 26000 } },
  { id: "d6", name: "6日券", validity: cal(6), prices: { adult: 33000 } },
  {
    id: "select2",
    name: "選択日券（好きな2日）",
    validity: { mode: "selectable_days", days: 2 },
    prices: { adult: 11000 },
  },
  {
    id: "h4",
    name: "4時間券",
    validity: { mode: "hours_from_first_use", hours: 4 },
    prices: { adult: 4500 },
  },
  {
    id: "ladies",
    name: "レディースDAY",
    validity: { mode: "calendar_day", days: 1 },
    covers: ["regular"],
    genders: ["female"],
    reasons: ["special_day"],
    priceBy: [{ days: "thursday", prices: { adult: 2000 } }],
  },
];
const L_RENTALS = [
  { id: "a-1", items: ["ski_set"], prices: { adult: 4700 }, shop: "店舗A" },
  {
    id: "a-2",
    items: ["ski_set"],
    prices: { adult: 8700 },
    shop: "店舗A",
    duration: { mode: "days", days: 2 },
  },
  {
    id: "a-3",
    items: ["ski_set"],
    prices: { adult: 14700 },
    shop: "店舗A",
    duration: { mode: "days", days: 3 },
  },
  {
    id: "a-extra",
    name: "3日目以降の延長",
    items: ["ski_set"],
    prices: { adult: 4000 },
    shop: "店舗A",
    duration: { mode: "extra_day", after_days: 2 },
  },
  {
    id: "b-7",
    items: ["ski_set"],
    prices: { adult: 25000 },
    shop: "店舗B",
    duration: { mode: "days", days: 7 },
  },
];
const lResort = (id: string, closedDates: string[] = []) =>
  specResort({
    id,
    hours: [
      { type: "regular", start: "08:30", end: "16:30" },
      ...(closedDates.length > 0
        ? [{ type: "closed" as const, days: { dates: closedDates } }]
        : []),
    ],
    tickets: L_TICKETS,
    rentals: L_RENTALS,
  });
export const multiDayResort = lResort("spec-multi-day");
/** L09: 1/19 だけ臨時休業 */
export const multiDayClosedResort = lResort("spec-multi-day-closed", [
  "2027-01-19",
]);
