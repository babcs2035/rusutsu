/** xlsx の同名詳細を正本APIの空欄へ補完する。既定は読み取りのみ。
 * mise exec -- node --import tsx scripts/syncResortSheetsToApi.ts [--apply] [resort-id ...]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { normalizeInternalDataApiBaseUrl } from "../src/lib/internalDataApiBaseUrl";
import {
  dataDocumentBatchWriteSchema,
  dataDocumentGetResponseSchema,
  dataDocumentListResponseSchema,
} from "../src/server/data-documents/contract";
import {
  type GeoJsonFeatureCollection,
  mergeSheetRowsIntoBefore,
  type ResortSheetKind,
} from "./lib/resortSheetGeojsonMerge";
import { readXlsxSheets } from "./lib/xlsxReader";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

async function main() {
  const args = process.argv.slice(2);
  if (
    args.some(
      arg => arg.startsWith("--") && arg !== "--apply" && arg !== "--dry-run",
    )
  )
    throw new Error(
      "Usage: syncResortSheetsToApi.ts [--dry-run | --apply] [resort-id ...]",
    );
  if (args.includes("--apply") && args.includes("--dry-run"))
    throw new Error("Choose --apply or --dry-run");
  const apply = args.includes("--apply");
  const targets = new Set(args.filter(arg => !arg.startsWith("--")));
  const baseUrl = normalizeInternalDataApiBaseUrl(
    process.env.DATA_API_BASE_URL?.trim() ?? "",
  );
  const token = process.env.INTERNAL_DATA_API_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("INTERNAL_DATA_API_ADMIN_TOKEN is required");
  const request = async (query: string, init: RequestInit = {}) => {
    const response = await fetch(
      `${baseUrl}/api/internal/v1/data-documents${query}`,
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
  const root = "src/private/data";
  const sheetsRoot = path.join(root, "resorts");
  const reportRoot = path.join(
    root,
    "resorts-temporary/tmp/resort-sheet-sync",
    new Date().toISOString().replace(/[:.]/gu, "-"),
  );
  await fs.mkdir(reportRoot, { recursive: true });
  const folders = [
    "lift_before",
    "lift_20m",
    "slope_before",
    "slope_10m",
    "slope_before_osm",
    "slope_10m_osm",
  ];
  const listed = await Promise.all(
    folders.map(async folder => {
      const query = new URLSearchParams({
        prefix: `resorts-temporary/${folder}/`,
      });
      return dataDocumentListResponseSchema.parse(await request(`?${query}`))
        .documents;
    }),
  );
  const availableKeys = new Set(listed.flat().map(document => document.key));
  const files = (await fs.readdir(sheetsRoot))
    .filter(
      file =>
        file.endsWith(".xlsx") &&
        (!targets.size || targets.has(file.slice(0, -5))),
    )
    .sort();
  const report: {
    key: string;
    matched: number;
    changed: number;
    unmatched: string[];
    applied: boolean;
  }[] = [];
  try {
    for (const file of files) {
      const resortId = file.slice(0, -5);
      const sheets = readXlsxSheets(
        await fs.readFile(path.join(sheetsRoot, file)),
      );
      // 同一スキー場の読み取りは並列化し、書き込みは一括で競合確認する。
      const results = await Promise.all(
        folders.map(async folder => {
          const key = `resorts-temporary/${folder}/${resortId}.geojson`;
          if (!availableKeys.has(key)) return null;
          const kind: ResortSheetKind = folder.startsWith("lift")
            ? "lift"
            : "course";
          const rows = sheets.get(kind === "lift" ? "Lifts" : "Courses") ?? [];
          if (!rows.length) return null;
          const document = dataDocumentGetResponseSchema.parse(
            await request(`?${new URLSearchParams({ key })}`),
          ).document;
          if (!document) return null;
          const collection = JSON.parse(
            document.content,
          ) as GeoJsonFeatureCollection;
          if (
            collection.type !== "FeatureCollection" ||
            !Array.isArray(collection.features)
          )
            throw new Error(`Invalid collection: ${key}`);
          const merged = mergeSheetRowsIntoBefore(collection, rows, kind);
          return { document, merged };
        }),
      );
      const writes = [];
      const changedRecords = [];
      for (const result of results) {
        if (!result) continue;
        const { document, merged } = result;
        const record = {
          key: document.key,
          matched: merged.matchedFeatures,
          changed: merged.changedFeatures,
          unmatched: merged.unmatchedRowNames,
          applied: false,
        };
        report.push(record);
        if (!merged.changedFeatures) continue;
        changedRecords.push(record);
        const content = JSON.stringify(merged.collection);
        // 元データと差分を確認できるよう、API更新前に保存する。
        const backup = path.join(reportRoot, document.key);
        await fs.mkdir(path.dirname(backup), { recursive: true });
        await fs.writeFile(`${backup}.before.json`, document.content);
        await fs.writeFile(`${backup}.after.json`, content);
        writes.push({
          key: document.key,
          content,
          mediaType: "application/geo+json",
          expectedHash: document.hash,
        });
      }
      if (apply && writes.length) {
        await request("", {
          method: "PUT",
          body: JSON.stringify(
            dataDocumentBatchWriteSchema.parse({ documents: writes }),
          ),
        });
        for (const record of changedRecords) record.applied = true;
        for (const write of writes) {
          const saved = dataDocumentGetResponseSchema.parse(
            await request(`?${new URLSearchParams({ key: write.key })}`),
          ).document;
          if (saved?.content !== write.content)
            throw new Error(`Read-back mismatch: ${write.key}`);
        }
      }
      if (changedRecords.length)
        console.log(
          `${resortId}: ${changedRecords.map(record => `${record.key.split("/")[1]}=${record.changed}`).join(", ")}${apply ? " applied and verified" : " pending"}`,
        );
    }
  } finally {
    await fs.writeFile(
      path.join(reportRoot, "report.json"),
      JSON.stringify({ apply, report }, null, 2),
    );
    console.log(
      JSON.stringify({
        reportRoot,
        changedDocuments: report.filter(row => row.changed).length,
        changedFeatures: report.reduce((sum, row) => sum + row.changed, 0),
        appliedDocuments: report.filter(row => row.applied).length,
      }),
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
