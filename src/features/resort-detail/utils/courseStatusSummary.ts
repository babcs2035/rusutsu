import { routeNumber } from "@/features/course-recommendations/algorithm";
import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import {
  createFinalizedCourseGroups,
  getCourseGroupStatus,
  normalizeIconSymbol,
} from "./detailMetrics";

/** Lightweight rows (one row per map geometry) grouped as logical courses. */
export function summarizeMapCourseStatuses(
  rows: Array<{
    groupId: string;
    status: string | null | undefined;
    groupKind?: "continuous" | "routes";
    routeKey?: string;
    recommendationGroupingInvalid?: boolean;
  }>,
): Pick<
  CourseStatusSummary,
  "total" | "open" | "partial" | "closed" | "unknown"
> {
  const rowsByGroup = new Map<string, typeof rows>();
  for (const row of rows) {
    const groupRows = rowsByGroup.get(row.groupId) ?? [];
    groupRows.push(row);
    rowsByGroup.set(row.groupId, groupRows);
  }

  const summary = {
    total: rowsByGroup.size,
    open: 0,
    partial: 0,
    closed: 0,
    unknown: 0,
  };
  for (const groupRows of rowsByGroup.values()) {
    let selectedRows = groupRows;
    if (
      groupRows.some(row => row.groupKind === "routes") &&
      !groupRows.some(row => row.recommendationGroupingInvalid) &&
      groupRows.every(
        row => row.groupKind === "routes" && routeNumber(row.routeKey) !== null,
      )
    ) {
      const mainRoute = Math.min(
        ...groupRows.map(row => routeNumber(row.routeKey) as number),
      );
      selectedRows = groupRows.filter(
        row => routeNumber(row.routeKey) === mainRoute,
      );
    }
    const symbols = selectedRows.map(({ status }) =>
      normalizeIconSymbol(status),
    );
    const known = symbols.filter(
      (symbol): symbol is "○" | "△" | "×" => symbol !== null,
    );
    const symbol =
      known.length === 0 || known.length !== symbols.length
        ? null
        : known.every(value => value === "○")
          ? "○"
          : known.every(value => value === "×")
            ? "×"
            : "△";
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
  return summary;
}

/** 地図上の線分ではなく、論理コースごとの営業状況を集計する。 */
export function createMapCourseStatusSummary(
  section: FinalizedResortMapData["courses"] | undefined,
): CourseStatusSummary | null {
  if (!section) return null;

  const groups = createFinalizedCourseGroups(section.features);
  const counts = summarizeMapCourseStatuses(
    groups.map(group => ({
      groupId: group.id,
      status: getCourseGroupStatus(group).symbol,
    })),
  );
  const summary: CourseStatusSummary = {
    ...counts,
    observedAt: section.observedAt ?? null,
    sourceUrls: section.sourceUrls,
    updates: [
      ...new Set(
        section.features.flatMap(course =>
          course.properties.update?.trim()
            ? [course.properties.update.trim()]
            : [],
        ),
      ),
    ],
  };

  return summary;
}
