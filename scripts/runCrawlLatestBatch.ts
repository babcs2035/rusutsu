import { type ChildProcess, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeInternalDataApiBaseUrl } from "@/lib/internalDataApiBaseUrl";
import {
  type CrawlLatestApiResult,
  parseCrawlLatestApiResultLine,
} from "@/private/scripts/crawl_latest/shared/http-run-finalizer";

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1_000;
const MAX_CONCURRENCY = 4;
const RESORT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export type RunMode = "local-files" | "remote-api";
export type RunStatus = "success" | "warning" | "failed" | "timeout";

type Options = {
  concurrency: number;
  help: boolean;
  list: boolean;
  mode: RunMode;
  quiet: boolean;
  reportPath: string | null;
  resortIds: string[];
  timeoutMs: number;
};

type CrawlerResult = {
  resortId: string;
  status: RunStatus;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  warnings: string[];
  apiResult: CrawlLatestApiResult | null;
  batchError: string | null;
};

type BatchReport = {
  schemaVersion: 1;
  mode: RunMode;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  total: number;
  counts: Record<RunStatus, number>;
  results: CrawlerResult[];
};

const crawlerDirectory = path.resolve(
  process.cwd(),
  "src/private/scripts/crawl_latest/resorts",
);
const activeCrawlerChildren = new Set<ChildProcess>();
let shutdownSignal: NodeJS.Signals | null = null;

export const terminateChildProcessTree = (
  child: Pick<ChildProcess, "kill" | "pid">,
  signal: NodeJS.Signals,
): void => {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") {
        return;
      }
      child.kill(signal);
      return;
    }
  }
  child.kill(signal);
};

const beginShutdown = (signal: NodeJS.Signals): void => {
  if (shutdownSignal) return;
  shutdownSignal = signal;
  process.exitCode = 1;
  process.stderr.write(
    `[batch] ${signal}を受信したため、実行中のクローラーを停止します。\n`,
  );
  for (const child of activeCrawlerChildren) {
    terminateChildProcessTree(child, "SIGTERM");
  }
  const forceKillTimer = setTimeout(() => {
    for (const child of activeCrawlerChildren) {
      terminateChildProcessTree(child, "SIGKILL");
    }
  }, 5_000);
  forceKillTimer.unref();
};

export const isActiveCrawlerFile = (fileName: string): boolean =>
  fileName.endsWith(".ts") &&
  fileName !== "template.ts" &&
  !fileName.endsWith("_before.ts") &&
  !fileName.endsWith(".test.ts") &&
  !fileName.endsWith(".spec.ts");

export async function listActiveCrawlerFiles(
  directory = crawlerDirectory,
): Promise<string[]> {
  return (await fs.readdir(directory))
    .filter(isActiveCrawlerFile)
    .sort((left, right) => left.localeCompare(right));
}

const positiveInteger = (
  value: string | undefined,
  label: string,
  maximum?: number,
): number => {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    (maximum !== undefined && parsed > maximum)
  ) {
    const range = maximum ? `1〜${maximum}` : "1以上";
    throw new Error(`${label}には${range}の整数を指定してください。`);
  }
  return parsed;
};

export function parseOptions(args: string[]): Options {
  const options: Options = {
    concurrency: positiveInteger(
      process.env.CRAWL_LATEST_CONCURRENCY || String(DEFAULT_CONCURRENCY),
      "CRAWL_LATEST_CONCURRENCY",
      MAX_CONCURRENCY,
    ),
    help: false,
    list: false,
    mode: "local-files",
    quiet: false,
    reportPath: null,
    resortIds: [],
    timeoutMs: positiveInteger(
      process.env.CRAWL_LATEST_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS),
      "CRAWL_LATEST_TIMEOUT_MS",
    ),
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--concurrency") {
      options.concurrency = positiveInteger(
        value,
        "--concurrency",
        MAX_CONCURRENCY,
      );
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--list") {
      options.list = true;
    } else if (argument === "--local-files") {
      options.mode = "local-files";
    } else if (argument === "--remote-api") {
      options.mode = "remote-api";
    } else if (argument === "--quiet") {
      options.quiet = true;
    } else if (argument === "--report" && value) {
      options.reportPath = path.resolve(value);
      index += 1;
    } else if (argument === "--resort" && value) {
      if (!RESORT_ID_PATTERN.test(value)) {
        throw new Error(`スキー場IDが不正です: ${value}`);
      }
      options.resortIds.push(value);
      index += 1;
    } else if (argument === "--timeout-ms") {
      options.timeoutMs = positiveInteger(value, "--timeout-ms");
      index += 1;
    } else {
      throw new Error(`不明な引数です: ${argument ?? ""}`);
    }
  }

  options.resortIds = [...new Set(options.resortIds)].sort();
  return options;
}

const usage = `
使い方:
  mise run crawl:latest -- --local-files
  mise run crawl:latest -- --local-files --resort rusutsu-resort
  mise run crawl:latest -- --remote-api

オプション:
  --local-files       ローカルJSONへ保存（既定・API設定を明示的に無効化）
  --remote-api        DATA_API_BASE_URLのAPIへ送信
  --resort <id>       対象を限定（複数指定可）
  --concurrency <n>   同時実行数（1〜${MAX_CONCURRENCY}、既定1）
  --timeout-ms <ms>   1スキー場の制限時間（既定20分）
  --report <path>     実行結果をJSONでも保存
  --quiet             各クローラーの生ログを画面へ流さない
  --list              実行対象だけを表示
`;

const requireRemoteConfiguration = (): void => {
  const baseUrl = process.env.DATA_API_BASE_URL?.trim();
  const token = process.env.INTERNAL_DATA_API_CRAWLER_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new Error(
      "--remote-apiにはDATA_API_BASE_URLと" +
        "INTERNAL_DATA_API_CRAWLER_TOKENが必要です。",
    );
  }
  normalizeInternalDataApiBaseUrl(baseUrl);
};

const selectCrawlerFiles = async (options: Options): Promise<string[]> => {
  const activeFiles = await listActiveCrawlerFiles();
  if (options.resortIds.length === 0) return activeFiles;

  const activeSet = new Set(activeFiles);
  const requested = options.resortIds.map(resortId => `${resortId}.ts`);
  const missing = requested.filter(fileName => !activeSet.has(fileName));
  if (missing.length > 0) {
    throw new Error(
      `実行対象のクローラーが見つかりません: ${missing.join(", ")}`,
    );
  }
  return requested;
};

export const childEnvironment = (
  mode: RunMode,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {
    ...source,
    DATABASE_URL: "",
    INTERNAL_DATA_API_TOKEN: "",
    INTERNAL_DATA_API_ADMIN_TOKEN: "",
    INTERNAL_DATA_API_DIAGNOSTICS_TOKEN: "",
  };
  if (mode === "local-files") {
    environment.DATA_API_BASE_URL = "";
    environment.INTERNAL_DATA_API_CRAWLER_TOKEN = "";
    environment.INTERNAL_DATA_API_TOKEN = "";
  }
  return environment;
};

const warningLine = (line: string): boolean =>
  line.includes("⚠️") || /\bwarn(?:ing)?\b/iu.test(line);

const connectOutput = (
  stream: NodeJS.ReadableStream,
  resortId: string,
  output: NodeJS.WriteStream,
  warnings: Set<string>,
  apiResults: CrawlLatestApiResult[],
  apiResultErrors: Set<string>,
  quiet: boolean,
): void => {
  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/u);
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      captureApiResult(line, apiResults, apiResultErrors);
      if (warningLine(line)) warnings.add(line);
      if (!quiet) output.write(`[${resortId}] ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (!buffered) return;
    captureApiResult(buffered, apiResults, apiResultErrors);
    if (warningLine(buffered)) warnings.add(buffered);
    if (!quiet) output.write(`[${resortId}] ${buffered}\n`);
  });
};

const captureApiResult = (
  line: string,
  apiResults: CrawlLatestApiResult[],
  apiResultErrors: Set<string>,
): void => {
  try {
    const result = parseCrawlLatestApiResultLine(line);
    if (result) apiResults.push(result);
  } catch (error) {
    apiResultErrors.add(
      error instanceof Error
        ? error.message
        : "API結果行を解析できませんでした。",
    );
  }
};

type CompletionInput = {
  mode: RunMode;
  timedOut: boolean;
  exitCode: number | null;
  warningCount: number;
  apiResults: CrawlLatestApiResult[];
  apiResultErrors: string[];
};

type Completion = {
  status: RunStatus;
  apiResult: CrawlLatestApiResult | null;
  batchError: string | null;
};

export const classifyCrawlerCompletion = ({
  mode,
  timedOut,
  exitCode,
  warningCount,
  apiResults,
  apiResultErrors,
}: CompletionInput): Completion => {
  const apiResult = apiResults.length === 1 ? (apiResults[0] ?? null) : null;
  if (timedOut) {
    return {
      status: "timeout",
      apiResult,
      batchError: "制限時間を超過しました。",
    };
  }
  if (exitCode !== 0) {
    return {
      status: "failed",
      apiResult,
      batchError: `クローラーが終了コード${String(exitCode)}で終了しました。`,
    };
  }
  if (mode === "local-files") {
    return {
      status: warningCount > 0 ? "warning" : "success",
      apiResult: null,
      batchError: null,
    };
  }
  if (apiResultErrors.length > 0) {
    return {
      status: "failed",
      apiResult: null,
      batchError: `API結果行が不正です: ${apiResultErrors.join("; ")}`,
    };
  }
  if (apiResults.length !== 1) {
    return {
      status: "failed",
      apiResult: null,
      batchError:
        apiResults.length === 0
          ? "API結果行が出力されませんでした。"
          : `API結果行が${apiResults.length}件出力されました。`,
    };
  }
  return {
    status:
      apiResult?.outcome === "SUCCESS"
        ? "success"
        : apiResult?.outcome === "PARTIAL"
          ? "warning"
          : "failed",
    apiResult,
    batchError: null,
  };
};

const runCrawler = (
  fileName: string,
  options: Options,
): Promise<CrawlerResult> => {
  const resortId = fileName.replace(/\.ts$/u, "");
  const startedAt = Date.now();
  const warnings = new Set<string>();
  const apiResults: CrawlLatestApiResult[] = [];
  const apiResultErrors = new Set<string>();

  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", path.join(crawlerDirectory, fileName)],
      {
        cwd: process.cwd(),
        detached: process.platform !== "win32",
        env: childEnvironment(options.mode),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    activeCrawlerChildren.add(child);
    let timedOut = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateChildProcessTree(child, "SIGTERM");
      forceKillTimer = setTimeout(
        () => terminateChildProcessTree(child, "SIGKILL"),
        5_000,
      );
      forceKillTimer.unref();
    }, options.timeoutMs);
    timeout.unref();

    if (child.stdout) {
      connectOutput(
        child.stdout,
        resortId,
        process.stdout,
        warnings,
        apiResults,
        apiResultErrors,
        options.quiet,
      );
    }
    if (child.stderr) {
      connectOutput(
        child.stderr,
        resortId,
        process.stderr,
        warnings,
        apiResults,
        apiResultErrors,
        options.quiet,
      );
    }
    child.once("error", error => {
      process.stderr.write(`[${resortId}] 起動失敗: ${error.message}\n`);
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (timedOut || shutdownSignal) {
        // The direct Node child may have exited before Chromium and its helper
        // processes. Kill the now leaderless process group before forgetting it.
        terminateChildProcessTree(child, "SIGKILL");
      }
      activeCrawlerChildren.delete(child);
      const completion = classifyCrawlerCompletion({
        mode: options.mode,
        timedOut,
        exitCode,
        warningCount: warnings.size,
        apiResults,
        apiResultErrors: [...apiResultErrors],
      });
      resolve({
        resortId,
        status: completion.status,
        exitCode,
        signal,
        durationMs: Date.now() - startedAt,
        warnings: [...warnings],
        apiResult: completion.apiResult,
        batchError: completion.batchError,
      });
    });
  });
};

const runWithConcurrency = async (
  files: string[],
  options: Options,
): Promise<CrawlerResult[]> => {
  const results: CrawlerResult[] = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < files.length && !shutdownSignal) {
      const fileName = files[nextIndex];
      nextIndex += 1;
      const result = await runCrawler(fileName, options);
      results.push(result);
      console.log(
        `[batch] ${result.resortId}: ${result.status} ` +
          `(${Math.round(result.durationMs / 1_000)}秒, ` +
          `警告${result.warnings.length}件)`,
      );
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(options.concurrency, files.length) }, worker),
  );
  return results.sort((left, right) =>
    left.resortId.localeCompare(right.resortId),
  );
};

const buildReport = (
  mode: RunMode,
  startedAt: Date,
  results: CrawlerResult[],
): BatchReport => {
  const finishedAt = new Date();
  const counts: Record<RunStatus, number> = {
    success: 0,
    warning: 0,
    failed: 0,
    timeout: 0,
  };
  for (const result of results) counts[result.status] += 1;
  return {
    schemaVersion: 1,
    mode,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    total: results.length,
    counts,
    results,
  };
};

const writeReport = async (
  reportPath: string,
  report: BatchReport,
): Promise<void> => {
  await fs.mkdir(path.dirname(reportPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
};

async function main(): Promise<void> {
  process.once("SIGINT", beginShutdown);
  process.once("SIGTERM", beginShutdown);
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(usage.trim());
    return;
  }
  if (options.mode === "remote-api") requireRemoteConfiguration();
  const files = await selectCrawlerFiles(options);
  if (options.list) {
    console.log(
      files.map(fileName => fileName.replace(/\.ts$/u, "")).join("\n"),
    );
    return;
  }

  const startedAt = new Date();
  console.log(
    `[batch] ${files.length}件を${options.mode}モード、` +
      `同時実行数${options.concurrency}で開始します。`,
  );
  const results = await runWithConcurrency(files, options);
  const report = buildReport(options.mode, startedAt, results);
  if (options.reportPath) await writeReport(options.reportPath, report);

  console.log(
    `[batch] 完了: 正常${report.counts.success}、` +
      `警告${report.counts.warning}、失敗${report.counts.failed}、` +
      `timeout${report.counts.timeout}`,
  );
  if (report.counts.failed > 0 || report.counts.timeout > 0) {
    process.exitCode = 1;
  }
}

const invokedUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedUrl === import.meta.url) {
  main().catch(error => {
    console.error(
      `❌ crawl_latest一括実行に失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
