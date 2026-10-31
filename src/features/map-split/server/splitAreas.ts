import "server-only";

import type { LngLat } from "@/features/slope/types";
import { getResortLabelName } from "@/lib/resortAliases";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import { getDataDocument } from "@/server/data-documents/client";
import {
  SPLIT_LAYER_KINDS,
  type SplitArea,
  type SplitAssignmentDocument,
  type SplitLayer,
  type SplitLayerKind,
  type SplitLine,
  type SplitMember,
} from "../types";

/** 志賀高原 中央エリアと横手山・渋峠はまとめたまま使うので、振り分けの対象にしない */
const EXCLUDED_AREA_IDS = new Set([
  "shiga-kogen-central",
  "shiga-kogen-yokoteyama-shibutoge",
]);

/**
 * スキー場としては登録されていないが、複数のスキー場をまとめて描いた地図。
 * 構成するスキー場には OSM の地図しかなく、こちらの整備済みの地図は表示に使われていない。
 */
const UNREGISTERED_AREAS: { id: string; name: string; memberIds: string[] }[] =
  [
    {
      id: "hachimantai-resort",
      name: "八幡平リゾート（パノラマ・下倉）",
      memberIds: [
        "hachimantai-resort-panorama",
        "hachimantai-resort-shimokura",
      ],
    },
    {
      id: "hakuba-cortina-norikura",
      name: "白馬コルチナ・白馬乗鞍温泉",
      memberIds: ["hakuba-cortina", "hakuba-norikura-onsen"],
    },
  ];

/** 既存の地図と重なっているとみなす距離（m） */
const OVERLAP_METERS = 50;
/** 頂点のうち、この割合以上が重なっていればそのスキー場の線とみなす */
const OVERLAP_RATIO = 0.5;
const GRID_DEGREES = 0.002;

export const splitLayerDocumentKey = (kind: SplitLayerKind, id: string) =>
  `resorts-temporary/${kind}/${id}.geojson`;

export const splitAssignmentDocumentKey = (areaId: string) =>
  `resorts-temporary/map_split/${areaId}.json`;

type Feature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};

const isPosition = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  typeof value[0] === "number" &&
  typeof value[1] === "number";

const toLine = (value: unknown): LngLat[] =>
  Array.isArray(value)
    ? value.filter(isPosition).map(([lng, lat]) => [lng, lat] as LngLat)
    : [];

/** 地図に描く1本の線。複数に分かれた線は一番長い部分を使う */
const featureLine = (feature: Feature): LngLat[] => {
  const geometry = feature.geometry;
  if (!geometry) return [];
  const coordinates = geometry.coordinates;
  switch (geometry.type) {
    case "LineString":
      return toLine(coordinates);
    case "MultiLineString":
    case "Polygon":
      return Array.isArray(coordinates)
        ? coordinates
            .map(toLine)
            .reduce<LngLat[]>((a, b) => (b.length > a.length ? b : a), [])
        : [];
    case "Point":
      return isPosition(coordinates)
        ? [[coordinates[0], coordinates[1]] as LngLat]
        : [];
    default:
      return [];
  }
};

const featureName = (feature: Feature, index: number) => {
  const name = feature.properties?.name;
  return typeof name === "string" && name.trim().length > 0
    ? name
    : `（名前なし #${index + 1}）`;
};

const parseFeatures = (content: string): Feature[] => {
  const parsed = JSON.parse(content) as { features?: unknown };
  return Array.isArray(parsed.features) ? (parsed.features as Feature[]) : [];
};

const metersBetween = (a: LngLat, b: LngLat) => {
  const scale = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((a[0] - b[0]) * 111_320 * scale, (a[1] - b[1]) * 110_540);
};

const metersToSegment = (point: LngLat, start: LngLat, end: LngLat) => {
  const scale = Math.cos(point[1] * (Math.PI / 180));
  const ax = (start[0] - point[0]) * 111_320 * scale;
  const ay = (start[1] - point[1]) * 110_540;
  const bx = (end[0] - point[0]) * 111_320 * scale;
  const by = (end[1] - point[1]) * 110_540;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy);
};

/** スキー場ごとの既存の線を格子に入れて、頂点の近くにある線分だけを調べる */
class SegmentIndex {
  private readonly cells = new Map<string, [LngLat, LngLat][]>();

  add(line: LngLat[]) {
    const segments: [LngLat, LngLat][] =
      line.length === 1
        ? [[line[0] as LngLat, line[0] as LngLat]]
        : line.slice(1).map((end, i) => [line[i] as LngLat, end]);
    for (const segment of segments) {
      const [start, end] = segment;
      const minX = Math.floor(Math.min(start[0], end[0]) / GRID_DEGREES);
      const maxX = Math.floor(Math.max(start[0], end[0]) / GRID_DEGREES);
      const minY = Math.floor(Math.min(start[1], end[1]) / GRID_DEGREES);
      const maxY = Math.floor(Math.max(start[1], end[1]) / GRID_DEGREES);
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const key = `${x}:${y}`;
          const cell = this.cells.get(key);
          if (cell) cell.push(segment);
          else this.cells.set(key, [segment]);
        }
      }
    }
  }

  isNear(point: LngLat) {
    const x = Math.floor(point[0] / GRID_DEGREES);
    const y = Math.floor(point[1] / GRID_DEGREES);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const [start, end] of this.cells.get(`${x + dx}:${y + dy}`) ??
          []) {
          if (metersToSegment(point, start, end) <= OVERLAP_METERS) return true;
        }
      }
    }
    return false;
  }
}

type MemberReference = SplitMember & {
  point: LngLat;
  index: SegmentIndex;
};

const readMemberReference = async (
  member: SplitMember & { point: LngLat },
): Promise<MemberReference> => {
  const index = new SegmentIndex();
  const documents = await Promise.all(
    SPLIT_LAYER_KINDS.map(kind =>
      getDataDocument(splitLayerDocumentKey(kind, member.id)),
    ),
  );
  for (const document of documents) {
    if (!document) continue;
    for (const feature of parseFeatures(document.content)) {
      const line = featureLine(feature);
      if (line.length > 0) index.add(line);
    }
  }
  return { ...member, index };
};

/** 既存の地図と重なる割合が高いスキー場、なければ拠点が一番近いスキー場を選ぶ */
const suggestMember = (
  line: LngLat[],
  references: MemberReference[],
): Pick<SplitLine, "memberId" | "reason"> => {
  const fallback = references[0]?.id ?? "";
  if (line.length === 0) return { memberId: fallback, reason: "nearest" };
  let best: { id: string; ratio: number } | null = null;
  for (const reference of references) {
    const near = line.filter(point => reference.index.isNear(point)).length;
    const ratio = near / line.length;
    if (ratio >= OVERLAP_RATIO && (!best || ratio > best.ratio))
      best = { id: reference.id, ratio };
  }
  if (best) return { memberId: best.id, reason: "overlap" };
  const center = line.reduce<LngLat>(
    (sum, point) => [
      sum[0] + point[0] / line.length,
      sum[1] + point[1] / line.length,
    ],
    [0, 0],
  );
  const nearest = references.reduce<MemberReference | null>(
    (current, reference) =>
      !current ||
      metersBetween(center, reference.point) <
        metersBetween(center, current.point)
        ? reference
        : current,
    null,
  );
  return { memberId: nearest?.id ?? fallback, reason: "nearest" };
};

const readSavedAssignments = async (
  areaId: string,
): Promise<SplitAssignmentDocument | null> => {
  const document = await getDataDocument(splitAssignmentDocumentKey(areaId));
  if (!document) return null;
  return JSON.parse(document.content) as SplitAssignmentDocument;
};

const buildArea = async (
  area: Pick<SplitArea, "id" | "name" | "linkKind">,
  members: (SplitMember & { point: LngLat })[],
): Promise<SplitArea | null> => {
  const [sources, references, saved] = await Promise.all([
    Promise.all(
      SPLIT_LAYER_KINDS.map(async kind => ({
        kind,
        document: await getDataDocument(splitLayerDocumentKey(kind, area.id)),
      })),
    ),
    Promise.all(members.map(readMemberReference)),
    readSavedAssignments(area.id),
  ]);
  const memberIds = new Set(members.map(member => member.id));
  const staleLayerKinds: SplitLayerKind[] = [];
  const layers: SplitLayer[] = [];
  for (const { kind, document } of sources) {
    if (!document) continue;
    const features = parseFeatures(document.content);
    if (features.length === 0) continue;
    const savedLayer = saved?.layers.find(layer => layer.kind === kind);
    if (savedLayer && savedLayer.sourceHash !== document.hash)
      staleLayerKinds.push(kind);
    const lines = features.map((feature, index): SplitLine => {
      const name = featureName(feature, index);
      const coordinates = featureLine(feature);
      const savedAssignment = savedLayer?.assignments.find(
        item =>
          item.index === index &&
          item.name === name &&
          memberIds.has(item.memberId),
      );
      return {
        index,
        name,
        coordinates,
        ...(savedAssignment
          ? { memberId: savedAssignment.memberId, reason: "saved" as const }
          : suggestMember(coordinates, references)),
      };
    });
    layers.push({
      kind,
      sourceKey: document.key,
      sourceHash: document.hash,
      lines,
    });
  }
  if (layers.length === 0) return null;
  return {
    ...area,
    members: members.map(({ id, name }) => ({ id, name })),
    layers,
    savedAt: saved?.savedAt ?? null,
    staleLayerKinds,
  };
};

/** 振り分けの対象になるエリアと、それぞれの線の振り分け案を作る */
export async function readSplitAreas(): Promise<SplitArea[]> {
  const resorts = await readAdminSkiResorts();
  const byId = new Map(resorts.map(resort => [resort.id, resort]));
  const toMember = (id: string) => {
    const resort = byId.get(id);
    return resort
      ? {
          id,
          name: getResortLabelName(id, resort.nameJa, resort.shortName),
          point: [resort.longitude, resort.latitude] as LngLat,
        }
      : null;
  };
  const registered = resorts
    .filter(resort => !EXCLUDED_AREA_IDS.has(resort.id))
    .map(resort => ({
      area: { id: resort.id, name: resort.nameJa, linkKind: resort.linkKind },
      members: resorts
        .filter(member => member.mergedIntoId === resort.id)
        .map(member => toMember(member.id))
        .filter(member => member !== null),
    }))
    .filter(({ members }) => members.length >= 2);
  const unregistered = UNREGISTERED_AREAS.filter(area => !byId.has(area.id))
    .map(area => ({
      area: { id: area.id, name: area.name, linkKind: null },
      members: area.memberIds.map(toMember).filter(member => member !== null),
    }))
    .filter(({ members }) => members.length >= 2);
  const areas = await Promise.all(
    [...registered, ...unregistered].map(({ area, members }) =>
      buildArea(area, members),
    ),
  );
  return areas
    .filter(area => area !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function readSplitArea(areaId: string) {
  return (await readSplitAreas()).find(area => area.id === areaId) ?? null;
}
