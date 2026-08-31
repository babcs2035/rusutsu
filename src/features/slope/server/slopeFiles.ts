import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  SlopeBeforeGeojson,
  SlopeDetailEntry,
  SlopeSourceKind,
} from "@/features/slope/types";

const DATA_ROOT = path.join(
  process.cwd(),
  "src",
  "private",
  "data",
  "resorts-temporary",
);

const RESORT_ID_PATTERN = /^[a-z0-9-]+$/;

export const isValidResortId = (resortId: string): boolean =>
  RESORT_ID_PATTERN.test(resortId);

const sourceDirectory = (sourceKind: SlopeSourceKind): string => {
  if (sourceKind === "curated") return "slope_before";
  if (sourceKind === "osm") return "slope_before_osm";
  throw new Error("保存元データの種類が不正です。");
};

const slopeBeforePath = (
  resortId: string,
  sourceKind: SlopeSourceKind,
): string =>
  path.join(DATA_ROOT, sourceDirectory(sourceKind), `${resortId}.geojson`);

const slopeDetailPath = (resortId: string): string =>
  path.join(DATA_ROOT, "slope_detail", `${resortId}.json`);

export const hashContent = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

export async function listSlopeBeforeResortIds(
  sourceKind: SlopeSourceKind = "curated",
): Promise<string[]> {
  try {
    const directory = path.join(DATA_ROOT, sourceDirectory(sourceKind));
    const files = (await fs.readdir(directory)).filter(file =>
      file.endsWith(".geojson"),
    );
    const entries = await Promise.all(
      files.map(async file => {
        try {
          const parsed = parseSlopeBeforeGeojson(
            await fs.readFile(path.join(directory, file), "utf8"),
          );
          return (parsed?.features.length ?? 0) > 0
            ? file.replace(/\.geojson$/, "")
            : null;
        } catch {
          return null;
        }
      }),
    );
    return entries.filter((id): id is string => id !== null);
  } catch {
    return [];
  }
}

export async function readSlopeBeforeRaw(
  resortId: string,
  sourceKind: SlopeSourceKind = "curated",
): Promise<string | null> {
  if (!isValidResortId(resortId)) return null;
  try {
    return await fs.readFile(slopeBeforePath(resortId, sourceKind), "utf-8");
  } catch {
    return null;
  }
}

export function parseSlopeBeforeGeojson(
  raw: string,
): SlopeBeforeGeojson | null {
  try {
    const parsed = JSON.parse(raw) as SlopeBeforeGeojson;
    if (
      parsed?.type !== "FeatureCollection" ||
      !Array.isArray(parsed.features)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function readSlopeBeforeGeojson(
  resortId: string,
  sourceKind: SlopeSourceKind = "curated",
): Promise<SlopeBeforeGeojson | null> {
  const raw = await readSlopeBeforeRaw(resortId, sourceKind);
  return raw === null ? null : parseSlopeBeforeGeojson(raw);
}

export async function readSlopeDetailRaw(
  resortId: string,
): Promise<string | null> {
  if (!isValidResortId(resortId)) return null;
  try {
    return await fs.readFile(slopeDetailPath(resortId), "utf-8");
  } catch {
    return null;
  }
}

export function parseSlopeDetailEntries(
  raw: string,
): SlopeDetailEntry[] | null {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SlopeDetailEntry[]) : null;
  } catch {
    return null;
  }
}

export async function readSlopeDetailEntries(
  resortId: string,
): Promise<SlopeDetailEntry[] | null> {
  const raw = await readSlopeDetailRaw(resortId);
  return raw === null ? null : parseSlopeDetailEntries(raw);
}

export async function writeSlopeBeforeGeojson(
  resortId: string,
  geojson: SlopeBeforeGeojson,
  sourceKind: SlopeSourceKind = "curated",
): Promise<void> {
  if (!isValidResortId(resortId)) {
    throw new Error(`不正なスキー場IDです: ${resortId}`);
  }
  const outputPath = slopeBeforePath(resortId, sourceKind);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(geojson, null, 2)}\n`);
}
