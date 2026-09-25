import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import { validateTicketContent } from "../src/features/ticket/server/validateTicket";
import { normalizeInternalDataApiBaseUrl } from "../src/lib/internalDataApiBaseUrl";
import {
  LIFT_TICKET_MAX_CONTENT_BYTES,
  liftTicketSeasonGetResponseSchema,
  liftTicketSeasonIdSchema,
  serializeLiftTicket,
} from "../src/server/lift-tickets/contract";
import { skiResortIdSchema } from "../src/server/ski-resorts/adminContract";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const USAGE =
  "Usage: mise run lift-ticket:publish -- --resort <id> --season <YYYY-YYYY> [--apply | --pull] [--plan <file>]";
const API_PATH = "/api/internal/v1/lift-tickets";
const planSchema = z.strictObject({
  baseUrl: z.string(),
  resortId: z.string(),
  seasonId: z.string(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/u),
  expectedVersion: z.number().int().positive().nullable(),
});

const hashContent = (content: string) =>
  createHash("sha256").update(content, "utf8").digest("hex");

async function main() {
  let resortId = "";
  let seasonId = "";
  let mode: "preview" | "apply" | "pull" = "preview";
  let planFile = "";
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") continue;
    if (arg === "--resort" && args[i + 1]) resortId = args[++i];
    else if (arg === "--season" && args[i + 1]) seasonId = args[++i];
    else if (arg === "--plan" && args[i + 1]) planFile = args[++i];
    else if (arg === "--apply" && mode === "preview") mode = "apply";
    else if (arg === "--pull" && mode === "preview") mode = "pull";
    else throw new Error(USAGE);
  }
  skiResortIdSchema.parse(resortId);
  liftTicketSeasonIdSchema.parse(seasonId);
  planFile ||= path.resolve(
    "src/private/data/resorts-temporary/tmp/lift-ticket-publish",
    `${resortId}-${seasonId}.plan.json`,
  );

  const baseUrl = normalizeInternalDataApiBaseUrl(
    process.env.DATA_API_BASE_URL?.trim() ?? "",
  );
  const token = process.env.INTERNAL_DATA_API_ADMIN_TOKEN?.trim();
  if (!token)
    throw new Error(
      "INTERNAL_DATA_API_ADMIN_TOKENを.env.localに設定してください。",
    );
  const request = (suffix: string, init: RequestInit = {}) =>
    fetch(`${baseUrl}${suffix}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  const failed = async (response: Response) => {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.error?.message === "string" ? `\n${body.error.message}` : "";
    return new Error(
      `本番APIがHTTP ${response.status}を返しました。${message}`,
    );
  };

  // 本番DBの内容のローカルバックアップ。本番へ上げるのはこのファイルだけ。
  const file = path.resolve(
    "src/private/data/lift-ticket",
    resortId,
    `${seasonId}.json`,
  );
  const label = `${resortId} ${seasonId}`;
  const fetchRemote = async () => {
    const response = await request(
      `${API_PATH}?${new URLSearchParams({ resortId, seasonId })}`,
    );
    if (!response.ok) throw await failed(response);
    return liftTicketSeasonGetResponseSchema.parse(await response.json())
      .season;
  };

  if (mode === "pull") {
    const remote = await fetchRemote();
    if (!remote) {
      console.log(`${label}: 本番にはまだありません。`);
      return;
    }
    const content = serializeLiftTicket(remote.data);
    const local = await fs.readFile(file, "utf8").catch(error => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (local === content) {
      console.log(`${label}: ローカルと本番は同じです。`);
      return;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
    console.log(
      `${label}: 本番の内容（version ${remote.version}）を ${path.relative(process.cwd(), file)} へ書き込みました。git diffで変更点を確認してください。`,
    );
    return;
  }

  if ((await fs.stat(file)).size > LIFT_TICKET_MAX_CONTENT_BYTES)
    throw new Error("JSONは8 MiB以内にしてください。");
  const data = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(await fs.readFile(file, "utf8")));
  // 本番と同じ書式で比較・送信する（pullで戻したときに差分が出ない）。
  const content = serializeLiftTicket(data);
  const contentHash = hashContent(content);

  if (mode === "apply") {
    const plan = planSchema.parse(
      JSON.parse(await fs.readFile(planFile, "utf8")),
    );
    if (
      plan.baseUrl !== baseUrl ||
      plan.resortId !== resortId ||
      plan.seasonId !== seasonId ||
      plan.contentHash !== contentHash
    )
      throw new Error(
        "接続先またはJSONがプレビュー時から変わっています。プレビューをやり直してください。",
      );
    const response = await request(API_PATH, {
      method: "PUT",
      body: JSON.stringify({
        resortId,
        seasonId,
        data,
        expectedVersion: plan.expectedVersion,
      }),
    });
    if (response.status === 409)
      throw new Error(
        "確認後に本番が更新されました（管理画面での編集など）。--pullで取り込んでからプレビューをやり直してください。",
      );
    if (!response.ok) throw await failed(response);
    await fs.unlink(planFile);
    console.log(`${label}: 本番DBへ保存しました。`);
    return;
  }

  // Preview: never write to production. Refuse anything the admin screen
  // itself would refuse to save.
  const report = await validateTicketContent(content);
  for (const issue of report.issues)
    console.log(
      `${issue.level.toUpperCase()} [${issue.check}] ${issue.path}: ${issue.message}`,
    );
  if (report.failedToRun) throw new Error(report.failedToRun);
  if (!report.ok)
    throw new Error("検証エラーがあるため本番へは反映できません。");

  const remote = await fetchRemote();
  console.log(`対象: ${label} / 接続先: ${baseUrl}`);
  const remoteContent = remote ? serializeLiftTicket(remote.data) : null;
  if (remoteContent === content) {
    console.log("本番と同じ内容です。反映は不要です。");
    return;
  }
  if (remoteContent === null) {
    console.log("本番には未登録です（新規作成）。");
  } else {
    console.log(`本番の現在の内容（version ${remote?.version}）との差分:`);
    const temporary = await fs.mkdtemp(
      path.join(os.tmpdir(), "lift-ticket-preview-"),
    );
    try {
      const before = path.join(temporary, "production.json");
      const after = path.join(temporary, "local.json");
      await fs.writeFile(before, remoteContent, { mode: 0o600 });
      await fs.writeFile(after, content, { mode: 0o600 });
      const diff = spawnSync(
        "git",
        ["diff", "--no-index", "--no-ext-diff", "--", before, after],
        { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      );
      if (diff.error || (diff.status !== 0 && diff.status !== 1))
        throw new Error("差分を表示できませんでした。");
      process.stdout.write(diff.stdout);
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }

  const stat = await fs.lstat(planFile).catch(error => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (stat && !stat.isFile())
    throw new Error("プランの保存先は通常ファイルを指定してください。");
  if (stat) {
    // Do not overwrite an unrelated file passed accidentally through --plan.
    planSchema.parse(JSON.parse(await fs.readFile(planFile, "utf8")));
    await fs.unlink(planFile);
  }
  await fs.mkdir(path.dirname(planFile), { recursive: true });
  await fs.writeFile(
    planFile,
    `${JSON.stringify({ baseUrl, resortId, seasonId, contentHash, expectedVersion: remote?.version ?? null }, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "まだ本番には保存していません。差分を確認後、同じコマンドに --apply を付けて実行してください。",
  );
}

main().catch(error => {
  console.error(
    error instanceof z.ZodError
      ? error.issues
          .map(issue => `${issue.path.join(".")}: ${issue.message}`)
          .slice(0, 12)
          .join("\n")
      : error instanceof Error
        ? error.message
        : "反映に失敗しました。",
  );
  process.exitCode = 1;
});
