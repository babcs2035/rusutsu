import { listCurrentCrawlLatestResortIds } from "@/lib/crawlLatestCurrent";
import type { LatestStatusMappingKind } from "../types";

/** DBまたは同梱ファイルに、対象カテゴリの取得結果があるスキー場を表示する。 */
export const listCrawlerCoveredResortIds = async (
  kind: LatestStatusMappingKind,
): Promise<Set<string>> => new Set(await listCurrentCrawlLatestResortIds(kind));
