"use server";

// クローリングをトリガーする Server Actions
// アプリケーション起動時や定期実行時に使用

import {
  type CrawlerName,
  recordCrawlLog,
  shouldCrawl,
} from "@/lib/crawlerManager";

// 各クローラーの実行関数をインポート
// 注意: これらは動的にインポートする（サーバーサイドでのみ実行）

/**
 * 指定されたクローラーを実行（必要な場合のみ）
 */
export async function runCrawlerIfNeeded(
  crawlerName: CrawlerName,
): Promise<{ ran: boolean; message: string }> {
  const needsCrawl = await shouldCrawl(crawlerName);

  if (!needsCrawl) {
    return {
      ran: false,
      message: `⏭️ ${crawlerName}: Skipped (last run < 24h ago)`,
    };
  }

  try {
    // クローラーを動的にインポートして実行
    await executeCrawler(crawlerName);
    await recordCrawlLog(crawlerName, "success");
    return { ran: true, message: `✅ ${crawlerName}: Completed successfully` };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await recordCrawlLog(crawlerName, "failed", errorMessage);
    return {
      ran: true,
      message: `❌ ${crawlerName}: Failed - ${errorMessage}`,
    };
  }
}

/**
 * すべてのクローラーを実行（必要な場合のみ）
 */
export async function runAllCrawlersIfNeeded(): Promise<{
  results: Array<{ crawler: CrawlerName; ran: boolean; message: string }>;
}> {
  const crawlers: CrawlerName[] = [
    "skiAreas",
    "gelendes",
    "weathers",
    "forecasts",
    "snowDepths",
    "snowFalls",
    "latestReports",
    "yukiMagi",
    "amedas",
  ];

  const results = [];
  for (const crawler of crawlers) {
    const result = await runCrawlerIfNeeded(crawler);
    results.push({ crawler, ...result });
    console.log(result.message);
  }

  return { results };
}

/**
 * クローラーを実行（内部関数）
 */
async function executeCrawler(crawlerName: CrawlerName): Promise<void> {
  // 各クローラーのメイン関数を動的インポート
  // 注意: これらのスクリプトは main() をエクスポートする必要がある
  switch (crawlerName) {
    case "skiAreas": {
      const { runCrawlSkiAreas } = await import("@/scripts/crawlSkiAreas");
      await runCrawlSkiAreas();
      break;
    }
    case "gelendes": {
      const { runCrawlGelendes } = await import("@/scripts/crawlGelendes");
      await runCrawlGelendes();
      break;
    }
    case "weathers": {
      const { runCrawlWeathers } = await import("@/scripts/crawlWeathers");
      await runCrawlWeathers();
      break;
    }
    case "forecasts": {
      const { runCrawlForecasts } = await import("@/scripts/crawlForecasts");
      await runCrawlForecasts();
      break;
    }
    case "snowDepths": {
      const { runCrawlSnowDepths } = await import("@/scripts/crawlSnowDepths");
      await runCrawlSnowDepths();
      break;
    }
    case "snowFalls": {
      const { runCrawlSnowFalls } = await import("@/scripts/crawlSnowFalls");
      await runCrawlSnowFalls();
      break;
    }
    case "latestReports": {
      const { runCrawlLatestReports } = await import(
        "@/scripts/crawlLatestReports"
      );
      await runCrawlLatestReports();
      break;
    }
    case "yukiMagi": {
      const { runCrawlYukiMagi } = await import("@/scripts/crawlYukiMagi");
      await runCrawlYukiMagi();
      break;
    }
    case "amedas": {
      const { runCrawlAmedas } = await import("@/scripts/crawlAmedas");
      await runCrawlAmedas();
      break;
    }
    default:
      throw new Error(`Unknown crawler: ${crawlerName}`);
  }
}
