import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  LiftBeforeGeojson,
  LiftDetailEntry,
} from "@/features/lift-edit/types";

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

const liftBeforePath = (resortId: string): string =>
  path.join(DATA_ROOT, "lift_before", `${resortId}.geojson`);

export async function listLiftBeforeResortIds(): Promise<string[]> {
  try {
    const files = await fs.readdir(path.join(DATA_ROOT, "lift_before"));
    return files
      .filter(file => file.endsWith(".geojson"))
      .map(file => file.replace(/\.geojson$/, ""));
  } catch {
    return [];
  }
}

export async function readLiftBeforeRaw(
  resortId: string,
): Promise<string | null> {
  if (!isValidResortId(resortId)) return null;
  try {
    return await fs.readFile(liftBeforePath(resortId), "utf-8");
  } catch {
    return null;
  }
}

export const hashContent = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

export function parseLiftBeforeGeojson(raw: string): LiftBeforeGeojson | null {
  try {
    const parsed = JSON.parse(raw) as LiftBeforeGeojson;
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

export async function readLiftDetailEntries(
  resortId: string,
): Promise<LiftDetailEntry[] | null> {
  if (!isValidResortId(resortId)) return null;
  try {
    const raw = await fs.readFile(
      path.join(DATA_ROOT, "lift_detail", `${resortId}.json`),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LiftDetailEntry[]) : null;
  } catch {
    return null;
  }
}

// リフトデータの人手確認状況。スキー場ID → 確認日時（ISO 文字列）
const CONFIRMED_PATH = path.join(DATA_ROOT, "lift_confirmed.json");

export async function readLiftConfirmedMap(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(CONFIRMED_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
}

export async function writeLiftConfirmed(
  resortId: string,
  confirmed: boolean,
): Promise<Record<string, string>> {
  if (!isValidResortId(resortId)) {
    throw new Error(`不正なスキー場IDです: ${resortId}`);
  }
  const map = await readLiftConfirmedMap();
  if (confirmed) {
    map[resortId] = new Date().toISOString();
  } else {
    delete map[resortId];
  }
  const sorted = Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b)),
  );
  await fs.writeFile(CONFIRMED_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  return sorted;
}

// 既存の lift_before と同じ 1 行の compact JSON で書き込む
export async function writeLiftBeforeGeojson(
  resortId: string,
  geojson: LiftBeforeGeojson,
): Promise<void> {
  if (!isValidResortId(resortId)) {
    throw new Error(`不正なスキー場IDです: ${resortId}`);
  }
  await fs.writeFile(liftBeforePath(resortId), JSON.stringify(geojson));
}
