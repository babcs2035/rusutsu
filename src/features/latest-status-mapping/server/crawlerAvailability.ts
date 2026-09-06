import { listCurrentCrawlLatestResortIds } from "@/lib/crawlLatestCurrent";
import type { LatestStatusMappingKind } from "../types";

/** DBで現在採用されているカテゴリを持つスキー場だけを表示する。 */
export const listCrawlerCoveredResortIds = async (
  kind: LatestStatusMappingKind,
): Promise<Set<string>> => new Set(await listCurrentCrawlLatestResortIds(kind));
