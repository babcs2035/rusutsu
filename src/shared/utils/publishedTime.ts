export type PublishedTime = {
  raw: string;
  year: number | null;
  month: number | null;
  day: number | null;
  hour: number | null;
  minute: number | null;
  second: number | null;
  precision: "day" | "hour" | "minute" | "second" | null;
  timeZone: "Asia/Tokyo";
};

const EMPTY = {
  hour: null,
  minute: null,
  second: null,
  precision: null,
  timeZone: "Asia/Tokyo" as const,
};
const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function validDate(year: number | null, month: number, day: number): boolean {
  if (year !== null && (year < 1 || year > 9999)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const leap =
    year === null || (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function result(
  raw: string,
  year: number | null,
  month: number,
  day: number,
  hour: number | null = null,
  minute: number | null = null,
  second: number | null = null,
  precision: PublishedTime["precision"] = "day",
): PublishedTime {
  return {
    raw,
    year,
    month,
    day,
    hour,
    minute,
    second,
    precision,
    timeZone: "Asia/Tokyo",
  };
}

type ParsedClock = PublishedTime & { dayShift?: number };
type Meridiem = "am" | "pm" | "午前" | "午後";

function parseClock(text: string, raw: string): ParsedClock | null {
  let s = text
    .trim()
    .replace(/^(?:現在|更新|計測)\s*/, "")
    .trim();
  if (!s) return null;
  let meridiem: Meridiem | null = null;
  const mer = /^(午前|午後|am|pm)\s*/i.exec(s);
  if (mer) {
    meridiem = mer[1].toLowerCase() as Meridiem;
    s = s.slice(mer[0].length);
  }
  const m =
    /^(\d{1,2})(?:(?:\s*時\s*(\d{1,2})?\s*分?)(?:\s*(\d{1,2})\s*秒?)?|:(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?)?\s*(am|pm)?\s*(Z|[+-]\d{2}:?\d{2}(?::?\d{2})?)?$/i.exec(
      s,
    );
  if (!m) return null;
  const hourRaw = Number(m[1]);
  let hour = hourRaw;
  const minuteText = m[2] ?? m[4];
  const secondText = m[3] ?? m[5];
  let minute = minuteText === undefined ? null : Number(minuteText);
  let second = secondText === undefined ? null : Number(secondText);
  const suffix = (m[6]?.toLowerCase() as "am" | "pm" | undefined) ?? meridiem;
  if (m[6] && meridiem) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (suffix === "pm" || suffix === "午後" ? 12 : 0);
  }
  if (
    hour > 23 ||
    (minute !== null && minute > 59) ||
    (second !== null && second > 59)
  )
    return null;
  const precision: PublishedTime["precision"] =
    second !== null ? "second" : minute !== null ? "minute" : "hour";
  const offset = m[7];
  if (offset) {
    const om =
      offset.toUpperCase() === "Z"
        ? null
        : /^([+-])(\d{2}):?(\d{2})(?::?(\d{2}))?$/.exec(offset);
    if (offset.toUpperCase() !== "Z" && !om) return null;
    const oh = om ? Number(om[2]) : 0;
    const omin = om ? Number(om[3]) : 0;
    const os = Number(om?.[4] ?? 0);
    if (oh > 14 || omin > 59 || os > 59 || (oh === 14 && (omin || os)))
      return null;
    // A fractional-hour shift cannot be represented at hour-only precision.
    if ((minute === null && omin !== 0) || (second === null && os !== 0))
      return null;
    let total = hour * 3600 + (minute ?? 0) * 60 + (second ?? 0);
    total -= (om?.[1] === "+" ? 1 : -1) * (oh * 3600 + omin * 60 + os);
    total += 9 * 3600;
    const shift = Math.floor(total / 86400);
    total = ((total % 86400) + 86400) % 86400;
    hour = Math.floor(total / 3600);
    minute = minute === null ? null : Math.floor((total % 3600) / 60);
    second = second === null ? null : total % 60;
    return {
      raw,
      year: null,
      month: null,
      day: null,
      hour,
      minute,
      second,
      precision,
      timeZone: "Asia/Tokyo",
      ...(shift ? { dayShift: shift } : {}),
    };
  }
  return {
    ...EMPTY,
    raw,
    year: null,
    month: null,
    day: null,
    hour,
    minute,
    second,
    precision,
  };
}

/** Parse a crawler's published/update timestamp without inventing missing fields. */
export function parsePublishedTime(value: unknown): PublishedTime | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || /^(?:[-—–ー]+|現在更新|現在|更新|計測)$/i.test(raw)) return null;
  let s = raw
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, " ")
    .trim();
  if (/^(?:[-—–ー]+|現在更新|現在|更新|計測)$/i.test(s)) return null;
  const dateHints =
    s.match(
      /(?:\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}|\d{1,4}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{1,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2})/giu,
    ) ?? [];
  if (dateHints.length > 1)
    return { ...EMPTY, raw, year: null, month: null, day: null };
  s = s.replace(/^\((.*)\)$/u, "$1").trim();
  s = s.replace(
    /^(?:更新日時|最終更新|update(?:d)?(?:\s+at)?)\s*[:：]?\s*/iu,
    "",
  );
  s = s.replace(/T(?=\d{2}:\d{2})/u, " ");
  s = s.replace(/(?:現在|更新|計測|updated|の予報|営業情報)\s*$/iu, "").trim();
  s = s.replace(/(?:現在|更新|計測)\s*$/u, "").trim();
  s = s.replace(/\s*期間外$/u, "").trim();
  s = s.replace(/(?:現在|更新|計測)\s*$/u, "").trim();
  s = s
    .replace(
      /(?:\((?:[月火水木金土日](?:曜(?:日)?)?(?:[・･、 /]*(?:祝|振休|祝日))?|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\)|【(?:[月火水木金土日]|Mon|Tue|Wed|Thu|Fri|Sat|Sun)】)/giu,
      " ",
    )
    .replace(
      /\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\b\.?/giu,
      " ",
    )
    .trim();

  const dateRe =
    /^(?:(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?|(?:(\d{4})\s*(?:[/.-]|\s)\s*)?(\d{1,2})\s*([/.-])\s*(\d{1,2})(?:\s*日)?|(\d{1,2})\s*月\s*(\d{1,2})\s*日?|([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?)/u;
  const dm = dateRe.exec(s);
  let year: number | null = null;
  let month = 0;
  let day = 0;
  let rest = s;
  if (dm) {
    if (dm[2]) {
      year = Number(dm[1]);
      month = Number(dm[2]);
      day = Number(dm[3]);
    } else if (dm[6]) {
      year = dm[4] ? Number(dm[4]) : null;
      month = Number(dm[5]);
      day = Number(dm[7]);
    } else if (dm[8]) {
      month = Number(dm[8]);
      day = Number(dm[9]);
    } else {
      month = MONTHS[dm[10].toLowerCase()];
      day = Number(dm[11]);
      year = dm[12] ? Number(dm[12]) : null;
    }
    if (!month || !validDate(year, month, day))
      return { ...EMPTY, raw, year: null, month: null, day: null };
    rest = s
      .slice(dm[0].length)
      .trim()
      .replace(/^[,./·・-]+\s*/, "");
    if (/^[-–—]+$/u.test(rest)) rest = "";
    if (/^(?:〜|～|~|から|[-–—])/u.test(rest))
      return { ...EMPTY, raw, year: null, month: null, day: null };
    if (!rest) return result(raw, year, month, day);
    const clock = parseClock(rest, raw);
    if (!clock) return { ...EMPTY, raw, year: null, month: null, day: null };
    const shift = clock.dayShift ?? 0;
    if (shift) {
      const shiftDate = (fullYear: number) => {
        const date = new Date(0);
        date.setUTCFullYear(fullYear, month - 1, day + shift);
        return date;
      };
      const pivot = shiftDate(year ?? 2000);
      // For an omitted year, do not decide whether February has 28 or 29 days.
      const nonLeap = year === null ? shiftDate(2001) : pivot;
      if (
        nonLeap.getUTCMonth() !== pivot.getUTCMonth() ||
        nonLeap.getUTCDate() !== pivot.getUTCDate()
      )
        return { ...EMPTY, raw, year: null, month: null, day: null };
      year = year === null ? null : pivot.getUTCFullYear();
      month = pivot.getUTCMonth() + 1;
      day = pivot.getUTCDate();
      if (!validDate(year, month, day))
        return { ...EMPTY, raw, year: null, month: null, day: null };
    }
    const { dayShift: _dayShift, ...parsed } = clock;
    return { ...parsed, year, month, day };
  }
  const timeOnly = parseClock(s, raw);
  if (timeOnly) {
    const { dayShift: _dayShift, ...parsed } = timeOnly;
    return parsed;
  }
  return { ...EMPTY, raw, year: null, month: null, day: null };
}

export function formatPublishedTime(time: PublishedTime): string | null {
  const date =
    time.month === null || time.day === null
      ? null
      : `${time.year === null ? "" : `${time.year}/`}${time.month}/${time.day}`;
  const clock =
    time.hour === null
      ? null
      : time.minute === null
        ? `${time.hour}時`
        : `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}${time.second === null ? "" : `:${String(time.second).padStart(2, "0")}`}`;
  if (date && clock) return `${date} ${clock}`;
  return date ?? clock;
}
