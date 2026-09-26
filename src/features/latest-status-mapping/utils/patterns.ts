import type { LatestSuccessfulStatus } from "@/lib/latestStatusFiles";
import type { LatestStatusMappingPattern } from "../types";

/** 状態・並び順・取得時刻の違いは別パターンにしない。名称の集合でまとめる。 */
export function groupMappingPatterns(
  captures: LatestSuccessfulStatus[],
): LatestStatusMappingPattern[] {
  const groups = new Map<string, LatestStatusMappingPattern>();
  const seen = new Set<string>();
  for (const capture of captures) {
    if (seen.has(capture.fileName)) continue;
    seen.add(capture.fileName);
    const items = capture.items.flatMap(item =>
      typeof item.name === "string" && item.name.trim()
        ? [
            {
              name: item.name.trim(),
              status: typeof item.status === "string" ? item.status : null,
              note: typeof item.note === "string" ? item.note : null,
              time: typeof item.update === "string" ? item.update : null,
            },
          ]
        : [],
    );
    if (!items.length) continue;
    const id = JSON.stringify(
      [...new Set(items.map(item => item.name))].sort(),
    );
    const existing = groups.get(id);
    if (existing) {
      existing.captureCount += 1;
      continue;
    }
    groups.set(id, {
      id,
      fileName: capture.fileName,
      time: capture.time,
      archiveTimestamp: capture.archiveTimestamp,
      sourceUrls: capture.sourceUrls,
      items,
      captureCount: 1,
    });
  }
  return [...groups.values()];
}
