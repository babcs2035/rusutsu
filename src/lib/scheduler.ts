import cron from "node-cron";
import { runCrawlerIfNeeded } from "@/lib/crawl";

// 多重起動防止用フラグ（グローバルスコープ）
const globalForScheduler = globalThis as unknown as {
  hasSchedulerStarted: boolean | undefined;
};

export function startScheduler() {
  // 本番APIを使うローカルNext.jsから運用DB向けジョブを実行しない。
  if (
    process.env.DATA_API_BASE_URL?.trim() ||
    process.env.DISABLE_CRAWLER_SCHEDULER === "true"
  ) {
    return;
  }
  if (globalForScheduler.hasSchedulerStarted) {
    console.log("🕒 Scheduler already started, skipping initialization.");
    return;
  }

  globalForScheduler.hasSchedulerStarted = true;
  console.log("🚀 Starting scheduler...");

  // 雪マジのみ定期実行する。デプロイ・再起動時には実行しない。
  cron.schedule(
    "0 3 * * *",
    () => {
      console.log("⏰ Running scheduled YukiMagi crawl at 03:00 JST...");
      runCrawlerIfNeeded("yukiMagi")
        .then(result => {
          console.log(result.message);
        })
        .catch(err => {
          console.error("❌ Scheduled YukiMagi run failed:", err);
        });
    },
    {
      timezone: "Asia/Tokyo",
    },
  );

  console.log(
    "📅 Scheduler initialized: YukiMagi job set for 03:00 JST daily.",
  );
}
