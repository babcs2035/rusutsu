/** 仕様書 節D・E・F・G: めがひら型、営業時間が短い型、営業時間が不明な型、1日券より安い長時間券がある型 */
import {
  type SpecHours,
  type SpecTicket,
  specResort,
} from "../../testing/specResort";
import { dayTicket, hourTicket, windowTicket } from "../helpers";

const dTickets: SpecTicket[] = [
  hourTicket("h9", "9時間券", 9, 6300, {
    priceBy: [
      { days: "weekday", prices: { adult: 6300 } },
      { days: "holiday", prices: { adult: 6800 } },
    ],
  }),
  hourTicket("h6", "6時間券", 6, 5900, {
    priceBy: [
      { days: "weekday", prices: { adult: 5900 } },
      { days: "holiday", prices: { adult: 6300 } },
    ],
  }),
  hourTicket("h4", "4時間券", 4, 5400, {
    priceBy: [
      { days: "weekday", prices: { adult: 5400 } },
      { days: "holiday", prices: { adult: 5800 } },
    ],
  }),
  hourTicket("h3", "3時間券", 3, 4900, {
    priceBy: [
      { days: "weekday", prices: { adult: 4900 } },
      { days: "holiday", prices: { adult: 5300 } },
    ],
  }),
  windowTicket("gogo", "平日ゴゴイチ券", "13:00", "17:00", 3800, ["regular"], {
    priceBy: [{ days: "weekday", prices: { adult: 3800 } }],
  }),
];

const closedTuesday: SpecHours = { type: "closed", days: "tuesday" };
const dNight: SpecHours = {
  type: "night",
  days: { dates: ["2027-01-30"] },
  start: "17:00",
  end: "21:00",
};

/** D: 8:00〜17:00、ナイターは2027-01-30（土）のみ、火曜定休 */
export const resortD = specResort({
  id: "spec-d",
  hours: [
    { type: "regular", start: "08:00", end: "17:00" },
    dNight,
    closedTuesday,
  ],
  tickets: dTickets,
});

/** D04: 営業時間を不明に変更 */
export const resortD04 = specResort({
  id: "spec-d04",
  hours: [{ type: "unknown" }, dNight, closedTuesday],
  tickets: dTickets,
});

/** D05: その日の営業を 8:00〜17:30 に変更 */
export const resortD05 = specResort({
  id: "spec-d05",
  hours: [{ type: "regular", start: "08:00", end: "17:30" }, closedTuesday],
  tickets: dTickets,
});

/** E: 赤倉観光型（8:30〜16:00） */
export const resortE = specResort({
  id: "spec-e",
  hours: [{ type: "regular", start: "08:30", end: "16:00" }],
  tickets: [
    dayTicket("day", "1日券", 4500),
    hourTicket("h5", "5時間券", 5, 4000),
  ],
});

const fTickets: SpecTicket[] = [
  dayTicket("day", "1日券", 5000),
  windowTicket("am", "午前券", null, "12:00", 3500),
  windowTicket("pm", "午後券", "12:00", null, 3500),
];

/** F: 営業時間が不明な型 */
export const resortF = specResort({
  id: "spec-f",
  hours: [{ type: "unknown" }],
  tickets: fTickets,
});

/** F07: 通常営業が不明でナイター 16:00〜20:00 がある日 */
export const resortF07 = specResort({
  id: "spec-f07",
  hours: [{ type: "unknown" }, { type: "night", start: "16:00", end: "20:00" }],
  tickets: [
    ...fTickets,
    windowTicket("night", "ナイター券", "16:00", "20:00", 2500, ["night"]),
  ],
});

const gTickets: SpecTicket[] = [
  dayTicket("day", "1日券", 5500),
  hourTicket("h7", "7時間券", 7, 5300),
  hourTicket("h9", "9時間券", 9, 0, {
    // オープニング期間（〜12/20）だけの料金
    prices: undefined,
    priceBy: [
      {
        days: { ranges: [{ start: "2026-12-01", end: "2026-12-20" }] },
        prices: { adult: 3900 },
      },
    ],
  }),
];

/** G01: 営業 8:30〜16:30 */
export const resortG01 = specResort({
  id: "spec-g01",
  hours: [{ type: "regular", start: "08:30", end: "16:30" }],
  tickets: gTickets,
});

/** G02: 営業 8:00〜17:00（前季の推定） */
export const resortG02 = specResort({
  id: "spec-g02",
  hours: [{ type: "regular", start: "08:00", end: "17:00" }],
  tickets: gTickets,
});

/** G03: 営業時間が不明 */
export const resortG03 = specResort({
  id: "spec-g03",
  hours: [{ type: "unknown" }],
  tickets: gTickets,
});

/** G04: 営業 8:00〜17:30 */
export const resortG04 = specResort({
  id: "spec-g04",
  hours: [{ type: "regular", start: "08:00", end: "17:30" }],
  tickets: gTickets,
});
