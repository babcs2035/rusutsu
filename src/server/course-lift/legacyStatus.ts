import path from "node:path";
import {
  type LatestStatusKind,
  type LatestSuccessfulStatus,
  loadLatestSuccessfulStatus,
} from "@/lib/latestStatusFiles";

/** Keep the existing file fallback; never substitute Wayback validation captures. */
export async function readLegacyOperationStatus(
  resortId: string,
  kind: LatestStatusKind,
  root = path.join(process.cwd(), "src/private/data/resorts-temporary"),
): Promise<LatestSuccessfulStatus | null> {
  const status = await loadLatestSuccessfulStatus(root, resortId, kind);
  if (!status) return null;
  // Legacy crawler filenames contain Japan local time, without an offset.
  const match = /^(\d{4})_(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.json$/u.exec(
    status.fileName,
  );
  const observedAt = match
    ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+09:00`
    : null;
  return {
    ...status,
    items: status.items.map(item => ({
      ...item,
      _snapshotId: `bundled:${resortId}/${status.fileName}`,
      _observedAt: observedAt,
      _sourceUrls: status.sourceUrls,
    })),
  };
}
