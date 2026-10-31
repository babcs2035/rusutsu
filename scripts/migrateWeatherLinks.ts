import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { prepareWeatherLinksMigration } from "../src/features/weather/weatherLinksMigration";
import { normalizeInternalDataApiBaseUrl } from "../src/lib/internalDataApiBaseUrl";
import {
  dataDocumentBatchWriteSchema,
  dataDocumentGetResponseSchema,
  dataDocumentWriteResponseSchema,
} from "../src/server/data-documents/contract";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
const key = "SkiResortLinks.json";
const sourceFile = "src/private/data/SkiResortWeatherIds.json";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const output = path.resolve(
  "src/private/data/resorts-temporary/tmp/weather-links-db",
);

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== "--");
  if (args.some(arg => arg !== "--apply"))
    throw new Error(
      "Usage: node --import tsx scripts/migrateWeatherLinks.ts [--apply]",
    );
  const apply = args.includes("--apply");
  const base = normalizeInternalDataApiBaseUrl(
    process.env.DATA_API_BASE_URL?.trim() ?? "",
  );
  const token = process.env.INTERNAL_DATA_API_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("INTERNAL_DATA_API_ADMIN_TOKEN is required");
  const request = async (suffix: string, init: RequestInit = {}) => {
    const response = await fetch(
      `${base}/api/internal/v1/data-documents${suffix}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw new Error(`DataDocument API: HTTP ${response.status}`);
    return response.json();
  };
  const read = async () =>
    dataDocumentGetResponseSchema.parse(
      await request(`?${new URLSearchParams({ key })}`),
    ).document;
  const current = await read();
  if (current?.source !== "database")
    throw new Error("Production SkiResortLinks document is required");
  if (hash(current.content) !== current.hash)
    throw new Error("Stored links content/hash mismatch");
  const source = await readFile(sourceFile, "utf8");
  const preview = prepareWeatherLinksMigration(
    current.content,
    JSON.parse(source),
  );
  const summary = {
    base,
    sourceHash: hash(source),
    expectedHash: current.hash,
    nextHash: hash(preview.content),
    resorts: preview.resorts,
    addedFields: preview.addedFields,
    addedLinks: preview.addedLinks,
    preservedFields: preview.preservedFields,
  };
  const planFile = path.join(output, "plan.json");
  await mkdir(output, { recursive: true });
  if (!apply) {
    await writeFile(
      path.join(output, `${current.hash}-before.json`),
      JSON.stringify(current, null, 2),
      { mode: 0o600 },
    );
    await writeFile(
      path.join(output, `${summary.nextHash}-after.json`),
      preview.content,
      { mode: 0o600 },
    );
    await writeFile(planFile, JSON.stringify(summary, null, 2), {
      mode: 0o600,
    });
    console.log(JSON.stringify({ status: "preview", ...summary, planFile }));
    return;
  }
  if (!preview.addedFields) {
    console.log(JSON.stringify({ status: "already_migrated", ...summary }));
    return;
  }
  const plan = JSON.parse(await readFile(planFile, "utf8"));
  if (JSON.stringify(plan) !== JSON.stringify(summary))
    throw new Error("Source or production data changed; rerun preview");
  const payload = dataDocumentBatchWriteSchema.parse({
    documents: [
      {
        key,
        content: preview.content,
        mediaType: "application/json",
        expectedHash: current.hash,
      },
    ],
  });
  const written = dataDocumentWriteResponseSchema.parse(
    await request("", { method: "PUT", body: JSON.stringify(payload) }),
  ).documents[0];
  const verified = await read();
  if (
    written?.hash !== summary.nextHash ||
    verified?.hash !== summary.nextHash ||
    verified?.content !== preview.content
  )
    throw new Error(
      "Weather links write verification failed; inspect backup before retrying",
    );
  console.log(
    JSON.stringify({
      status: "migrated",
      ...summary,
      version: verified.version,
    }),
  );
}

main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "Weather links migration failed",
  );
  process.exitCode = 1;
});
