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
 * DBに採用済みの結果があれば優先し、なければ同梱の過去の取得結果を読む。
 * ファイルをDBへ登録したり、現在の営業情報として採用したりはしない。
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
  if (current) return current;
  if (includeArchives) {
    const archived = await database.findArchivedCrawlLatestStatusDirect?.(
      resortId,
      kind,
    );
    if (archived) return archived;
  }
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
    listResortIdsWithLatestStatus(root),
    includeArchives
      ? (database.listArchivedCrawlLatestResortIdsDirect?.(kind) ?? [])
      : [],
  ]);
  return [
    ...new Set([...databaseIds, ...archiveIds, ...bundledIds[kind]]),
  ].sort();
}
