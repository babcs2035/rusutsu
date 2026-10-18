const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

const dayLabel = (date: string) => String(Number(date.split("-")[2]));
const monthDayLabel = (date: string) =>
  `${Number(date.split("-")[1])}/${dayLabel(date)}`;

const utcTime = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** 連続日は「10/18~20」「10/30~11/2」、飛び飛びの同月日は「10/18,20」。 */
export function formatVisitDates(dates: string[]): string {
  const uniqueDates = [...new Set(dates.filter(Boolean))];
  const ranges: { start: string; end: string }[] = [];
  for (const date of uniqueDates) {
    const previous = ranges.at(-1);
    if (previous && utcTime(date) - utcTime(previous.end) === 86_400_000) {
      previous.end = date;
    } else {
      ranges.push({ start: date, end: date });
    }
  }

  return ranges
    .map(({ start, end }, index) => {
      const continuesMonth =
        index > 0 && sameMonth(start, ranges[index - 1].end);
      const separator = index === 0 ? "" : continuesMonth ? "," : "・";
      const first = continuesMonth ? dayLabel(start) : monthDayLabel(start);
      const last =
        start === end
          ? ""
          : `~${sameMonth(start, end) ? dayLabel(end) : monthDayLabel(end)}`;
      return `${separator}${first}${last}`;
    })
    .join("");
}
