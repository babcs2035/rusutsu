// クローラー管理モジュール
// 各クローラーの実行状態を管理し、スケジュール実行を制御する

import { prisma } from "@/lib/prisma";

// クローラー名の定義
export type CrawlerName =
  | "skiAreas"
  | "gelendes"
  | "weathers"
  | "forecasts"
  | "snowDepths"
  | "snowFalls"
  | "latestReports"
  | "yukiMagi"
  | "amedas";

/**
 * クローラーの実行ログを記録
 */
export async function recordCrawlLog(
  crawlerName: CrawlerName,
  status: "success" | "failed",
  message?: string,
): Promise<void> {
  await prisma.crawlLog.upsert({
    where: { crawlerName },
    update: {
      lastRunAt: new Date(),
      status,
      message,
    },
    create: {
      crawlerName,
      lastRunAt: new Date(),
      status,
      message,
    },
  });
}

/**
 * すべてのクローラーの状態を取得
 */
export async function getAllCrawlLogs() {
  return prisma.crawlLog.findMany({
    orderBy: { lastRunAt: "desc" },
  });
}
