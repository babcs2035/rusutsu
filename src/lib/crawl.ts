import "server-only";

import { type CrawlerName, recordCrawlLog } from "@/lib/crawlerManager";
import { withPostgresAdvisoryLock } from "@/lib/prisma";

const CRAWLER_LOCK_NAMESPACE = 0x5255_5355;
const CRAWLER_LOCK_KEYS: Record<CrawlerName, number> = {
  skiAreas: 1,
  gelendes: 2,
  weathers: 3,
  forecasts: 4,
  snowDepths: 5,
  snowFalls: 6,
  latestReports: 7,
  yukiMagi: 8,
  amedas: 9,
  tourLinks: 10,
  passPrograms: 11,
};

/**
 * 指定されたクローラーをサーバー内部から実行する。
 */
export async function runCrawlerIfNeeded(
  crawlerName: CrawlerName,
): Promise<{ ran: boolean; message: string }> {
  try {
    const locked = await withPostgresAdvisoryLock(
      CRAWLER_LOCK_NAMESPACE,
      CRAWLER_LOCK_KEYS[crawlerName],
      () => executeCrawler(crawlerName),
    );
    if (!locked.acquired) {
      return {
        ran: false,
        message: `⏭️ ${crawlerName}: Already running in another process`,
      };
    }
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

async function executeCrawler(crawlerName: CrawlerName): Promise<void> {
  switch (crawlerName) {
    case "skiAreas": {
      const { runCrawlSkiAreas } = await import(
        "@/private/scripts/crawlSkiAreas"
      );
      await runCrawlSkiAreas();
      break;
    }
    case "gelendes": {
      const { runCrawlGelendes } = await import(
        "@/private/scripts/crawlGelendes"
      );
      await runCrawlGelendes();
      break;
    }
    case "weathers": {
      const { runCrawlWeathers } = await import(
        "@/private/scripts/crawlWeathers"
      );
      await runCrawlWeathers();
      break;
    }
    case "forecasts": {
      const { runCrawlForecasts } = await import(
        "@/private/scripts/crawlForecasts"
      );
      await runCrawlForecasts();
      break;
    }
    case "snowDepths": {
      const { runCrawlSnowDepths } = await import(
        "@/private/scripts/crawlSnowDepths"
      );
      await runCrawlSnowDepths();
      break;
    }
    case "snowFalls": {
      const { runCrawlSnowFalls } = await import(
        "@/private/scripts/crawlSnowFalls"
      );
      await runCrawlSnowFalls();
      break;
    }
    case "latestReports": {
      const { runCrawlLatestReports } = await import(
        "@/private/scripts/crawlLatestReports"
      );
      await runCrawlLatestReports();
      break;
    }
    case "yukiMagi": {
      const { runCrawlYukiMagi } = await import(
        "@/private/scripts/crawlYukiMagi"
      );
      await runCrawlYukiMagi();
      break;
    }
    case "amedas": {
      const { runCrawlAmedas } = await import("@/private/scripts/crawlAmedas");
      await runCrawlAmedas();
      break;
    }
    case "tourLinks": {
      const { runCrawlTourLinks } = await import(
        "@/private/scripts/crawlTourLinks"
      );
      await runCrawlTourLinks();
      break;
    }
    case "passPrograms": {
      const { runCrawlPassPrograms } = await import(
        "@/private/scripts/crawlPassPrograms"
      );
      await runCrawlPassPrograms();
      break;
    }
    default:
      throw new Error(`Unknown crawler: ${crawlerName}`);
  }
}
