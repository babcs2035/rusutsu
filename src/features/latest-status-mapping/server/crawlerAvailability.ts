import path from "node:path";
import { listMappingCrawlLatestResortIds } from "@/lib/crawlLatestCurrent";
import { listDataDocuments } from "@/server/data-documents/client";
import type { LatestStatusMappingKind } from "../types";
import { readResolvedLatestStatusMapping } from "./mappingFiles";

/** DBまたは同梱ファイルに、対象カテゴリの取得結果があるスキー場を表示する。 */
export const listCrawlerCoveredResortIds = async (
  kind: LatestStatusMappingKind,
): Promise<Set<string>> => new Set(await listMappingCrawlLatestResortIds(kind));

const MAPPING_KEY_PREFIX = "resorts-temporary/latest_status_mapping/";

const temporaryRoot = (): string =>
  path.join(process.cwd(), "src/private/data/resorts-temporary");

/**
 * 対応表に、そのカテゴリの行があるスキー場。
 *
 * 対応表があるスキー場だけを読むので、全スキー場分の読み込みにはならない。
 */
export const listMappedResortIds = async (
  kind: LatestStatusMappingKind,
): Promise<Set<string>> => {
  const documents = await listDataDocuments(MAPPING_KEY_PREFIX);
  const resortIds = documents.flatMap(document => {
    const match = /([^/]+)\.json$/u.exec(document.key);
    return match ? [match[1]] : [];
  });
  const root = temporaryRoot();
  const configured = await Promise.all(
    resortIds.map(async resortId =>
      (await readResolvedLatestStatusMapping(root, resortId, kind)).configured
        ? [resortId]
        : [],
    ),
  );
  return new Set(configured.flat());
};
