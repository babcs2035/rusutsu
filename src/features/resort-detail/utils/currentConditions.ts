export type ConditionSnapshot = {
  time: string | null;
  archived?: boolean;
  sourceUrls: string[];
  data: unknown;
};
export type ResortConditions = {
  weather: ConditionSnapshot | null;
  comment: ConditionSnapshot | null;
};
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const conditionText = (value: unknown): string | null => {
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== "string") return null;
  const text = value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
  return !text || /^(?:--?|\*+|不明)$/u.test(text) ? null : text;
};
export const sourceUrls = (value: unknown): string[] => [
  ...new Set(
    (Array.isArray(value) ? value : [value]).filter((url): url is string => {
      if (typeof url !== "string") return false;
      try {
        const parsed = new URL(url);
        return (
          ["https:", "http:"].includes(parsed.protocol) &&
          !parsed.username &&
          !parsed.password
        );
      } catch {
        return false;
      }
    }),
  ),
];

/** ファイルの weatherUrl/commentUrl を別カテゴリに混ぜず、そのまま引き継ぐ。 */
export function conditionsFromCapture(value: unknown): ResortConditions {
  const data = record(value);
  const time = typeof data.time === "string" ? data.time : null;
  return {
    weather: {
      data: record(data.weather),
      time,
      sourceUrls: sourceUrls(data.weatherUrl),
    },
    comment: {
      data: { value: data.comment ?? null },
      time,
      sourceUrls: sourceUrls(data.commentUrl),
    },
  };
}

/** 出典URLが1つでも登録されているか。未登録＝まだ取得できていない情報。 */
export const hasSourceUrl = (value: unknown): boolean =>
  sourceUrls(value).length > 0;
