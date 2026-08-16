import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  LiftBeforeGeojson,
  LiftDetailEntry,
  ResortLink,
  ResortLinks,
} from "@/features/lift/types";

const PRIVATE_DATA_ROOT = path.join(process.cwd(), "src", "private", "data");

const DATA_ROOT = path.join(PRIVATE_DATA_ROOT, "resorts-temporary");

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

// スキー場全体の参考リンク（公式サイト・マップ・SNS等）。スキー場ID → リンク一覧
const RESORT_LINKS_PATH = path.join(PRIVATE_DATA_ROOT, "SkiResortLinks.json");

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

export async function readResortLinksMap(): Promise<
  Record<string, ResortLinks>
> {
  try {
    const raw = await fs.readFile(RESORT_LINKS_PATH, "utf-8");
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
  const map = await readResortLinksMap();
  const hasAnyLink = Object.values(sanitized).some(list => list.length > 0);
  if (hasAnyLink) {
    map[resortId] = sanitized;
  } else {
    delete map[resortId];
  }
  const sorted = Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b)),
  );
  await fs.writeFile(RESORT_LINKS_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
}
