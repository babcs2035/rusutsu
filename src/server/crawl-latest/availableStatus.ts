import path from "node:path";
import {
  type LatestStatusKind,
  type LatestSuccessfulStatus,
  listResortIdsWithLatestStatus,
  loadLatestSuccessfulStatus,
} from "@/lib/latestStatusFiles";

type CurrentStatusReader = {
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
): Promise<LatestSuccessfulStatus | null> {
  const database = reader ?? (await import("./current"));
  const current = await database.findCurrentCrawlLatestStatusDirect(
    resortId,
    kind,
  );
  return current ?? loadLatestSuccessfulStatus(root, resortId, kind);
}

export async function listAvailableCrawlLatestResortIdsDirect(
  kind: LatestStatusKind,
  reader?: CurrentStatusReader,
  root = temporaryRoot,
): Promise<string[]> {
  const database = reader ?? (await import("./current"));
  const [databaseIds, bundledIds] = await Promise.all([
    database.listCurrentCrawlLatestResortIdsDirect(kind),
    listResortIdsWithLatestStatus(root),
  ]);
  return [...new Set([...databaseIds, ...bundledIds[kind]])].sort();
}
