import path from "node:path";
import { listResortIdsWithLatestStatus } from "@/lib/latestStatusFiles";
import type { LatestStatusMappingKind } from "../types";

const TEMPORARY_ROOT = path.join(
  process.cwd(),
  "src",
  "private",
  "data",
  "resorts-temporary",
);

/**
 * クローラーが実際に取得できているスキー場の ID 一覧。
 *
 * 「クローラーはあるが、その種別のデータは取れていない」スキー場を
 * 含めないために、latest_data の中身まで見て判定する。
 */
export const listCrawlerCoveredResortIds = async (
  kind: LatestStatusMappingKind,
): Promise<Set<string>> =>
  (await listResortIdsWithLatestStatus(TEMPORARY_ROOT))[kind];
