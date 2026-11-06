/** 仕様書 節H・I・J・K: 曜日で営業が変わる型、期間で営業が変わる型、早朝営業がある型、券の選び方 */
import { type SpecTicket, specResort } from "../../testing/specResort";
import { dayTicket, hourTicket, windowTicket } from "../helpers";

/** H: 音威富士型。月曜定休（祝日の 2027-01-11 は営業） */
export const resortH = specResort({
  id: "spec-h",
  hours: [
    {
      type: "regular",
      days: { dayTypes: ["tuesday", "thursday", "sunday"] },
      start: "09:30",
      end: "16:30",
    },
    {
      type: "regular",
      days: { dayTypes: ["wednesday", "friday"] },
      start: "13:00",
      end: "16:30",
    },
    {
      type: "night",
      days: { dayTypes: ["wednesday", "friday", "saturday"] },
      start: "17:30",
      end: "20:00",
    },
    { type: "regular", days: "saturday", start: "09:30", end: "16:30" },
    {
      type: "regular",
      days: { dates: ["2027-01-11"] },
      start: "09:30",
      end: "16:30",
    },
    {
      type: "closed",
      days: { dayTypes: ["monday"], exceptDates: ["2027-01-11"] },
    },
  ],
  tickets: [
    dayTicket("day", "1日券", 2500),
    windowTicket("am", "午前券", "09:30", "13:00", 1300),
    windowTicket("pm", "午後券", "13:00", "16:30", 1300),
    windowTicket("night", "ナイター券", "17:30", "20:00", 700, ["night"]),
  ],
});

/** I: やぶはら型（12/31まで 8:30〜16:00、1/1以降 8:30〜16:30） */
export const resortI = specResort({
  id: "spec-i",
  hours: [
    {
      type: "regular",
      days: { ranges: [{ start: "2026-12-01", end: "2026-12-31" }] },
      start: "08:30",
      end: "16:00",
    },
    {
      type: "regular",
      days: { ranges: [{ start: "2027-01-01", end: "2027-05-06" }] },
      start: "08:30",
      end: "16:30",
    },
  ],
  tickets: [
    dayTicket("day", "1日券", 4000),
    windowTicket("pm", "午後券", "12:30", null, 3000),
  ],
});

/** J: 早朝営業がある型（土曜は早朝 6:00〜8:00） */
export const resortJ = specResort({
  id: "spec-j",
  hours: [
    { type: "early_morning", days: "saturday", start: "06:00", end: "08:00" },
    { type: "regular", start: "08:00", end: "16:30" },
  ],
  tickets: [
    dayTicket("day", "1日券", 5000),
    windowTicket("early", "早朝券", "06:00", "08:00", 1500, ["early_morning"]),
    hourTicket("h9", "9時間券", 9, 5500),
  ],
});

const k = (id: string, tickets: SpecTicket[], night = false) =>
  specResort({
    id,
    hours: night
      ? [
          { type: "regular", start: "08:30", end: "17:00" },
          { type: "night", start: "17:00", end: "21:00" },
        ]
      : [{ type: "regular", start: "08:30", end: "17:00" }],
    tickets,
  });

export const resortK01 = k("spec-k01", [
  hourTicket("h6", "6時間券", 6, 5000),
  hourTicket("h8", "8時間券", 8, 5800),
  hourTicket("h9", "9時間券", 9, 5500),
  dayTicket("day", "1日券", 6000),
]);

export const resortK02 = k(
  "spec-k02",
  [
    windowTicket("twilight", "トワイライト券", "15:00", "21:00", 2500, [
      "regular",
      "night",
    ]),
    hourTicket("h4", "4時間券", 4, 3500),
  ],
  true,
);

export const resortK03 = k("spec-k03", [
  dayTicket("beginner", "初心者エリア限定1日券", 2000, ["regular"], {
    areaIds: ["beginner"],
  }),
  dayTicket("day", "1日券", 5000),
]);

export const resortK04 = k("spec-k04", [
  {
    id: "coupon",
    name: "回数券",
    validity: { mode: "rides", rides: 11 },
    prices: { adult: 8000 },
  },
  {
    id: "points",
    name: "ポイント券",
    validity: { mode: "points" },
    prices: { adult: 3000 },
  },
]);

export const resortK05 = k("spec-k05", [
  hourTicket("h4", "4時間券", 4, 3500, {
    priceBy: [
      { days: "weekday", prices: { adult: 3500 } },
      { days: "holiday", prices: { adult: 4000 } },
    ],
  }),
]);

export const resortK06 = k("spec-k06", [
  dayTicket("day", "1日券", 5000),
  dayTicket("shared", "共通券", 8000, ["regular"], { shared: true }),
]);

export const resortK07 = k("spec-k07", [
  hourTicket("onsen9", "温泉入浴付き9時間券", 9, 6000, {
    included: [{ type: "onsen", name_ja: "温泉入浴" }],
  }),
]);

export const resortK08 = k("spec-k08", [
  dayTicket("day", "1日券", 5000),
  dayTicket("meal", "食事券付き1日券", 5500, ["regular"], {
    included: [{ type: "meal", name_ja: "食事券1,000円分" }],
  }),
]);

export const resortK09 = k("spec-k09", [
  dayTicket("meal", "食事券付き1日券", 5500, ["regular"], {
    included: [{ type: "meal", name_ja: "食事券1,000円分" }],
  }),
]);
