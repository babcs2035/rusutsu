/** 仕様書 節B・C・N: 1日＋ナイター券がある型、1日券にナイターが含まれる型、ナイターが別料金の型 */
import { type SpecRental, specResort } from "../../testing/specResort";
import { dayTicket, hourTicket, windowTicket } from "../helpers";

const saturdayNight = {
  type: "night" as const,
  days: "saturday" as const,
  start: "17:00",
  end: "21:00",
};

const bTickets = (withCombined: boolean) => [
  dayTicket("day", "1日券", 5000),
  ...(withCombined
    ? [dayTicket("day-night", "1日＋ナイター券", 6000, ["regular", "night"])]
    : []),
  windowTicket("night", "ナイター券", "17:00", "21:00", 2500, ["night"]),
  hourTicket("h4", "4時間券", 4, 4000),
];

const bRentals = (dayRentalEnd: string | null): SpecRental[] => [
  {
    id: "ski-set-day",
    items: ["ski_set"],
    prices: { adult: 5000 },
    duration: { mode: "day", end_time: dayRentalEnd },
  },
  {
    id: "ski-set-night",
    items: ["ski_set"],
    prices: { adult: 2500 },
    duration: { mode: "night", start_time: "17:00" },
  },
];

const bHours = [
  { type: "regular" as const, start: "08:30", end: "17:00" },
  saturdayNight,
];

/** B: 通常 8:30〜17:00、ナイターは土曜のみ */
export const resortB = specResort({
  id: "spec-b",
  hours: bHours,
  tickets: bTickets(true),
  rentals: bRentals(null),
});

/** B03: 1日＋ナイター券を削除 */
export const resortB03 = specResort({
  id: "spec-b03",
  hours: bHours,
  tickets: bTickets(false),
});

/** B12a: 日中のレンタルはナイター終了まで使える */
export const resortB12a = specResort({
  id: "spec-b12a",
  hours: bHours,
  tickets: bTickets(true),
  rentals: bRentals("21:00"),
});

/** B12b: 日中のレンタルは17:00まで */
export const resortB12b = specResort({
  id: "spec-b12b",
  hours: bHours,
  tickets: bTickets(true),
  rentals: bRentals("17:00"),
});

/** C: 蔵王温泉型。ナイター営業日は土曜（1/23）のみ */
export const resortC = specResort({
  id: "spec-c",
  hours: [
    { type: "regular", start: "08:30", end: "17:00" },
    {
      type: "night",
      days: { dates: ["2027-01-23"] },
      start: "17:00",
      end: "21:00",
    },
  ],
  tickets: [
    dayTicket("day", "1日券", 8000, ["regular", "night"]),
    windowTicket("night", "ナイター券", "17:00", "21:00", 3000, ["night"]),
    hourTicket("h4", "4時間券", 4, 5000),
  ],
});

const nTickets = (withAddOn: boolean) => [
  dayTicket("day", "1日券", 5000),
  windowTicket("night", "ナイター券", "17:00", "21:00", 3000, ["night"]),
  ...(withAddOn
    ? [
        windowTicket(
          "addon",
          "＋ナイター券",
          "17:00",
          "21:00",
          1500,
          ["night"],
          {
            addOnTo: ["day"],
          },
        ),
      ]
    : []),
  windowTicket(
    "pm-night",
    "午後＆ナイター券",
    "13:00",
    "21:00",
    4000,
    ["regular", "night"],
    { priceBy: [{ days: "saturday", prices: { adult: 4000 } }] },
  ),
];

const nHours = [
  { type: "regular" as const, start: "08:30", end: "16:30" },
  { ...saturdayNight },
];

/** N: ナイターが別料金の型（16:30〜17:00は休止） */
export const resortN = specResort({
  id: "spec-n",
  hours: nHours,
  tickets: nTickets(true),
});

/** N02: ＋ナイター券を削除 */
export const resortN02 = specResort({
  id: "spec-n02",
  hours: nHours,
  tickets: nTickets(false),
});
