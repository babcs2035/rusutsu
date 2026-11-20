/** 料金のシーズン・販売日・運休日を，日本の暦と個別日付から判定する． */
import type { LiftTicketCalendar, LiftTicketData } from "../types";

/** 時差に左右されないよう，東京の当日を ISO 日付にする． */
export const getTodayInJapan = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
};

const pad = (value: number) => String(value).padStart(2, "0");
const ymd = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;
const dayOfWeek = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day)).getUTCDay();
const nthMonday = (year: number, month: number, nth: number) => {
  const firstDayOfWeek = dayOfWeek(year, month, 1);
  const firstMonday = 1 + ((8 - firstDayOfWeek) % 7);
  return firstMonday + (nth - 1) * 7;
};
const vernalEquinoxDay = (year: number) =>
  Math.floor(20.8431 + 0.242194 * (year - 1980)) -
  Math.floor((year - 1980) / 4);
const autumnalEquinoxDay = (year: number) =>
  Math.floor(23.2488 + 0.242194 * (year - 1980)) -
  Math.floor((year - 1980) / 4);
export const addDays = (dateString: string, numberOfDays: number) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + numberOfDays));
  return ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

const holidayCache = new Map<number, Map<string, string>>();

const holidaysOfYear = (year: number) => {
  const holidays = new Map([
    [ymd(year, 1, 1), "元日"],
    [ymd(year, 1, nthMonday(year, 1, 2)), "成人の日"],
    [ymd(year, 2, 11), "建国記念の日"],
    [ymd(year, 2, 23), "天皇誕生日"],
    [ymd(year, 3, vernalEquinoxDay(year)), "春分の日"],
    [ymd(year, 4, 29), "昭和の日"],
    [ymd(year, 5, 3), "憲法記念日"],
    [ymd(year, 5, 4), "みどりの日"],
    [ymd(year, 5, 5), "こどもの日"],
    [ymd(year, 7, nthMonday(year, 7, 3)), "海の日"],
    [ymd(year, 8, 11), "山の日"],
    [ymd(year, 9, nthMonday(year, 9, 3)), "敬老の日"],
    [ymd(year, 9, autumnalEquinoxDay(year)), "秋分の日"],
    [ymd(year, 10, nthMonday(year, 10, 2)), "スポーツの日"],
    [ymd(year, 11, 3), "文化の日"],
    [ymd(year, 11, 23), "勤労感謝の日"],
  ]);

  for (const dateString of [...holidays.keys()]) {
    const [holidayYear, month, day] = dateString.split("-").map(Number);
    if (dayOfWeek(holidayYear, month, day) !== 0) continue;

    let nextDate = addDays(dateString, 1);
    while (holidays.has(nextDate)) {
      nextDate = addDays(nextDate, 1);
    }
    holidays.set(nextDate, "振替休日");
  }

  for (const dateString of [...holidays.keys()]) {
    const between = addDays(dateString, 1);
    const after = addDays(dateString, 2);
    if (holidays.has(between) || !holidays.has(after)) continue;

    const [betweenYear, month, day] = between.split("-").map(Number);
    if (dayOfWeek(betweenYear, month, day) !== 0) {
      holidays.set(between, "国民の休日");
    }
  }

  return holidays;
};

const getDayInfo = (dateString: string) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const weekday = dayOfWeek(year, month, day);
  if (!holidayCache.has(year)) {
    holidayCache.set(year, holidaysOfYear(year));
  }
  const holidayName = holidayCache.get(year)?.get(dateString) ?? null;

  return {
    weekday,
    isSaturday: weekday === 6,
    isSunday: weekday === 0,
    isPublicHoliday: holidayName !== null,
    isWeekday: weekday >= 1 && weekday <= 5 && holidayName === null,
  };
};

/** 曜日番号 → included_day_types のラベル（0=日曜） */
const WEEKDAY_DAY_TYPES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const dayTypeMatches = (dayType: string, dateString: string) => {
  const dayInfo = getDayInfo(dateString);
  switch (dayType) {
    case "all":
      return true;
    case "weekday":
      return dayInfo.isWeekday;
    case "saturday":
      return dayInfo.isSaturday;
    case "sunday":
      return dayInfo.isSunday;
    case "public_holiday":
      return dayInfo.isPublicHoliday;
    // ★個別曜日。「毎週火曜定休」「毎週土曜こどもデー」を表すために必要。
    // これが無いと定休日のカレンダーが一致せず、営業していない日に料金が出る。
    // 祝日かどうかは問わない（定休日は祝日でも定休なのが普通）
    case "monday":
    case "tuesday":
    case "wednesday":
    case "thursday":
    case "friday":
      return WEEKDAY_DAY_TYPES[dayInfo.weekday] === dayType;
    default:
      // year_end_new_year / special / unknown は明示日付でのみ一致させる
      return false;
  }
};

export const calendarMatchesDate = (
  calendar: LiftTicketCalendar | undefined,
  dateString: string,
) => {
  if (!calendar) return false;
  if (calendar.excluded_dates?.includes(dateString)) return false;
  if (
    calendar.excluded_date_ranges?.some(
      range => range.start <= dateString && dateString <= range.end,
    )
  ) {
    return false;
  }
  return (
    calendar.included_dates?.includes(dateString) === true ||
    calendar.included_date_ranges?.some(
      range => range.start <= dateString && dateString <= range.end,
    ) === true ||
    calendar.included_day_types?.some(dayType =>
      dayTypeMatches(dayType, dateString),
    ) === true
  );
};

export const periodContains = (
  period: { start?: string | null; end?: string | null } | null | undefined,
  dateString: string,
) => {
  if (!period) return true;
  if (period.start && dateString < period.start) return false;
  if (period.end && dateString > period.end) return false;
  return true;
};

export const seasonContains = (data: LiftTicketData, dateString: string) =>
  periodContains(
    {
      start: data.season.start_date,
      end: data.season.end_date,
    },
    dateString,
  );

export const selectLiftTicketSeason = (
  seasons: LiftTicketData[],
  dateString: string,
) => {
  if (seasons.length === 0) return null;
  if (!dateString) return seasons[0];
  return seasons.find(season => seasonContains(season, dateString)) ?? null;
};
