import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  SlopeBeforeGeojson,
  SlopeDetailEntry,
} from "@/features/slope-edit/types";

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

const slopeBeforePath = (resortId: string): string =>
  path.join(DATA_ROOT, "slope_before", `${resortId}.geojson`);

const slopeDetailPath = (resortId: string): string =>
  path.join(DATA_ROOT, "slope_detail", `${resortId}.json`);

export const hashContent = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

export async function listSlopeBeforeResortIds(): Promise<string[]> {
  try {
    const files = await fs.readdir(path.join(DATA_ROOT, "slope_before"));
    return files
      .filter(file => file.endsWith(".geojson"))
      .map(file => file.replace(/\.geojson$/, ""));
  } catch {
    return [];
  }
}

export async function readSlopeBeforeRaw(
  resortId: string,
): Promise<string | null> {
  if (!isValidResortId(resortId)) return null;
  try {
    return await fs.readFile(slopeBeforePath(resortId), "utf-8");
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
): Promise<SlopeBeforeGeojson | null> {
  const raw = await readSlopeBeforeRaw(resortId);
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
): Promise<void> {
  if (!isValidResortId(resortId)) {
    throw new Error(`不正なスキー場IDです: ${resortId}`);
  }
  await fs.writeFile(
    slopeBeforePath(resortId),
    `${JSON.stringify(geojson, null, 2)}\n`,
  );
}
