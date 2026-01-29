import cron from "node-cron";
import { runAllCrawlersIfNeeded } from "@/actions/crawl";

// 多重起動防止用フラグ（グローバルスコープ）
const globalForScheduler = globalThis as unknown as {
  hasSchedulerStarted: boolean | undefined;
};

export function startScheduler() {
  if (globalForScheduler.hasSchedulerStarted) {
    console.log("🕒 Scheduler already started, skipping initialization.");
    return;
  }

  globalForScheduler.hasSchedulerStarted = true;
  console.log("🚀 Starting scheduler...");

  // 1. アプリケーション起動時の即時チェック（非同期実行、ブロックしない）
  runAllCrawlersIfNeeded().catch(err => {
    console.error("❌ Initial run failed:", err);
  });

  // 2. 定期実行スケジュール: 毎日 03:00 (JST)
  cron.schedule(
    "0 3 * * *",
    () => {
      console.log("⏰ Running scheduled crawl job at 03:00 JST...");
      runAllCrawlersIfNeeded().catch(err => {
        console.error("❌ Scheduled run failed:", err);
      });
    },
    {
      timezone: "Asia/Tokyo",
    },
  );

  console.log("📅 Scheduler initialized: Job set for 03:00 JST daily.");
}
