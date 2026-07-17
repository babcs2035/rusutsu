import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  SlopeBeforeGeojson,
  SlopeDetailEntry,
} from "@/features/slope-edit/types";

// slope_before / slope_detail は読み取り専用。このモジュールから書き込みは行わない。
const DATA_ROOT = path.join(
  process.cwd(),
  "src",
  "private",
  "data",
  "resorts-temporary",
);

const RESORT_ID_PATTERN = /^[a-z0-9-]+$/;

const isValidResortId = (resortId: string): boolean =>
  RESORT_ID_PATTERN.test(resortId);

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

export async function readSlopeBeforeGeojson(
  resortId: string,
): Promise<SlopeBeforeGeojson | null> {
  if (!isValidResortId(resortId)) return null;
  try {
    const raw = await fs.readFile(
      path.join(DATA_ROOT, "slope_before", `${resortId}.geojson`),
      "utf-8",
    );
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

export async function readSlopeDetailEntries(
  resortId: string,
): Promise<SlopeDetailEntry[] | null> {
  if (!isValidResortId(resortId)) return null;
  try {
    const raw = await fs.readFile(
      path.join(DATA_ROOT, "slope_detail", `${resortId}.json`),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SlopeDetailEntry[]) : null;
  } catch {
    return null;
  }
}
