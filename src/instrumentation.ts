export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startEditRequestJobScheduler } = await import(
      "@/server/edit-requests/jobScheduler"
    );
    startEditRequestJobScheduler();

    // 開発環境ではクローラースケジューラーを無効化
    if (process.env.NODE_ENV === "development") {
      console.log("ℹ️ Scheduler passed (development environment).");
      return;
    }

    // サーバーサイド（Node.js ランタイム）でのみ実行
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
