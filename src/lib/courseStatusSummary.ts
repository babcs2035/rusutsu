import { normalizeIconSymbol } from "@/features/resort-detail/utils/detailMetrics";
import type { LatestSuccessfulStatus } from "./latestStatusFiles";

export type CourseStatusSummary = {
  total: number;
  open: number;
  partial: number;
  closed: number;
  unknown: number;
  observedAt: string | null;
  sourceUrls: string[];
  updates: string[];
};

/** 地図の線・グループではなく、対応する公式の営業状況の各項目を数える。 */
export function createCourseStatusSummary(
  snapshot: LatestSuccessfulStatus | null,
  matchedNames: Array<string | null | undefined>,
  mappingHasLinks: boolean,
): CourseStatusSummary | null {
  if (!snapshot) return null;
  const names = new Set(
    matchedNames.filter((name): name is string => Boolean(name)),
  );
  const restrictToMapped = mappingHasLinks || names.size > 0;
  const items = snapshot.items.filter(
    item =>
      typeof item.name === "string" &&
      item.name.trim() !== "" &&
      (!restrictToMapped || names.has(item.name.trim())),
  );
  const summary: CourseStatusSummary = {
    total: items.length,
    open: 0,
    partial: 0,
    closed: 0,
    unknown: 0,
    observedAt: snapshot.time,
    sourceUrls: snapshot.sourceUrls,
    updates: [],
  };
  for (const item of items) {
    const symbol = normalizeIconSymbol(
      typeof item.status === "string" ? item.status : null,
    );
    summary[
      symbol === "○"
        ? "open"
        : symbol === "△"
          ? "partial"
          : symbol === "×"
            ? "closed"
            : "unknown"
    ]++;
  }
  summary.updates = [
    ...new Set(
      items.flatMap(item =>
        typeof item.update === "string" && item.update.trim()
          ? [item.update.trim()]
          : [],
      ),
    ),
  ];
  return summary;
}
