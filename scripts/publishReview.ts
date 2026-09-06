import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import {
  prepareReviewPublication,
  reviewContentHash,
} from "../src/features/review/server/publication";
import { reviewPublicationSchema } from "../src/features/review/server/publicationContract";
import { normalizeInternalDataApiBaseUrl } from "../src/lib/internalDataApiBaseUrl";
import { dataDocumentGetResponseSchema } from "../src/server/data-documents/contract";
import { skiResortIdSchema } from "../src/server/ski-resorts/adminContract";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });
const planSchema = z.strictObject({
  baseUrl: z.string(),
  sourceHash: z.string(),
  publication: reviewPublicationSchema,
});

async function main() {
  let resortId = "";
  let apply = false;
  let planFile = ".review-publication-plan.json";
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") continue;
    if (arg === "--resort" && args[i + 1]) resortId = args[++i];
    else if (arg === "--plan" && args[i + 1]) planFile = args[++i];
    else if (arg === "--apply") apply = true;
    else
      throw new Error(
        "Usage: mise run reviews:publish -- --resort <id> [--plan <file>] [--apply]",
      );
  }
  skiResortIdSchema.parse(resortId);
  const baseUrl = normalizeInternalDataApiBaseUrl(
    process.env.DATA_API_BASE_URL?.trim() ?? "",
  );
  const token = process.env.INTERNAL_DATA_API_ADMIN_TOKEN?.trim();
  if (!token)
    throw new Error(
      "INTERNAL_DATA_API_ADMIN_TOKENを.env.localに設定してください。",
    );
  const request = async (suffix: string, init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${suffix}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      if (response.status === 409)
        throw new Error(
          "確認後に本番が更新されました。再度プレビューを実行してください。",
        );
      throw new Error(
        `本番APIがHTTP ${response.status}を返しました。設定・スキー場ID・JSONの形式を確認してください。`,
      );
    }
    return response;
  };
  const readFile = async (kind: string) => {
    const file = path.resolve(
      "src/private/data/reviews",
      resortId,
      `${kind}.json`,
    );
    if ((await fs.stat(file)).size > 2 * 1024 * 1024)
      throw new Error("各JSONは2 MiB以内にしてください。");
    return JSON.parse(await fs.readFile(file, "utf8"));
  };
  const content = {
    resortId,
    detail: await readFile("detail"),
    article: await readFile("article"),
  };
  const sourceHash = reviewContentHash(content);
  if (apply) {
    const plan = planSchema.parse(
      JSON.parse(await fs.readFile(planFile, "utf8")),
    );
    if (
      plan.baseUrl !== baseUrl ||
      plan.sourceHash !== sourceHash ||
      reviewContentHash(plan.publication.content) !== sourceHash
    )
      throw new Error(
        "接続先またはJSONがプレビュー時から変わっています。プレビューをやり直してください。",
      );
    await request("/api/internal/v1/review-publications", {
      method: "PUT",
      body: JSON.stringify(plan.publication),
    });
    await fs.unlink(planFile);
    console.log(`${resortId}: detail.jsonとarticle.jsonを本番へ保存しました。`);
    return;
  }
  const preview = await prepareReviewPublication(
    {
      async getDataDocument(key) {
        return dataDocumentGetResponseSchema.parse(
          await (
            await request(
              `/api/internal/v1/data-documents?${new URLSearchParams({ key })}`,
            )
          ).json(),
        ).document;
      },
      async listDataDocuments() {
        throw new Error("Not used");
      },
      async writeDataDocuments() {
        throw new Error("Preview never writes");
      },
    },
    content,
  );
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "review-preview-"));
  try {
    console.log(`対象: ${resortId} / 接続先: ${baseUrl}`);
    for (const file of preview.files) {
      console.log(`${file.kind}.json: ${file.status}`);
      const before = path.join(temporary, `${file.kind}-before.json`);
      const after = path.join(temporary, `${file.kind}-after.json`);
      await fs.writeFile(before, file.previousContent ?? "", { mode: 0o600 });
      await fs.writeFile(after, file.content, { mode: 0o600 });
      const diff = spawnSync(
        "git",
        ["diff", "--no-index", "--no-ext-diff", "--", before, after],
        { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      );
      if (diff.error || (diff.status !== 0 && diff.status !== 1))
        throw new Error("差分を表示できませんでした。");
      process.stdout.write(diff.stdout);
    }
    // Refuse symlinks and overwrite only an ordinary previous plan.
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
    await fs.writeFile(
      planFile,
      `${JSON.stringify({ baseUrl, sourceHash, publication: preview.publication }, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      "まだ本番には保存していません。差分を確認後、同じコマンドに --apply を付けて実行してください。",
    );
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
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
