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

// 24時間（ミリ秒）
const CRAWL_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * クローラーの最終実行時刻を取得
 */
export async function getLastCrawlTime(
  crawlerName: CrawlerName,
): Promise<Date | null> {
  const log = await prisma.crawlLog.findUnique({
    where: { crawlerName },
  });
  return log?.lastRunAt ?? null;
}

/**
 * クローリングが必要かどうかを判定
 * - 前回の実行から24時間以上経過している
 * - または、一度も実行されていない
 */
export async function shouldCrawl(crawlerName: CrawlerName): Promise<boolean> {
  const lastRun = await getLastCrawlTime(crawlerName);
  if (!lastRun) return true;

  const elapsed = Date.now() - lastRun.getTime();
  return elapsed >= CRAWL_INTERVAL_MS;
}

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
