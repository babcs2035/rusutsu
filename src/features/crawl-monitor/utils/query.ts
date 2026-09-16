import {
  CRAWL_MONITOR_PAGE_SIZE,
  CRAWL_MONITOR_SOURCE_MODES,
  type CrawlMonitorSourceMode,
} from "@/server/crawl-latest/adminContract";
import { CATEGORY_KINDS, type CategoryKind } from "./labels";

/**
 * 画面の絞り込みはすべてURLへ置く。リロードと共有でも同じ表示になり、
 * 件数が増えてもサーバー側で絞ってから描画できる。
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const OVERVIEW_STATUS_FILTERS = [
  "all",
  "attention",
  "failed",
  "warning",
  "missing",
  "stale",
] as const;
export type OverviewStatusFilter = (typeof OVERVIEW_STATUS_FILTERS)[number];

export const OVERVIEW_STATUS_LABELS: Record<OverviewStatusFilter, string> = {
  all: "すべて",
  attention: "要確認のみ",
  failed: "失敗",
  warning: "警告あり",
  missing: "未取得",
  stale: "24時間以上更新なし",
};

export type OverviewQuery = {
  q: string;
  prefecture: string;
  status: OverviewStatusFilter;
  sourceModes: CrawlMonitorSourceMode[];
  page: number;
};

export type IssueQuery = {
  severity: "WARNING" | "ERROR" | null;
  code: string | null;
  resortId: string | null;
  categoryKind: CategoryKind | null;
  blockingOnly: boolean;
  days: number | null;
  sourceModes: CrawlMonitorSourceMode[];
  page: number;
};

const single = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export const parsePage = (value: string | string[] | undefined): number => {
  const parsed = Number.parseInt(single(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 200);
};

/** 既定は本番取得のみ。Wayback検証は現在値へ昇格しないので、混ぜたい時だけ明示する。 */
export const parseSourceModes = (
  value: string | string[] | undefined,
): CrawlMonitorSourceMode[] => {
  const requested = single(value)
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean);
  const modes = CRAWL_MONITOR_SOURCE_MODES.filter(mode =>
    requested.includes(mode),
  );
  return modes.length > 0 ? [...modes] : ["LIVE"];
};

export const parseOverviewQuery = (params: RawSearchParams): OverviewQuery => {
  const status = single(params.status);
  return {
    q: single(params.q).slice(0, 100),
    prefecture: single(params.prefecture).slice(0, 20),
    status: (OVERVIEW_STATUS_FILTERS as readonly string[]).includes(status)
      ? (status as OverviewStatusFilter)
      : "all",
    sourceModes: parseSourceModes(params.sourceModes),
    page: parsePage(params.page),
  };
};

export const parseIssueQuery = (params: RawSearchParams): IssueQuery => {
  const severity = single(params.severity);
  const categoryKind = single(params.categoryKind);
  const days = Number.parseInt(single(params.days), 10);
  return {
    severity: severity === "WARNING" || severity === "ERROR" ? severity : null,
    code: single(params.code).slice(0, 100) || null,
    resortId: single(params.resortId) || null,
    categoryKind: (CATEGORY_KINDS as readonly string[]).includes(categoryKind)
      ? (categoryKind as CategoryKind)
      : null,
    blockingOnly: single(params.blockingOnly) === "1",
    days: Number.isFinite(days) && days > 0 ? Math.min(days, 365) : null,
    sourceModes: parseSourceModes(params.sourceModes),
    page: parsePage(params.page),
  };
};

export const sinceFromDays = (
  days: number | null,
  now: number,
): string | null =>
  days === null ? null : new Date(now - days * 86_400_000).toISOString();

export const pageSize = CRAWL_MONITOR_PAGE_SIZE;

/** 現在の絞り込みを保ったままページだけ差し替えたリンクを作る。 */
export const buildQueryString = (
  base: Record<string, string | number | boolean | null | undefined>,
  overrides: Record<string, string | number | null> = {},
): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      value === false
    )
      continue;
    params.set(key, value === true ? "1" : String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
};
