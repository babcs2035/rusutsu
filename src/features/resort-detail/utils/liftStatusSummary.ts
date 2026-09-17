import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { normalizeIconSymbol } from "./detailMetrics";

/** リフトは地図の各リフトを1本として集計する。欠損を運休扱いにしない。 */
export function createLiftStatusSummary(
  section: FinalizedResortMapData["lifts"] | undefined,
): CourseStatusSummary | null {
  if (!section) return null;
  const summary: CourseStatusSummary = {
    total: section.features.length,
    open: 0,
    partial: 0,
    closed: 0,
    unknown: 0,
    observedAt: section.observedAt ?? null,
    sourceUrls: section.sourceUrls,
    updates: [
      ...new Set(
        section.features.flatMap(lift =>
          lift.properties.update ? [lift.properties.update] : [],
        ),
      ),
    ],
  };
  for (const lift of section.features) {
    const symbol = normalizeIconSymbol(lift.properties.status);
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
