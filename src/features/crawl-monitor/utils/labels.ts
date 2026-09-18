import type {
  CrawlMonitorCategorySummary,
  CrawlMonitorSourceMode,
} from "@/server/crawl-latest/adminContract";
import { CRAWL_LATEST_CATEGORY_KINDS } from "@/server/crawl-latest/contract";

export type CategoryKind = (typeof CRAWL_LATEST_CATEGORY_KINDS)[number];

export const CATEGORY_KINDS = CRAWL_LATEST_CATEGORY_KINDS;

export const CATEGORY_LABELS: Record<CategoryKind, string> = {
  COMMENT: "コメント",
  NEWS: "お知らせ",
  WEATHER: "天気",
  COURSES: "コース",
  LIFTS: "リフト",
};

export const STATE_LABELS: Record<
  CrawlMonitorCategorySummary["state"],
  string
> = {
  SUCCESS: "取得",
  EMPTY: "空",
  NOT_SUPPORTED: "非対応",
  FAILED: "失敗",
};

export const OUTCOME_LABELS = {
  SUCCESS: "正常",
  PARTIAL: "一部警告",
  FAILED: "失敗",
} as const;

export const SOURCE_MODE_LABELS: Record<CrawlMonitorSourceMode, string> = {
  LIVE: "本番取得",
  WAYBACK_VALIDATION: "Wayback検証",
};

export const SEVERITY_LABELS = {
  WARNING: "警告",
  ERROR: "エラー",
} as const;

export type Tone = "ok" | "warn" | "bad" | "muted";

/** カテゴリの状態と検証結果から、画面で使う1つの色味に落とす。 */
export const categoryTone = (
  category: Pick<CrawlMonitorCategorySummary, "state" | "validationState">,
): Tone => {
  if (category.state === "NOT_SUPPORTED") return "muted";
  if (category.state === "FAILED" || category.validationState === "INVALID")
    return "bad";
  if (category.state === "EMPTY" || category.validationState === "WARNING")
    return "warn";
  return "ok";
};

export const outcomeTone = (outcome: keyof typeof OUTCOME_LABELS): Tone =>
  outcome === "SUCCESS" ? "ok" : outcome === "PARTIAL" ? "warn" : "bad";

export const TONE_CLASSES: Record<Tone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  bad: "border-rose-200 bg-rose-50 text-rose-800",
  muted: "border-gray-200 bg-gray-100 text-gray-500",
};

const JST_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 表示はすべてJSTに統一する。運用者が公式サイトと突き合わせるため。 */
export const formatJst = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return JST_FORMATTER.format(date);
};

export const formatElapsed = (iso: string, now: number): string => {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "-";
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}時間前`;
  return `${Math.round(hours / 24)}日前`;
};
