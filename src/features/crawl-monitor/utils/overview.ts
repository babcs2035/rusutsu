import type { CrawlMonitorOverviewRow } from "@/server/crawl-latest/adminContract";
import type { OverviewQuery, OverviewStatusFilter } from "./query";

export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1_000;

export type OverviewRowStatus = {
  isMissing: boolean;
  isFailed: boolean;
  hasWarning: boolean;
  isStale: boolean;
  /** 対応表にあるのに取れていないコース・リフトがある。 */
  hasMappingGap: boolean;
  /** 結果が「一部警告」。 */
  isPartial: boolean;
  /** 警告も失敗も鮮度の問題もない。 */
  isOk: boolean;
  needsAttention: boolean;
};

export const overviewRowStatus = (
  row: CrawlMonitorOverviewRow,
  now: number,
): OverviewRowStatus => {
  const run = row.latestRun;
  if (!run) {
    return {
      isMissing: true,
      isFailed: false,
      hasWarning: false,
      isStale: false,
      hasMappingGap: false,
      isPartial: false,
      isOk: false,
      needsAttention: true,
    };
  }
  const isFailed =
    run.outcome === "FAILED" ||
    run.categories.some(
      category =>
        category.state === "FAILED" || category.validationState === "INVALID",
    );
  const hasWarning =
    run.outcome === "PARTIAL" ||
    run.issueCounts.warning > 0 ||
    run.issueCounts.error > 0 ||
    run.categories.some(
      category =>
        category.validationState === "WARNING" ||
        (category.state === "EMPTY" && category.kind !== "COMMENT"),
    );
  const isStale = now - new Date(run.observedAt).getTime() > STALE_THRESHOLD_MS;
  const hasMappingGap = row.mappingGaps.some(gap => gap.missing.length > 0);
  const needsAttention = isFailed || hasWarning || isStale || hasMappingGap;
  return {
    isMissing: false,
    isFailed,
    hasWarning,
    isStale,
    hasMappingGap,
    isPartial: run.outcome === "PARTIAL",
    isOk: !needsAttention,
    needsAttention,
  };
};

const matchesStatus = (
  status: OverviewStatusFilter,
  rowStatus: OverviewRowStatus,
): boolean => {
  switch (status) {
    case "all":
      return true;
    case "attention":
      return rowStatus.needsAttention;
    case "ok":
      return rowStatus.isOk;
    case "partial":
      return rowStatus.isPartial;
    case "mapping":
      return rowStatus.hasMappingGap;
    case "failed":
      return rowStatus.isFailed;
    case "warning":
      return rowStatus.hasWarning;
    case "missing":
      return rowStatus.isMissing;
    case "stale":
      return rowStatus.isStale;
  }
};

const matchesText = (row: CrawlMonitorOverviewRow, q: string): boolean => {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    row.resortName.toLowerCase().includes(needle) ||
    row.resortId.toLowerCase().includes(needle) ||
    row.prefecture.toLowerCase().includes(needle)
  );
};

/** 要確認を上に、次に取得が古い順。運用者が上から潰していける並びにする。 */
const compareRows = (
  left: { row: CrawlMonitorOverviewRow; status: OverviewRowStatus },
  right: { row: CrawlMonitorOverviewRow; status: OverviewRowStatus },
): number => {
  const rank = (entry: typeof left) =>
    entry.status.isMissing || entry.status.isFailed
      ? 0
      : entry.status.hasWarning
        ? 1
        : entry.status.isStale
          ? 2
          : 3;
  const rankDiff = rank(left) - rank(right);
  if (rankDiff !== 0) return rankDiff;
  const leftTime = left.row.latestRun
    ? new Date(left.row.latestRun.observedAt).getTime()
    : 0;
  const rightTime = right.row.latestRun
    ? new Date(right.row.latestRun.observedAt).getTime()
    : 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.row.resortId.localeCompare(right.row.resortId);
};

export type OverviewEntry = {
  row: CrawlMonitorOverviewRow;
  status: OverviewRowStatus;
};

export const buildOverviewEntries = (
  rows: readonly CrawlMonitorOverviewRow[],
  query: OverviewQuery,
  now: number,
): OverviewEntry[] =>
  rows
    .map(row => ({ row, status: overviewRowStatus(row, now) }))
    .filter(
      entry =>
        matchesStatus(query.status, entry.status) &&
        matchesText(entry.row, query.q) &&
        (query.prefecture === "" || entry.row.prefecture === query.prefecture),
    )
    .sort(compareRows);

export const countAttention = (entries: readonly OverviewEntry[]) => ({
  ok: entries.filter(entry => entry.status.isOk).length,
  mappingGap: entries.filter(entry => entry.status.hasMappingGap).length,
  failed: entries.filter(entry => entry.status.isFailed).length,
  warning: entries.filter(
    entry => entry.status.hasWarning && !entry.status.isFailed,
  ).length,
  missing: entries.filter(entry => entry.status.isMissing).length,
  stale: entries.filter(entry => entry.status.isStale).length,
});

export const paginate = <T>(
  items: readonly T[],
  page: number,
  size: number,
) => {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    items: items.slice((current - 1) * size, current * size),
    page: current,
    pageCount,
    total: items.length,
  };
};
