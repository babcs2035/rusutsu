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
export function formatPublishedDate(value: string) {
  const text = value
    .trim()
    .replace(/^(?:更新日時|更新日|更新|発表日時|発表)\s*[:：]?\s*/u, "")
    .replace(/\s*現在\s*$/u, "")
    .trim();
  return text ? `${formatOperationDate(text)}現在` : null;
}
