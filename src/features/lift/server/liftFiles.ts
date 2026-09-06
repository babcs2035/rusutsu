import { createHash } from "node:crypto";
import type {
  LiftBeforeGeojson,
  LiftDetailEntry,
  ResortLink,
  ResortLinks,
} from "@/features/lift/types";
import {
  type DataDocument,
  DataDocumentConflictError,
} from "@/server/data-documents/contract";

const TEMPORARY_DATA_PREFIX = "resorts-temporary";
const RESORT_ID_PATTERN = /^[a-z0-9-]+$/;
const WRITE_ATTEMPTS = 3;

const loadDataDocumentClient = () => import("@/server/data-documents/client");

export const isValidResortId = (resortId: string): boolean =>
  RESORT_ID_PATTERN.test(resortId);

export const liftBeforeDocumentKey = (resortId: string): string =>
  `${TEMPORARY_DATA_PREFIX}/lift_before/${resortId}.geojson`;

export const liftDetailDocumentKey = (resortId: string): string =>
  `${TEMPORARY_DATA_PREFIX}/lift_detail/${resortId}.json`;

export const lift20mDocumentKey = (resortId: string): string =>
  `${TEMPORARY_DATA_PREFIX}/lift_20m/${resortId}.geojson`;

const LIFT_BEFORE_PREFIX = `${TEMPORARY_DATA_PREFIX}/lift_before/`;
export const LIFT_CONFIRMED_DOCUMENT_KEY = `${TEMPORARY_DATA_PREFIX}/lift_confirmed.json`;
export const SKI_RESORT_LINKS_DOCUMENT_KEY = "SkiResortLinks.json";

const resortIdFromLiftBeforeKey = (key: string): string | null => {
  if (!key.startsWith(LIFT_BEFORE_PREFIX) || !key.endsWith(".geojson")) {
    return null;
  }
  const resortId = key.slice(LIFT_BEFORE_PREFIX.length, -".geojson".length);
  return isValidResortId(resortId) ? resortId : null;
};

export async function listLiftBeforeResortIds(): Promise<string[]> {
  const { listDataDocuments } = await loadDataDocumentClient();
  const documents = await listDataDocuments(LIFT_BEFORE_PREFIX);
  return documents.flatMap(document => {
    const resortId = resortIdFromLiftBeforeKey(document.key);
    return resortId === null ? [] : [resortId];
  });
}

export async function readLiftBeforeDocument(
  resortId: string,
): Promise<DataDocument | null> {
  if (!isValidResortId(resortId)) return null;
  const { getDataDocument } = await loadDataDocumentClient();
  return getDataDocument(liftBeforeDocumentKey(resortId));
}

export async function readLiftBeforeRaw(
  resortId: string,
): Promise<string | null> {
  return (await readLiftBeforeDocument(resortId))?.content ?? null;
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

// lift_before の全頂点の重心をおおよその位置として返す。
// DB に存在しない意図的な仮 ID（例: shiga-kogen-central）を
// スキー場選択の地図・並び替えに使うための座標として利用する。
export async function computeLiftBeforeCentroid(
  resortId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const raw = await readLiftBeforeRaw(resortId);
  if (raw === null) return null;
  const geojson = parseLiftBeforeGeojson(raw);
  if (!geojson) return null;

  let sumLat = 0;
  let sumLng = 0;
  let count = 0;
  for (const feature of geojson.features) {
    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates)) continue;
    for (const point of coordinates as unknown[]) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const lng = Number(point[0]);
      const lat = Number(point[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      sumLng += lng;
      sumLat += lat;
      count += 1;
    }
  }
  if (count === 0) return null;
  return { latitude: sumLat / count, longitude: sumLng / count };
}

export async function readLiftDetailEntries(
  resortId: string,
): Promise<LiftDetailEntry[] | null> {
  if (!isValidResortId(resortId)) return null;
  const { getDataDocument } = await loadDataDocumentClient();
  const document = await getDataDocument(liftDetailDocumentKey(resortId));
  if (!document) return null;
  try {
    const parsed = JSON.parse(document.content);
    return Array.isArray(parsed) ? (parsed as LiftDetailEntry[]) : null;
  } catch {
    return null;
  }
}

const parseLiftConfirmedMap = (raw: string | null): Record<string, string> => {
  if (raw === null) return {};
  try {
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
};

export async function readLiftConfirmedMap(): Promise<Record<string, string>> {
  const { getDataDocument } = await loadDataDocumentClient();
  const document = await getDataDocument(LIFT_CONFIRMED_DOCUMENT_KEY);
  return parseLiftConfirmedMap(document?.content ?? null);
}

export async function writeLiftConfirmed(
  resortId: string,
  confirmed: boolean,
): Promise<Record<string, string>> {
  if (!isValidResortId(resortId)) {
    throw new Error(`不正なスキー場IDです: ${resortId}`);
  }
  const { getDataDocument, writeDataDocuments } =
    await loadDataDocumentClient();

  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
    const current = await getDataDocument(LIFT_CONFIRMED_DOCUMENT_KEY);
    const map = parseLiftConfirmedMap(current?.content ?? null);
    if (confirmed) {
      map[resortId] = new Date().toISOString();
    } else {
      delete map[resortId];
    }
    const sorted = Object.fromEntries(
      Object.entries(map).sort(([a], [b]) => a.localeCompare(b)),
    );
    try {
      await writeDataDocuments([
        {
          key: LIFT_CONFIRMED_DOCUMENT_KEY,
          content: `${JSON.stringify(sorted, null, 2)}\n`,
          mediaType: "application/json",
          expectedHash: current?.hash ?? null,
        },
      ]);
      return sorted;
    } catch (error) {
      if (
        error instanceof DataDocumentConflictError &&
        attempt < WRITE_ATTEMPTS
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("lift_confirmed.json の保存を再試行できませんでした。");
}

export const serializeLiftBeforeGeojson = (
  geojson: LiftBeforeGeojson,
): string => JSON.stringify(geojson);

// 既存の lift_before と同じ 1 行の compact JSON でDBへ書き込む。
export async function writeLiftBeforeGeojson(
  resortId: string,
  geojson: LiftBeforeGeojson,
  expectedHash: string | null,
): Promise<DataDocument> {
  if (!isValidResortId(resortId)) {
    throw new Error(`不正なスキー場IDです: ${resortId}`);
  }
  const { writeDataDocuments } = await loadDataDocumentClient();
  const [written] = await writeDataDocuments([
    {
      key: liftBeforeDocumentKey(resortId),
      content: serializeLiftBeforeGeojson(geojson),
      mediaType: "application/geo+json",
      expectedHash,
    },
  ]);
  if (!written) throw new Error("lift_before の保存結果がありません。");
  return written;
}

const EMPTY_RESORT_LINKS: ResortLinks = {
  officialSiteUrls: [],
  mapUrls: [],
  skiSchoolUrls: [],
  snowboardSchoolUrls: [],
  skiResortInfoUrls: [],
  espeYukiUrls: [],
  gelandePlusTubeUrls: [],
  youtubeUrls: [],
  lineUrls: [],
  xUrls: [],
  threadsUrls: [],
  instagramUrls: [],
  facebookUrls: [],
};

// 旧形式の文字列URLも読み込み、新形式へ正規化する。
const toLinkList = (value: unknown): ResortLink[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap(item => {
    if (typeof item === "string") {
      const url = item.trim();
      return url === "" ? [] : [{ url }];
    }
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const raw = item as Record<string, unknown>;
    if (typeof raw.url !== "string" || raw.url.trim() === "") return [];
    const url = raw.url.trim();
    const description =
      typeof raw.description === "string" ? raw.description.trim() : "";
    return [{ url, ...(description === "" ? {} : { description }) }];
  });
};

const normalizeResortLinks = (value: unknown): ResortLinks => {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    officialSiteUrls: toLinkList(raw.officialSiteUrls),
    mapUrls: toLinkList(raw.mapUrls),
    // 旧 schoolUrls はすべてスキースクールとして扱う。
    skiSchoolUrls: toLinkList(raw.skiSchoolUrls ?? raw.schoolUrls),
    snowboardSchoolUrls: toLinkList(raw.snowboardSchoolUrls),
    skiResortInfoUrls: toLinkList(raw.skiResortInfoUrls),
    espeYukiUrls: toLinkList(raw.espeYukiUrls),
    gelandePlusTubeUrls: toLinkList(raw.gelandePlusTubeUrls),
    youtubeUrls: toLinkList(raw.youtubeUrls),
    lineUrls: toLinkList(raw.lineUrls),
    xUrls: toLinkList(raw.xUrls),
    threadsUrls: toLinkList(raw.threadsUrls),
    instagramUrls: toLinkList(raw.instagramUrls),
    facebookUrls: toLinkList(raw.facebookUrls),
  };
};

const parseResortLinksMap = (
  raw: string | null,
): Record<string, ResortLinks> => {
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const map: Record<string, ResortLinks> = {};
    for (const [resortId, links] of Object.entries(parsed)) {
      map[resortId] = normalizeResortLinks(links);
    }
    return map;
  } catch {
    return {};
  }
};

export async function readResortLinksMap(): Promise<
  Record<string, ResortLinks>
> {
  const { getDataDocument } = await loadDataDocumentClient();
  const document = await getDataDocument(SKI_RESORT_LINKS_DOCUMENT_KEY);
  return parseResortLinksMap(document?.content ?? null);
}

export async function readResortLinks(resortId: string): Promise<ResortLinks> {
  if (!isValidResortId(resortId)) return EMPTY_RESORT_LINKS;
  const map = await readResortLinksMap();
  return map[resortId] ?? EMPTY_RESORT_LINKS;
}

export async function writeResortLinks(
  resortId: string,
  links: ResortLinks,
): Promise<void> {
  if (!isValidResortId(resortId)) {
    throw new Error(`不正なスキー場IDです: ${resortId}`);
  }
  const sanitized = normalizeResortLinks(links);
  const { getDataDocument, writeDataDocuments } =
    await loadDataDocumentClient();

  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
    const current = await getDataDocument(SKI_RESORT_LINKS_DOCUMENT_KEY);
    const map = parseResortLinksMap(current?.content ?? null);
    const hasAnyLink = Object.values(sanitized).some(list => list.length > 0);
    if (hasAnyLink) {
      map[resortId] = sanitized;
    } else {
      delete map[resortId];
    }
    const sorted = Object.fromEntries(
      Object.entries(map).sort(([a], [b]) => a.localeCompare(b)),
    );
    try {
      await writeDataDocuments([
        {
          key: SKI_RESORT_LINKS_DOCUMENT_KEY,
          content: `${JSON.stringify(sorted, null, 2)}\n`,
          mediaType: "application/json",
          expectedHash: current?.hash ?? null,
        },
      ]);
      return;
    } catch (error) {
      if (
        error instanceof DataDocumentConflictError &&
        attempt < WRITE_ATTEMPTS
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("SkiResortLinks.json の保存を再試行できませんでした。");
}
