/**
 * resorts/*.xlsx の基本情報を *_before へ一度だけ取り込み、既存の
 * slope_10m / lift_20m にも *_before の properties を同期する。
 *
 * 使い方:
 *   node --import tsx scripts/mergeResortSheetsIntoGeojson.ts --dry-run
 *   node --import tsx scripts/mergeResortSheetsIntoGeojson.ts
 *   node --import tsx scripts/mergeResortSheetsIntoGeojson.ts gala-yuzawa
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type GeoJsonFeatureCollection,
  mergeSheetRowsIntoBefore,
  type ResortSheetKind,
  syncBeforePropertiesToMeasured,
} from "./lib/resortSheetGeojsonMerge";
import { readXlsxSheets } from "./lib/xlsxReader";

const DATA_ROOT = path.join(process.cwd(), "src/private/data");
const SHEETS_ROOT = path.join(DATA_ROOT, "resorts");
const TEMPORARY_ROOT = path.join(DATA_ROOT, "resorts-temporary");

const SPECS = [
  {
    kind: "course" as ResortSheetKind,
    sheetName: "Courses",
    beforeDirectory: "slope_before",
    measuredDirectory: "slope_10m",
  },
  {
    kind: "lift" as ResortSheetKind,
    sheetName: "Lifts",
    beforeDirectory: "lift_before",
    measuredDirectory: "lift_20m",
  },
] as const;

type KindSummary = {
  namedSheetRows: number;
  eligibleSheetRows: number;
  skippedSheetRows: number;
  rowsWithoutBefore: number;
  matchedSheetRows: number;
  matchedBeforeFeatures: number;
  changedBeforeFeatures: number;
  changedBeforeFiles: number;
  matchedMeasuredFeatures: number;
  changedMeasuredFeatures: number;
  changedMeasuredFiles: number;
  unmatchedSheetRows: number;
  unmatchedMeasuredFeatures: number;
};

const createKindSummary = (): KindSummary => ({
  namedSheetRows: 0,
  eligibleSheetRows: 0,
  skippedSheetRows: 0,
  rowsWithoutBefore: 0,
  matchedSheetRows: 0,
  matchedBeforeFeatures: 0,
  changedBeforeFeatures: 0,
  changedBeforeFiles: 0,
  matchedMeasuredFeatures: 0,
  changedMeasuredFeatures: 0,
  changedMeasuredFiles: 0,
  unmatchedSheetRows: 0,
  unmatchedMeasuredFeatures: 0,
});

const parseCollection = (
  value: unknown,
  filePath: string,
): GeoJsonFeatureCollection => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as { type?: unknown }).type !== "FeatureCollection" ||
    !Array.isArray((value as { features?: unknown }).features)
  ) {
    throw new Error(`FeatureCollection ではありません: ${filePath}`);
  }
  return value as GeoJsonFeatureCollection;
};

const readCollection = async (
  filePath: string,
): Promise<GeoJsonFeatureCollection> =>
  parseCollection(JSON.parse(await fs.readFile(filePath, "utf8")), filePath);

const readCollectionIfExists = async (
  filePath: string,
): Promise<GeoJsonFeatureCollection | null> => {
  try {
    return await readCollection(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const writeCollection = async (
  filePath: string,
  collection: GeoJsonFeatureCollection,
): Promise<void> => {
  await fs.writeFile(filePath, `${JSON.stringify(collection, null, 2)}\n`);
};

const listGeojsonIds = async (directory: string): Promise<string[]> => {
  try {
    return (await fs.readdir(path.join(TEMPORARY_ROOT, directory)))
      .filter(fileName => fileName.endsWith(".geojson"))
      .map(fileName => fileName.replace(/\.geojson$/u, ""))
      .sort();
  } catch {
    return [];
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: node --import tsx scripts/mergeResortSheetsIntoGeojson.ts [--dry-run] [resort-id ...]",
    );
    return;
  }
  const dryRun = args.includes("--dry-run");
  const targets = new Set(args.filter(arg => !arg.startsWith("--")));
  const allSheetFiles = (await fs.readdir(SHEETS_ROOT))
    .filter(fileName => fileName.endsWith(".xlsx"))
    .sort();
  const sheetFiles =
    targets.size === 0
      ? allSheetFiles
      : allSheetFiles.filter(fileName =>
          targets.has(fileName.replace(/\.xlsx$/u, "")),
        );

  const summaries: Record<ResortSheetKind, KindSummary> = {
    course: createKindSummary(),
    lift: createKindSummary(),
  };
  const beforeCache = new Map<string, GeoJsonFeatureCollection>();
  const unmatchedSheetExamples: string[] = [];
  const noBeforeExamples: string[] = [];
  const unmatchedMeasuredExamples: string[] = [];
  const errors: string[] = [];

  // 1. Excel の適格行を *_before へ補完する。
  for (const sheetFile of sheetFiles) {
    const resortId = sheetFile.replace(/\.xlsx$/u, "");
    try {
      const sheets = readXlsxSheets(
        await fs.readFile(path.join(SHEETS_ROOT, sheetFile)),
      );
      for (const spec of SPECS) {
        const rows = sheets.get(spec.sheetName) ?? [];
        const namedRows = rows.filter(
          row => (row.name ?? "").trim().length > 0,
        );
        const summary = summaries[spec.kind];
        summary.namedSheetRows += namedRows.length;

        const beforePath = path.join(
          TEMPORARY_ROOT,
          spec.beforeDirectory,
          `${resortId}.geojson`,
        );
        const before = await readCollectionIfExists(beforePath);
        if (!before) {
          const eligibleRows = namedRows.filter(
            row =>
              (row.piste ?? "").trim().length > 0 ||
              (row.searchWord ?? "").trim().length > 0,
          ).length;
          summary.eligibleSheetRows += eligibleRows;
          summary.skippedSheetRows += namedRows.length - eligibleRows;
          summary.rowsWithoutBefore += eligibleRows;
          if (eligibleRows > 0 && noBeforeExamples.length < 30) {
            noBeforeExamples.push(
              `${resortId}:${spec.kind} (${eligibleRows} rows)`,
            );
          }
          continue;
        }

        const result = mergeSheetRowsIntoBefore(before, rows, spec.kind);
        summary.eligibleSheetRows += result.eligibleRows;
        summary.skippedSheetRows += result.skippedRows;
        summary.matchedSheetRows += result.matchedRows;
        summary.matchedBeforeFeatures += result.matchedFeatures;
        summary.changedBeforeFeatures += result.changedFeatures;
        summary.unmatchedSheetRows += result.unmatchedRowNames.length;
        for (const name of result.unmatchedRowNames) {
          if (unmatchedSheetExamples.length >= 30) break;
          unmatchedSheetExamples.push(`${resortId}:${spec.kind}:${name}`);
        }
        beforeCache.set(
          `${spec.beforeDirectory}/${resortId}`,
          result.collection,
        );

        if (result.changedFeatures > 0) {
          summary.changedBeforeFiles += 1;
          if (!dryRun) await writeCollection(beforePath, result.collection);
        }
      }
    } catch (error) {
      errors.push(`${sheetFile}: ${String(error)}`);
    }
  }

  // 2. 全ての *_before を、対応する既存 *_10m / *_20m へ同期する。
  for (const spec of SPECS) {
    const beforeIds = await listGeojsonIds(spec.beforeDirectory);
    const targetIds =
      targets.size === 0
        ? beforeIds
        : beforeIds.filter(resortId => targets.has(resortId));
    for (const resortId of targetIds) {
      const beforePath = path.join(
        TEMPORARY_ROOT,
        spec.beforeDirectory,
        `${resortId}.geojson`,
      );
      const measuredPath = path.join(
        TEMPORARY_ROOT,
        spec.measuredDirectory,
        `${resortId}.geojson`,
      );
      try {
        const measured = await readCollectionIfExists(measuredPath);
        if (!measured) continue;
        const before =
          beforeCache.get(`${spec.beforeDirectory}/${resortId}`) ??
          (await readCollection(beforePath));
        const result = syncBeforePropertiesToMeasured(
          measured,
          before,
          spec.kind,
        );
        const summary = summaries[spec.kind];
        summary.matchedMeasuredFeatures += result.matchedFeatures;
        summary.changedMeasuredFeatures += result.changedFeatures;
        summary.unmatchedMeasuredFeatures +=
          result.unmatchedFeatureNames.length;
        for (const name of result.unmatchedFeatureNames) {
          if (unmatchedMeasuredExamples.length >= 30) break;
          unmatchedMeasuredExamples.push(`${resortId}:${spec.kind}:${name}`);
        }
        if (result.changedFeatures > 0) {
          summary.changedMeasuredFiles += 1;
          if (!dryRun) await writeCollection(measuredPath, result.collection);
        }
      } catch (error) {
        errors.push(`${resortId}:${spec.measuredDirectory}: ${String(error)}`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "write",
        workbookFiles: sheetFiles.length,
        targets: targets.size === 0 ? "all" : [...targets].sort(),
        summaries,
        unmatchedSheetExamples,
        noBeforeExamples,
        unmatchedMeasuredExamples,
        errors,
      },
      null,
      2,
    ),
  );
  if (errors.length > 0) process.exitCode = 1;
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
