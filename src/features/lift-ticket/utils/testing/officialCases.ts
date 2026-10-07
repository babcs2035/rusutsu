import type { TicketPartyCategory } from "../../types";

/** 券種を変えても学校区分・資格が保持されることを公式表で照合する。 */
export const OFFICIAL_AUDIENCE_TICKETS: Record<
  string,
  Array<
    [
      product: string,
      category: TicketPartyCategory,
      age: number | null,
      amount: number | null,
    ]
  >
> = {
  "rusutsu-resort": [
    ["prod-5hour", "elementary", 10, 4700],
    ["prod-5hour", "junior_high", 13, 8100],
    ["prod-5hour", "high_school", 18, 8100],
    ["prod-5hour", "adult", 65, 8100],
    ["prod-5hour", "disabled", 30, 11600],
  ],
  "sapporo-kokusai": [
    ["prod-4hour", "elementary", null, null],
    ["prod-4hour", "junior_high", null, null],
    ["prod-4hour", "adult", 65, null],
  ],
  "megahira-onsen-megahira": [
    ["hours-3", "elementary", null, 3300],
    ["hours-4", "elementary", null, 3500],
    ["hours-6", "elementary", null, 3900],
    ["hours-3", "junior_high", null, 4900],
    ["hours-3", "disabled", null, 4900],
  ],
  naeba: [
    ["prod-naeba-4h", "elementary", null, 0],
    ["prod-naeba-8h", "elementary", null, 0],
    ["prod-mt-naeba-1day", "elementary", null, 0],
    ["prod-naeba-4h", "disabled", null, 3150],
    ["prod-naeba-8h", "disabled", null, 4150],
    ["prod-mt-naeba-1day", "disabled", null, 4900],
  ],
  meihou: [
    ["prod-afternoon", "elementary", null, 2500],
    ["prod-afternoon", "junior_high", null, 3900],
    ["prod-afternoon", "adult", 60, 4400],
    ["prod-afternoon", "disabled", 30, 4500],
  ],
  "hakuba-happo-one": [
    ["prod-am", "elementary", null, 4050],
    ["prod-pm", "high_school", 17, 4050],
  ],
};

/** 2026-09-26に公式表を独立照合した期待値。計算結果から生成しない。 */
export type OfficialCase = {
  resort: string;
  season: string;
  date: string;
  urls: string[];
  /** UIの「1日」、年齢未入力（小7〜12・中13〜15・高16〜18歳として扱う）。nullは年齢確認が必要。 */
  categories: Record<Exclude<TicketPartyCategory, "other">, number | null>;
  ages: Array<[TicketPartyCategory, number, number]>;
  disabilityAmounts: Record<
    Exclude<TicketPartyCategory, "disabled" | "other">,
    number
  >;
  /** UIの「1日」の日付別期待値（大人30歳）。 */
  dates: Array<[string, number]>;
  /** 券を指定して確認する公式料金。購入可能なWeb料金も含む。 */
  products: Array<[string, number | null]>;
  multiDays?: Array<[string[], number, number]>;
  audienceDates?: Array<[TicketPartyCategory, number | null, string, number]>;
  /** UIの時間入力→期待額（大人30歳）。nullは営業時間超過等。 */
  hours: Array<[number, number | null]>;
  closed?: string[];
  ambiguousAges?: Array<[TicketPartyCategory, number]>;
  openExceptions?: string[];
  hourAudiences?: Array<
    [TicketPartyCategory, number | null, number, number, string]
  >;
};

export const OFFICIAL_CASES: OfficialCase[] = [
  {
    resort: "rusutsu-resort",
    multiDays: [
      [
        ["2027-01-10", "2027-01-11", "2027-01-12", "2027-01-13", "2027-01-14"],
        7,
        50600,
      ],
    ],
    disabilityAmounts: {
      preschool: 4600,
      elementary: 4600,
      junior_high: 7800,
      high_school: 7800,
      university: 11100,
      adult: 11100,
    },
    season: "2026-2027",
    date: "2027-01-20",
    urls: ["https://rusutsu.com/winter-lift-tickets/"],
    categories: {
      preschool: null,
      elementary: 6400,
      junior_high: 9800,
      high_school: 9800,
      university: 13200,
      adult: 13200,
      disabled: 11100,
    },
    ages: [
      ["preschool", 3, 0],
      ["preschool", 4, 6400],
      ["elementary", 12, 6400],
      ["junior_high", 12, 6400],
      ["junior_high", 13, 9800],
      ["high_school", 18, 9800],
      ["university", 18, 9800],
      ["university", 19, 13200],
      ["adult", 64, 13200],
      ["adult", 65, 9800],
      ["disabled", 65, 7800],
    ],
    dates: [
      ["2026-12-11", 7900],
      ["2026-12-12", 10500],
      ["2026-12-18", 10500],
      ["2026-12-19", 13200],
      ["2027-03-14", 13200],
      ["2027-03-15", 10500],
    ],
    products: [
      ["prod-point", 800],
      ["prod-25hour", 36000],
      ["prod-topup5", null],
      ["prod-1day", 13200],
      ["prod-5hour", 11600],
      ["prod-2day", 26000],
      ["prod-3day", 39000],
      ["prod-4day", 52000],
      ["prod-5day", 65000],
      ["prod-night", 4000],
    ],
    hours: [
      [1, 11600],
      [5, 11600],
      [6, 13200],
    ],
  },
  {
    resort: "sapporo-kokusai",
    disabilityAmounts: {
      preschool: 0,
      elementary: 2500,
      junior_high: 3700,
      high_school: 3700,
      university: 6700,
      adult: 6700,
    },
    hourAudiences: [
      ["elementary", null, 4, 2500, "prod-1day"],
      ["junior_high", null, 4, 3700, "prod-1day"],
      ["adult", 65, 4, 5400, "prod-1day"],
    ],
    season: "2026-2027",
    date: "2027-01-20",
    urls: [
      "https://www.sapporo-kokusai.jp/price/",
      "https://www.sapporo-kokusai.jp/webshop/",
      "https://www.sapporo-kokusai.jp/slopes/",
    ],
    categories: {
      preschool: 0,
      elementary: 2500,
      junior_high: 3700,
      high_school: 3700,
      university: 6700,
      adult: 6700,
      disabled: 6700,
    },
    ages: [
      ["elementary", 12, 2500],
      ["junior_high", 12, 3700],
      ["high_school", 18, 3700],
      ["adult", 59, 6700],
      ["adult", 60, 5700],
      ["adult", 64, 5700],
      ["adult", 65, 5400],
      ["disabled", 65, 5400],
    ],
    dates: [
      ["2027-03-31", 6700],
      ["2027-04-01", 6200],
    ],
    products: [
      ["prod-pair-1ride", 750],
      ["prod-1day", 6700],
      ["prod-4hour", 6200],
    ],
    hours: [
      [1, 6200],
      [4, 6200],
      [5, 6700],
      [8, 6700],
      [9, null],
      [12, null],
    ],
  },
  {
    resort: "megahira-onsen-megahira",
    audienceDates: [["elementary", null, "2025-12-27", 1000]],
    disabilityAmounts: {
      preschool: 4300,
      elementary: 4300,
      junior_high: 6300,
      high_school: 6300,
      university: 6300,
      adult: 6300,
    },
    season: "2025-2026",
    date: "2026-01-21",
    urls: [
      "https://www.megahira.co.jp/ski/price/",
      "https://www.megahira.co.jp/ski/hours/",
      "https://www.megahira.co.jp/ski/event/",
    ],
    categories: {
      preschool: 4300,
      elementary: 4300,
      junior_high: 6300,
      high_school: 6300,
      university: 6300,
      adult: 6300,
      disabled: 6300,
    },
    ages: [
      ["elementary", 12, 4300],
      ["junior_high", 12, 6300],
      ["high_school", 18, 6300],
      ["adult", 65, 6300],
    ],
    dates: [
      ["2026-01-25", 6800],
      ["2026-01-05", 6300],
    ],
    products: [
      ["ride-1", 1300],
      ["ride-3", 2700],
      ["ride-5", 4100],
      ["kids-day-saturday", null],
      ["hours-3", 4900],
      ["hours-4", 5400],
      ["hours-6", 5900],
      ["hours-9", 6300],
      ["hours-gogoichi", 3800],
    ],
    hours: [
      [1, 4900],
      [3, 4900],
      [4, 5400],
      [5, 5900],
      [6, 5900],
      [7, 6300],
      [9, 6300],
      [10, null],
      [12, null],
    ],
    closed: ["2026-01-20", "2026-01-27"],
    openExceptions: ["2025-12-30"],
  },
  {
    resort: "naeba",
    disabilityAmounts: {
      preschool: 0,
      elementary: 0,
      junior_high: 3900,
      high_school: 3900,
      university: 3900,
      adult: 3900,
    },
    season: "2025-2026",
    date: "2026-01-21",
    urls: [
      "https://www.princehotels.co.jp/ski/naeba/winter/lift/",
      "https://www.princehotels.co.jp/ski/news/news01.html",
    ],
    categories: {
      preschool: 0,
      elementary: 0,
      junior_high: 7800,
      high_school: 7800,
      university: 7800,
      adult: 7800,
      disabled: 3900,
    },
    ages: [
      ["elementary", 12, 0],
      ["junior_high", 12, 7800],
      ["high_school", 18, 7800],
      ["adult", 65, 7800],
    ],
    dates: [["2026-01-25", 7800]],
    products: [
      ["prod-guest-naeba-2day", null],
      ["prod-naeba-1day", 7800],
      ["prod-naeba-4h", 6300],
      ["prod-naeba-8h", 8300],
      ["prod-mt-naeba-1day", 9800],
    ],
    hours: [
      [1, 6300],
      [4, 6300],
      [5, 7800],
    ],
  },
  {
    resort: "meihou",
    ambiguousAges: [["junior_high", 12]],
    disabilityAmounts: {
      preschool: 1250,
      elementary: 1250,
      junior_high: 2150,
      high_school: 2150,
      university: 2650,
      adult: 2650,
    },
    season: "2026-2027",
    date: "2027-01-20",
    urls: ["https://www.meihoski.co.jp/price/"],
    categories: {
      preschool: null,
      elementary: 2500,
      junior_high: 4300,
      high_school: 4300,
      university: 5300,
      adult: 5300,
      disabled: 2650,
    },
    ages: [
      ["preschool", 4, 2500],
      ["elementary", 12, 2500],
      ["junior_high", 13, 4300],
      ["high_school", 18, 4300],
      ["university", 18, 5300],
      ["adult", 59, 5300],
      ["adult", 60, 4800],
      ["disabled", 60, 2400],
    ],
    dates: [
      ["2027-01-24", 6300],
      ["2027-02-07", 6500],
      ["2026-12-29", 5300],
      ["2026-12-30", 6300],
      ["2027-01-03", 6300],
      ["2027-01-04", 5300],
    ],
    products: [
      ["prod-point-1", 650],
      ["prod-point-10", 5800],
      ["prod-1day", 5300],
      ["prod-afternoon", 4500],
    ],
    hours: [
      [1, 5300],
      [4, 5300],
    ],
  },
  {
    resort: "hakuba-happo-one",
    ambiguousAges: [["high_school", 18]],
    disabilityAmounts: {
      preschool: 0,
      elementary: 3900,
      junior_high: 3900,
      high_school: 3900,
      university: 7800,
      adult: 7800,
    },
    season: "2026-2027",
    date: "2027-01-20",
    urls: ["https://www.happo-one.jp/ticket/"],
    categories: {
      preschool: null,
      elementary: 4900,
      junior_high: 4900,
      high_school: 4900,
      university: 9800,
      adult: 9800,
      disabled: 7800,
    },
    ages: [
      ["preschool", 5, 0],
      ["elementary", 6, 4900],
      ["junior_high", 12, 4900],
      ["high_school", 17, 4900],
      ["university", 18, 9800],
      ["adult", 64, 9800],
      ["adult", 65, 9500],
      ["disabled", 65, 7500],
    ],
    dates: [
      ["2026-12-18", 6400],
      ["2026-12-19", 9800],
      ["2027-03-22", 9800],
      ["2027-03-23", 6400],
    ],
    products: [
      ["prod-lower-1ride", 800],
      ["prod-2day", 19600],
      ["prod-1day", 9800],
      ["prod-am", 8100],
      ["prod-pm", 8100],
    ],
    hours: [
      [1, 9800],
      [4, 9800],
    ],
  },
];
