/**
 * 仕様テスト（docs/plans/lift-ticket-duration-test-cases.md）用の架空スキー場。
 *
 * 実データと同じ LiftTicketData を、短い記述から組み立てる。
 * データは「調べたまま」の形にする（1日券が無い施設に1日券を作らない、
 * 営業時間が不明なら operating_hours を unknown にする）。
 */
import type {
  LiftTicketAudience,
  LiftTicketCalendar,
  LiftTicketData,
  LiftTicketOffer,
  LiftTicketPartyRule,
  LiftTicketProduct,
  LiftTicketRental,
  LiftTicketSearchInput,
  TicketDayDuration,
  TicketPartyCategory,
  TicketPartyGroup,
  TicketRentalItem,
  TicketRentalRequest,
} from "../../types";

/** 日の選び方。"all"・"weekday"・"holiday"（土日祝）・曜日名・日付の列・期間 */
export type DaySelector =
  | "all"
  | "weekday"
  | "holiday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"
  | {
      dayTypes?: string[];
      dates?: string[];
      ranges?: Array<{ start: string; end: string }>;
      exceptDates?: string[];
    };

/** 標準の人物区分。必要なら audiences で差し替える */
export const STANDARD_AUDIENCES: LiftTicketAudience[] = [
  { id: "adult", name_ja: "大人", is_default: true },
  {
    id: "university",
    name_ja: "大学生",
    school_levels: ["university", "graduate"],
  },
  { id: "high", name_ja: "高校生", school_levels: ["high_school"] },
  { id: "junior", name_ja: "中学生", school_levels: ["junior_high_school"] },
  { id: "elementary", name_ja: "小学生", school_levels: ["elementary_school"] },
  { id: "preschool", name_ja: "未就学", school_levels: ["preschool"] },
];

export type SpecPrices = Record<string, number | null>;

export type SpecTicket = {
  id: string;
  name: string;
  validity: LiftTicketProduct["validity"];
  covers?: string[] | null;
  areaIds?: string[];
  addOnTo?: string[];
  included?: Array<{
    type: string;
    name_ja: string;
    rental_items?: TicketRentalItem[];
  }>;
  shared?: boolean;
  /** 人物区分id → 金額。days を省略すると全日 */
  prices?: SpecPrices;
  /** 日ごとに金額が変わる場合 */
  priceBy?: Array<{ days: DaySelector; prices: SpecPrices }>;
  /** 販売経路（"window" / "web"）。省略は窓口 */
  channel?: "window" | "web";
  reasons?: string[];
  sales?: { start?: string; end?: string };
  deadline?: LiftTicketOffer["purchase_deadline"];
  requirements?: LiftTicketOffer["requirements"];
  qualification?: string;
  genders?: string[];
};

export type SpecHours = {
  type: "regular" | "night" | "early_morning" | "closed" | "unknown";
  days?: DaySelector;
  start?: string | null;
  end?: string | null;
};

export type SpecRental = {
  id: string;
  items: string[];
  prices: SpecPrices;
  shop?: string;
  grade?: string;
  duration?: LiftTicketRental["duration"];
  days?: DaySelector;
  channel?: "window" | "web";
  qualification?: string;
  deadline?: LiftTicketRental["purchase_deadline"];
  name?: string;
};

export type SpecResortInput = {
  id: string;
  season?: { start: string; end: string };
  hours?: SpecHours[];
  audiences?: LiftTicketAudience[];
  rentalAudiences?: LiftTicketAudience[];
  tickets: SpecTicket[];
  partyRules?: Array<
    Omit<LiftTicketPartyRule, "calendar_ids" | "channel_ids"> & {
      days?: DaySelector;
      channel?: "window" | "web";
    }
  >;
  fees?: LiftTicketData["fees"];
  rentals?: SpecRental[];
};

const selectorToCalendar = (
  id: string,
  selector: DaySelector,
): LiftTicketCalendar => {
  const base: LiftTicketCalendar = {
    id,
    name_ja: id,
    included_day_types: [],
    included_dates: [],
    included_date_ranges: [],
    excluded_dates: [],
    excluded_date_ranges: [],
  };
  if (typeof selector === "string") {
    if (selector === "holiday")
      return {
        ...base,
        included_day_types: ["saturday", "sunday", "public_holiday"],
      };
    return { ...base, included_day_types: [selector] };
  }
  return {
    ...base,
    included_day_types: selector.dayTypes ?? [],
    included_dates: selector.dates ?? [],
    included_date_ranges: selector.ranges ?? [],
    excluded_dates: selector.exceptDates ?? [],
  };
};

/** 架空スキー場の LiftTicketData を作る */
export const specResort = (input: SpecResortInput): LiftTicketData => {
  const calendars = new Map<string, LiftTicketCalendar>();
  const calendarOf = (selector: DaySelector = "all") => {
    const key = JSON.stringify(selector);
    const existing = [...calendars.values()].find(
      calendar => calendar.notes_ja === key,
    );
    if (existing) return existing.id;
    const id = `cal-${calendars.size + 1}`;
    calendars.set(id, { ...selectorToCalendar(id, selector), notes_ja: key });
    return id;
  };

  const channels = [
    { id: "window", name_ja: "窓口" },
    { id: "web", name_ja: "Web", url: "https://example.com/web" },
  ];

  const products: LiftTicketProduct[] = input.tickets.map(ticket => ({
    id: ticket.id,
    name_ja: ticket.name,
    validity: ticket.validity,
    covers_hours_types: ticket.covers ?? null,
    area_ids: ticket.areaIds ?? [],
    add_on_to_product_ids: ticket.addOnTo,
    included_items: ticket.included ?? [],
    shared_with_resorts: ticket.shared
      ? [{ resort_id: "other-resort", name_ja: "相手スキー場" }]
      : [],
  }));

  const offers: LiftTicketOffer[] = input.tickets.flatMap(ticket => {
    const groups = ticket.priceBy ?? [
      { days: "all" as DaySelector, prices: ticket.prices ?? {} },
    ];
    return groups.flatMap((group, groupIndex) =>
      Object.entries(group.prices).map(([audienceId, amount]) => ({
        id: `${ticket.id}-${audienceId}-${groupIndex}`,
        name_ja: ticket.name,
        product_id: ticket.id,
        audience_ids: [audienceId],
        calendar_ids: [calendarOf(group.days)],
        channel_ids: [ticket.channel ?? "window"],
        discount_reasons: ticket.reasons ?? [],
        sales_period: ticket.sales ?? null,
        purchase_deadline: ticket.deadline ?? null,
        requirements: ticket.requirements ?? [],
        target_qualification: ticket.qualification
          ? { official_label_ja: ticket.qualification }
          : null,
        target_genders: ticket.genders
          ? { official_label_ja: "女性", genders: ticket.genders }
          : null,
        price: { currency: "JPY", amount },
        source_refs: ["src"],
      })),
    );
  });

  const operatingHours = (
    input.hours ?? [{ type: "regular", start: "08:30", end: "16:30" }]
  ).map((hours, index) => ({
    id: `oh-${index + 1}`,
    hours_type: hours.type,
    calendar_ids: [calendarOf(hours.days)],
    start_time: hours.start ?? null,
    end_time: hours.end ?? null,
  }));

  const partyRules: LiftTicketPartyRule[] = (input.partyRules ?? []).map(
    ({ days, channel, ...rule }) => ({
      ...rule,
      calendar_ids: days ? [calendarOf(days)] : [],
      channel_ids: channel ? [channel] : [],
      source_refs: rule.source_refs ?? ["src"],
    }),
  );

  const rentals: LiftTicketRental[] = (input.rentals ?? []).flatMap(rental =>
    Object.entries(rental.prices).map(([audienceId, amount]) => ({
      id: `${rental.id}-${audienceId}`,
      name_ja: rental.name ?? rental.id,
      shop_name_ja: rental.shop ?? "店舗A",
      items: rental.items,
      grade_ja: rental.grade ?? null,
      audience_ids: [audienceId],
      calendar_ids: rental.days ? [calendarOf(rental.days)] : [],
      channel_ids: rental.channel ? [rental.channel] : [],
      duration: rental.duration ?? { mode: "day" },
      price: { currency: "JPY", amount },
      target_qualification: rental.qualification
        ? { official_label_ja: rental.qualification }
        : null,
      purchase_deadline: rental.deadline ?? null,
      source_refs: ["src"],
    })),
  );

  // calendarOf は上の map で呼ばれるので、calendars はここで確定している
  return {
    schema_version: "1.0.0",
    resort: { id: input.id },
    season: {
      id: "2026-2027",
      label_ja: "2026-2027",
      start_date: input.season?.start ?? "2026-12-01",
      end_date: input.season?.end ?? "2027-05-06",
    },
    sources: [{ id: "src", url: "https://example.com/price" }],
    operating_hours: operatingHours,
    audiences: input.audiences ?? STANDARD_AUDIENCES,
    calendars: [...calendars.values()],
    products,
    channels,
    offers,
    party_rules: partyRules,
    fees: input.fees ?? [],
    rental_audiences: input.rentalAudiences,
    rentals,
    data_quality: { status: "complete" },
  };
};

/** 人数の指定（"adult" 2人、"elementary" 1人 など） */
export type SpecMember = {
  category: TicketPartyCategory;
  age?: number | null;
  count?: number;
  baseCategory?: TicketPartyGroup["baseCategory"];
  rental?: TicketRentalRequest | null;
};

export const party = (...members: SpecMember[]): TicketPartyGroup[] =>
  members.map((member, index) => ({
    id: `g${index + 1}`,
    category: member.category,
    baseCategory: member.baseCategory,
    age: member.age ?? null,
    count: member.count ?? 1,
    rental: member.rental ?? null,
  }));

export const adult = (count = 1, age: number | null = null): SpecMember => ({
  category: "adult",
  count,
  age,
});
export const elementary = (count = 1): SpecMember => ({
  category: "elementary",
  count,
});

/** 1日分の照会入力。照会日は既定で利用日の1か月前 */
export const dayInput = (
  date: string,
  duration: TicketDayDuration,
  members: TicketPartyGroup[] = party(adult()),
  today = "2026-11-06",
): LiftTicketSearchInput => ({
  visitDate: date,
  today,
  usePreference: "full_day",
  party: members,
  days: [{ id: "d1", date, duration }],
});

/** 複数日の照会入力 */
export const daysInput = (
  plans: Array<{ date: string; duration?: TicketDayDuration }>,
  members: TicketPartyGroup[] = party(adult()),
  today = "2026-11-06",
): LiftTicketSearchInput => ({
  visitDate: plans[0].date,
  today,
  usePreference: "full_day",
  party: members,
  days: plans.map((plan, index) => ({
    id: `d${index + 1}`,
    date: plan.date,
    duration: plan.duration ?? DAY,
  })),
});

export const DAY: TicketDayDuration = { kind: "day", withNight: false };
export const DAY_NIGHT: TicketDayDuration = { kind: "day", withNight: true };
export const NIGHT: TicketDayDuration = { kind: "night" };
export const hours = (value: number): TicketDayDuration => ({
  kind: "hours",
  hours: value,
});
