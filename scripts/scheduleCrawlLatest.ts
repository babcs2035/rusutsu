import { type ChildProcess, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import cron from "node-cron";
import { normalizeInternalDataApiBaseUrl } from "@/lib/internalDataApiBaseUrl";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

const DEFAULT_SCHEDULE = "0 7 * * *";
const TIME_ZONE = "Asia/Tokyo";
const batchScript = path.resolve(
  process.cwd(),
  "scripts/runCrawlLatestBatch.ts",
);

const artifactRoot = path.resolve(
  process.env.CRAWLER_ARTIFACT_ROOT || "var/crawler-worker-artifacts",
);
const scheduleDirectory = path.join(artifactRoot, "schedule");
const reportDirectory = path.join(artifactRoot, "reports");

let currentChild: ChildProcess | null = null;
let shuttingDown = false;

const signalChildTree = (
  child: ChildProcess,
  signal: NodeJS.Signals,
): boolean => {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") {
        return false;
      }
    }
  }
  return child.kill(signal);
};

const validateConfiguration = (): string => {
  const schedule = process.env.CRAWL_LATEST_CRON?.trim() || DEFAULT_SCHEDULE;
  if (!cron.validate(schedule)) {
    throw new Error(`CRAWL_LATEST_CRONが不正です: ${schedule}`);
  }
  const baseUrl = process.env.DATA_API_BASE_URL?.trim();
  const token = process.env.INTERNAL_DATA_API_CRAWLER_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new Error(
      "DATA_API_BASE_URLとINTERNAL_DATA_API_CRAWLER_TOKENが必要です。",
    );
  }
  normalizeInternalDataApiBaseUrl(baseUrl);
  return schedule;
};

const dateInTokyo = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const acquireDailyRun = async (
  date: string,
): Promise<{ lockPath: string; acquired: boolean }> => {
  await fs.mkdir(scheduleDirectory, { recursive: true, mode: 0o700 });
  const lockPath = path.join(scheduleDirectory, `${date}.json`);
  try {
    const handle = await fs.open(lockPath, "wx", 0o600);
    await handle.writeFile(
      `${JSON.stringify({
        date,
        status: "RUNNING",
        startedAt: new Date().toISOString(),
        pid: process.pid,
      })}\n`,
    );
    await handle.close();
    return { lockPath, acquired: true };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return { lockPath, acquired: false };
    }
    throw error;
  }
};

const finishDailyRun = async (
  lockPath: string,
  status: "SUCCESS" | "FAILED",
  exitCode: number | null,
): Promise<void> => {
  await fs.writeFile(
    lockPath,
    `${JSON.stringify({
      status,
      exitCode,
      finishedAt: new Date().toISOString(),
    })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
};

const runBatch = async (): Promise<void> => {
  if (currentChild || shuttingDown) {
    console.warn(
      "⚠️ crawl_latestはすでに実行中のため、今回の開始を省略します。",
    );
    return;
  }

  const date = dateInTokyo(new Date());
  const lock = await acquireDailyRun(date);
  if (!lock.acquired) {
    console.warn(`⚠️ ${date}のcrawl_latestは開始済みのため省略します。`);
    return;
  }
  await fs.mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  const reportPath = path.join(reportDirectory, `${date}.json`);

  console.log(`🚠 ${date}のcrawl_latest一括実行を開始します。`);
  const exitCode = await new Promise<number | null>(resolve => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", batchScript, "--remote-api", "--report", reportPath],
      {
        cwd: process.cwd(),
        detached: process.platform !== "win32",
        env: process.env,
        stdio: "inherit",
      },
    );
    currentChild = child;
    let settled = false;
    const settle = (code: number | null) => {
      if (settled) return;
      settled = true;
      currentChild = null;
      resolve(code);
    };
    child.once("error", error => {
      console.error(
        `❌ crawl_latest workerを起動できませんでした: ${error.message}`,
      );
      settle(null);
    });
    child.once("close", code => {
      settle(code);
    });
  });

  const status = exitCode === 0 ? "SUCCESS" : "FAILED";
  await finishDailyRun(lock.lockPath, status, exitCode);
  console.log(
    status === "SUCCESS"
      ? `✅ ${date}のcrawl_latest一括実行が完了しました。`
      : `❌ ${date}のcrawl_latest一括実行が失敗しました（exit ${exitCode}）。`,
  );
};

async function main(): Promise<void> {
  const schedule = validateConfiguration();
  const task = cron.schedule(
    schedule,
    async () => {
      try {
        await runBatch();
      } catch (error) {
        console.error(
          `❌ crawl_latest定期実行の開始処理に失敗しました: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    {
      name: "crawl-latest-daily",
      noOverlap: true,
      timezone: TIME_ZONE,
    },
  );

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`🛑 ${signal}を受信したためschedulerを停止します。`);
    await task.stop();
    if (!currentChild) {
      process.exitCode = 0;
      return;
    }
    const child = currentChild;
    signalChildTree(child, "SIGTERM");
    const forceKillTimer = setTimeout(() => {
      if (currentChild === child) signalChildTree(child, "SIGKILL");
    }, 20_000);
    forceKillTimer.unref();
  };
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  const nextRun = task.getNextRun()?.toLocaleString("ja-JP", {
    timeZone: TIME_ZONE,
  });
  console.log(
    `📅 crawl_latest workerを開始しました: ${schedule} (${TIME_ZONE})、` +
      `コンテナ起動直後には実行しません。次回: ${nextRun ?? "不明"}`,
  );
}

main().catch(error => {
  console.error(
    `❌ crawl_latest schedulerを開始できませんでした: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
