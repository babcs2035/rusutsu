import {
  formatPublishedTime,
  type PublishedTime,
  parsePublishedTime,
} from "@/shared/utils/publishedTime";

export function formatOperationDate(time?: string | null) {
  if (!time) return null;
  if (/Z$|[+-]\d\d:\d\d$/u.test(time) && Number.isFinite(Date.parse(time))) {
    return new Date(time).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return time.replace(/(\d{1,2}:\d{2}):\d{2}$/, "$1");
}
function publishedTime(value: unknown) {
  // New captures carry updateTime; older captures retain only the source text.
  return parsePublishedTime(
    value && typeof value === "object" && "raw" in value ? value.raw : value,
  );
}

export function formatPublishedDate(value: unknown) {
  const time = publishedTime(value);
  const text = time?.precision && formatPublishedTime(time);
  return text ? `${text}現在` : null;
}

const dateText = (time: PublishedTime, showYear = true) =>
  `${showYear && time.year !== null ? `${time.year}/` : ""}${time.month}/${time.day}`;

function clockText(
  time: PublishedTime,
  hourOnly: boolean,
  withSeconds: boolean,
) {
  if (hourOnly) return `${time.hour}時`;
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}${withSeconds ? `:${String(time.second).padStart(2, "0")}` : ""}`;
}

/** Group only equally anchored dates: never attach a time-only value to today. */
export function summarizePublishedDates(values: unknown[]): string[] {
  const groups = new Map<string, PublishedTime[]>();
  for (const value of values) {
    const time = publishedTime(value);
    if (!time?.precision) continue;
    const key =
      time.month !== null && time.day !== null
        ? time.year === null
          ? "month-day"
          : "year-month-day"
        : "time-only";
    const group = groups.get(key) ?? [];
    group.push(time);
    groups.set(key, group);
  }

  const summaries: string[] = [];
  for (const [key, times] of groups) {
    const dated = key !== "time-only";
    // A summary uses the coarsest precision present, without filling omissions.
    const dateOnly = dated && times.some(time => time.hour === null);
    const hourOnly = times.some(time => time.minute === null);
    const withSeconds = times.every(time => time.second !== null);
    const fields: Array<keyof PublishedTime> = [
      ...(key === "year-month-day" ? (["year"] as const) : []),
      ...(dated ? (["month", "day"] as const) : []),
      ...(!dateOnly ? (["hour"] as const) : []),
      ...(!dateOnly && !hourOnly ? (["minute"] as const) : []),
      ...(withSeconds ? (["second"] as const) : []),
    ];
    const sorted = [...times].sort((a, b) => {
      for (const field of fields) {
        const difference = Number(a[field]) - Number(b[field]);
        if (difference) return difference;
      }
      return 0;
    });
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const differentDays =
      dated &&
      (first.year !== last.year ||
        first.month !== last.month ||
        first.day !== last.day);

    if (
      key === "month-day" &&
      times.some(time => time.month !== null && time.month <= 2) &&
      times.some(time => time.month !== null && time.month >= 11)
    ) {
      // Without a year, December/January cannot be ordered chronologically.
      summaries.push(
        ...new Set(
          times.flatMap(time => {
            const text = formatPublishedDate(time);
            return text ? [text] : [];
          }),
        ),
      );
    } else if (differentDays) {
      summaries.push(
        `${dateText(first)}〜${dateText(last, first.year !== last.year)}現在`,
      );
    } else if (dateOnly) {
      summaries.push(`${dateText(first)}現在`);
    } else {
      const start = clockText(first, hourOnly, withSeconds);
      const end = clockText(last, hourOnly, withSeconds);
      summaries.push(
        `${dated ? `${dateText(first)} ` : ""}${start}${start === end ? "" : `〜${end}`}現在`,
      );
    }
  }
  return summaries;
}
