import path from "node:path";
import {
  type LatestStatusKind,
  type LatestSuccessfulStatus,
  listResortIdsWithLatestStatus,
  loadLatestSuccessfulStatus,
} from "@/lib/latestStatusFiles";

type CurrentStatusReader = {
  findArchivedCrawlLatestStatusDirect?(
    resortId: string,
    kind: LatestStatusKind,
  ): Promise<LatestSuccessfulStatus | null>;
  listArchivedCrawlLatestResortIdsDirect?(
    kind: LatestStatusKind,
  ): Promise<string[]>;
  findCurrentCrawlLatestStatusDirect(
    resortId: string,
    kind: LatestStatusKind,
  ): Promise<LatestSuccessfulStatus | null>;
  listCurrentCrawlLatestResortIdsDirect(
    kind: LatestStatusKind,
  ): Promise<string[]>;
};

const temporaryRoot = path.join(
  process.cwd(),
  "src/private/data/resorts-temporary",
);

/**
 * 管理画面と内部APIで共通の参照規則を使う。
 * 公開表示はDBに採用済みの結果だけを使う。名称対応の編集（includeArchives）では、
 * Waybackの記録と同梱の過去の取得結果も候補として読む。
 */
export async function findAvailableCrawlLatestStatusDirect(
  resortId: string,
  kind: LatestStatusKind,
  reader?: CurrentStatusReader,
  root = temporaryRoot,
  includeArchives = false,
): Promise<LatestSuccessfulStatus | null> {
  const database = reader ?? (await import("./current"));
  const current = await database.findCurrentCrawlLatestStatusDirect(
    resortId,
    kind,
  );
  if (!includeArchives) return current;
  // 名称対応には名前が要るので、掲載なしの現在値なら過去の記録を候補にする。
  if (current && current.items.length > 0) return current;
  const archived = await database.findArchivedCrawlLatestStatusDirect?.(
    resortId,
    kind,
  );
  if (archived) return archived;
  return loadLatestSuccessfulStatus(root, resortId, kind);
}

export async function listAvailableCrawlLatestResortIdsDirect(
  kind: LatestStatusKind,
  reader?: CurrentStatusReader,
  root = temporaryRoot,
  includeArchives = false,
): Promise<string[]> {
  const database = reader ?? (await import("./current"));
  const [databaseIds, bundledIds, archiveIds] = await Promise.all([
    database.listCurrentCrawlLatestResortIdsDirect(kind),
    includeArchives
      ? listResortIdsWithLatestStatus(root)
      : { courses: new Set<string>(), lifts: new Set<string>() },
    includeArchives
      ? (database.listArchivedCrawlLatestResortIdsDirect?.(kind) ?? [])
      : [],
  ]);
  return [
    ...new Set([...databaseIds, ...archiveIds, ...bundledIds[kind]]),
  ].sort();
}
