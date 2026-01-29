export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // サーバーサイド（Node.js ランタイム）でのみ実行
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
