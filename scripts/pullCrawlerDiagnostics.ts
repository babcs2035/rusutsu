import { promises as fs } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { normalizeInternalDataApiBaseUrl } from "@/lib/internalDataApiBaseUrl";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

type RunSummary = {
  id: string;
  resortId: string;
  observedAt: string;
  outcome: "SUCCESS" | "PARTIAL" | "FAILED";
};

type Artifact = {
  id: string;
  state: "AVAILABLE" | "FAILED";
  pageKey: string;
  sha256: string | null;
  captureError: string | null;
};

type RunDetail = RunSummary & {
  issues?: unknown[];
  artifacts?: Artifact[];
};

type CliOptions = {
  resortId: string | null;
  runId: string | null;
  outputRoot: string;
};

const DEFAULT_OUTPUT_ROOT = path.join(
  process.cwd(),
  "src/private/data/resorts-temporary/crawl_latest_dom/remote",
);

const safeSegment = (value: string, label: string) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(value)) {
    throw new Error(`${label}が不正です: ${value}`);
  }
  return value;
};

const parseArguments = (args: string[]): CliOptions => {
  let resortId: string | null = null;
  let runId: string | null = null;
  let outputRoot = DEFAULT_OUTPUT_ROOT;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (option === "--resort" && value) {
      resortId = safeSegment(value, "スキー場ID");
      index += 1;
    } else if (option === "--run-id" && value) {
      runId = safeSegment(value, "run ID");
      index += 1;
    } else if (option === "--output" && value) {
      outputRoot = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`不明な引数です: ${option ?? ""}`);
    }
  }
  if (!resortId && !runId) {
    throw new Error("--resort または --run-id を指定してください。");
  }
  if (resortId && runId) {
    throw new Error("--resort と --run-id は同時に指定できません。");
  }
  return { resortId, runId, outputRoot };
};

const readConfiguration = () => {
  const rawBaseUrl = process.env.DATA_API_BASE_URL?.trim();
  const token = process.env.INTERNAL_DATA_API_DIAGNOSTICS_TOKEN?.trim();
  if (!rawBaseUrl) {
    throw new Error("DATA_API_BASE_URL が設定されていません。");
  }
  if (!token) {
    throw new Error(
      "INTERNAL_DATA_API_DIAGNOSTICS_TOKEN が設定されていません。",
    );
  }
  return {
    baseUrl: normalizeInternalDataApiBaseUrl(rawBaseUrl),
    token,
  };
};

const request = async (
  pathName: string,
  configuration: ReturnType<typeof readConfiguration>,
) => {
  const response = await fetch(`${configuration.baseUrl}${pathName}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${configuration.token}`,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`診断APIがHTTP ${response.status}を返しました。`);
  }
  return response;
};

const readRun = async (
  runId: string,
  configuration: ReturnType<typeof readConfiguration>,
): Promise<RunDetail> => {
  const search = new URLSearchParams({
    runId,
    include: "issues,artifacts",
  });
  const response = await request(
    `/api/internal/v1/crawl-latest-runs?${search.toString()}`,
    configuration,
  );
  const body = (await response.json()) as { run?: RunDetail };
  if (!body.run) throw new Error("runの取得結果が不正です。");
  return body.run;
};

const findLatestDiagnosticRun = async (
  resortId: string,
  configuration: ReturnType<typeof readConfiguration>,
): Promise<RunDetail> => {
  const search = new URLSearchParams({ resortId, limit: "100" });
  const response = await request(
    `/api/internal/v1/crawl-latest-runs?${search.toString()}`,
    configuration,
  );
  const body = (await response.json()) as { runs?: RunSummary[] };
  if (!Array.isArray(body.runs)) {
    throw new Error("run一覧の取得結果が不正です。");
  }

  for (const summary of body.runs) {
    if (summary.outcome === "SUCCESS") continue;
    const detail = await readRun(summary.id, configuration);
    if ((detail.issues?.length ?? 0) > 0 || (detail.artifacts?.length ?? 0) > 0)
      return detail;
  }
  throw new Error(`${resortId} に取得可能な失敗・警告DOMがありません。`);
};

const downloadArtifacts = async (
  run: RunDetail,
  options: CliOptions,
  configuration: ReturnType<typeof readConfiguration>,
) => {
  const directory = path.join(
    options.outputRoot,
    safeSegment(run.resortId, "スキー場ID"),
    safeSegment(run.id, "run ID"),
  );
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });

  let downloaded = 0;
  for (const artifact of run.artifacts ?? []) {
    if (artifact.state !== "AVAILABLE") continue;
    const response = await request(
      `/api/internal/v1/crawl-latest-artifacts/${encodeURIComponent(
        artifact.id,
      )}/content`,
      configuration,
    );
    const fileName = `${safeSegment(artifact.id, "artifact ID")}-${path
      .basename(artifact.pageKey)
      .replace(/[^A-Za-z0-9._-]/gu, "-")}`;
    await fs.writeFile(path.join(directory, fileName), await response.text(), {
      encoding: "utf8",
      mode: 0o600,
    });
    downloaded += 1;
  }

  await fs.writeFile(
    path.join(directory, "run.json"),
    `${JSON.stringify(run, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  if (downloaded === 0)
    console.log(
      "DOMを取得できなかった実行のため、警告・失敗メタデータをrun.jsonへ保存しました。",
    );
  return { directory, downloaded };
};

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const configuration = readConfiguration();
  const run = options.runId
    ? await readRun(options.runId, configuration)
    : await findLatestDiagnosticRun(options.resortId ?? "", configuration);
  const result = await downloadArtifacts(run, options, configuration);
  console.log(
    `✅ ${result.downloaded}個の診断DOMを保存しました: ${result.directory}`,
  );
}

main().catch(error => {
  console.error(
    `❌ 診断DOMを取得できませんでした: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
