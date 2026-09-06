import { createHash } from "node:crypto";
import type {
  SlopeBeforeGeojson,
  SlopeDetailEntry,
  SlopeSourceKind,
} from "@/features/slope/types";
import type { DataDocument } from "@/server/data-documents/contract";

const TEMPORARY_DATA_PREFIX = "resorts-temporary";
const RESORT_ID_PATTERN = /^[a-z0-9-]+$/;
const LIST_READ_CONCURRENCY = 8;

const loadDataDocumentClient = () => import("@/server/data-documents/client");

export const isValidResortId = (resortId: string): boolean =>
  RESORT_ID_PATTERN.test(resortId);

const sourceDirectory = (sourceKind: SlopeSourceKind): string => {
  if (sourceKind === "curated") return "slope_before";
  if (sourceKind === "osm") return "slope_before_osm";
  throw new Error("保存元データの種類が不正です。");
};

export const slopeBeforeDocumentKey = (
  resortId: string,
  sourceKind: SlopeSourceKind,
): string =>
  `${TEMPORARY_DATA_PREFIX}/${sourceDirectory(sourceKind)}/${resortId}.geojson`;

export const slopeDetailDocumentKey = (resortId: string): string =>
  `${TEMPORARY_DATA_PREFIX}/slope_detail/${resortId}.json`;

export const osmSlope10mDocumentKey = (resortId: string): string =>
  `${TEMPORARY_DATA_PREFIX}/slope_10m_osm/${resortId}.geojson`;

export const slope10mDocumentKey = (resortId: string): string =>
  `${TEMPORARY_DATA_PREFIX}/slope_10m/${resortId}.geojson`;

export const hashContent = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

const resortIdFromSlopeBeforeKey = (
  key: string,
  sourceKind: SlopeSourceKind,
): string | null => {
  const prefix = `${TEMPORARY_DATA_PREFIX}/${sourceDirectory(sourceKind)}/`;
  if (!key.startsWith(prefix) || !key.endsWith(".geojson")) return null;
  const resortId = key.slice(prefix.length, -".geojson".length);
  return isValidResortId(resortId) ? resortId : null;
};

const mapWithConcurrency = async <T, U>(
  values: readonly T[],
  mapper: (value: T) => Promise<U>,
): Promise<U[]> => {
  const output = new Array<U>(values.length);
  let nextIndex = 0;
  const runNext = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) output[index] = await mapper(value);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(LIST_READ_CONCURRENCY, values.length) },
      runNext,
    ),
  );
  return output;
};

export async function listSlopeBeforeResortIds(
  sourceKind: SlopeSourceKind = "curated",
): Promise<string[]> {
  const prefix = `${TEMPORARY_DATA_PREFIX}/${sourceDirectory(sourceKind)}/`;
  const { getDataDocument, listDataDocuments } = await loadDataDocumentClient();
  const summaries = await listDataDocuments(prefix);
  const candidates = summaries.flatMap(summary => {
    const resortId = resortIdFromSlopeBeforeKey(summary.key, sourceKind);
    return resortId === null ? [] : [{ resortId, key: summary.key }];
  });
  const entries = await mapWithConcurrency(candidates, async candidate => {
    const document = await getDataDocument(candidate.key);
    if (!document) return null;
    const parsed = parseSlopeBeforeGeojson(document.content);
    return (parsed?.features.length ?? 0) > 0 ? candidate.resortId : null;
  });
  return entries.filter((id): id is string => id !== null);
}

export async function readSlopeBeforeDocument(
  resortId: string,
  sourceKind: SlopeSourceKind = "curated",
): Promise<DataDocument | null> {
  if (!isValidResortId(resortId)) return null;
  const { getDataDocument } = await loadDataDocumentClient();
  return getDataDocument(slopeBeforeDocumentKey(resortId, sourceKind));
}

export async function readSlopeBeforeRaw(
  resortId: string,
  sourceKind: SlopeSourceKind = "curated",
): Promise<string | null> {
  return (await readSlopeBeforeDocument(resortId, sourceKind))?.content ?? null;
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

export async function readSlopeDetailDocument(
  resortId: string,
): Promise<DataDocument | null> {
  if (!isValidResortId(resortId)) return null;
  const { getDataDocument } = await loadDataDocumentClient();
  return getDataDocument(slopeDetailDocumentKey(resortId));
}

export async function readSlopeDetailRaw(
  resortId: string,
): Promise<string | null> {
  return (await readSlopeDetailDocument(resortId))?.content ?? null;
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

export const serializeSlopeGeojson = (geojson: SlopeBeforeGeojson): string =>
  `${JSON.stringify(geojson, null, 2)}\n`;

export async function writeSlopeBeforeGeojson(
  resortId: string,
  geojson: SlopeBeforeGeojson,
  expectedHash: string | null,
  sourceKind: SlopeSourceKind = "curated",
): Promise<DataDocument> {
  if (!isValidResortId(resortId)) {
    throw new Error(`不正なスキー場IDです: ${resortId}`);
  }
  const { writeDataDocuments } = await loadDataDocumentClient();
  const [written] = await writeDataDocuments([
    {
      key: slopeBeforeDocumentKey(resortId, sourceKind),
      content: serializeSlopeGeojson(geojson),
      mediaType: "application/geo+json",
      expectedHash,
    },
  ]);
  if (!written) throw new Error("slope_before の保存結果がありません。");
  return written;
}
