import type {
  BinaryMark,
  CourseDetail,
  EditorCourse,
  LngLat,
  PisteMark,
  SlopeDetailEntry,
  SlopeSourceData,
} from "../types";
import { createEmptyCourse, createEmptyDetail } from "./courseOps";

const EDITABLE_DETAIL_KEYS = new Set([
  "resort",
  "name",
  "level",
  "distance",
  "avg",
  "max",
  "piste",
  "morning",
  "night",
]);

const toDetailString = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" ? value.trim() : "";
};

// "初・中級" のような表記ゆれを選択肢の形式へ寄せる
const normalizeLevel = (value: unknown): string =>
  typeof value === "string" ? value.trim().replace(/[・･]/g, "") : "";

const normalizeMark = (value: unknown, allowed: string[]): string => {
  if (typeof value !== "string") return "";
  const mark = value.trim().replace(/[〇◯]/g, "○");
  return allowed.includes(mark) ? mark : "";
};

const buildDetail = (entry: SlopeDetailEntry): CourseDetail => ({
  level: normalizeLevel(entry.level),
  distance: toDetailString(entry.distance),
  avg: toDetailString(entry.avg),
  max: toDetailString(entry.max),
  piste: normalizeMark(entry.piste, ["○", "△", "×"]) as PisteMark,
  morning: normalizeMark(entry.morning, ["○", "×"]) as BinaryMark,
  night: normalizeMark(entry.night, ["○", "×"]) as BinaryMark,
});

const buildExtras = (entry: SlopeDetailEntry): Record<string, unknown> => {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!EDITABLE_DETAIL_KEYS.has(key)) extras[key] = value;
  }
  return extras;
};

// サーバーから読み込んだ既存データを編集用のコース配列へ変換する
export const sourceDataToCourses = (
  source: SlopeSourceData,
): EditorCourse[] => {
  const detailByName = new Map<string, SlopeDetailEntry>();
  for (const entry of source.details ?? []) {
    if (typeof entry.name === "string") {
      detailByName.set(entry.name, entry);
    }
  }

  const courses: EditorCourse[] = [];
  for (const feature of source.geojson?.features ?? []) {
    if (feature.geometry?.type !== "LineString") continue;
    if (!Array.isArray(feature.geometry.coordinates)) continue;

    const coordinates = (feature.geometry.coordinates as unknown[])
      .map(value => {
        if (!Array.isArray(value) || value.length < 2) return null;
        const lng = Number(value[0]);
        const lat = Number(value[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return [lng, lat] as LngLat;
      })
      .filter((coordinate): coordinate is LngLat => coordinate !== null);
    if (coordinates.length < 2) continue;

    const rawName = feature.properties?.name;
    const name = typeof rawName === "string" ? rawName : "";
    const detailEntry = detailByName.get(name);

    courses.push({
      ...createEmptyCourse(),
      name,
      coordinates,
      detail: detailEntry ? buildDetail(detailEntry) : createEmptyDetail(),
      detailExtras: detailEntry ? buildExtras(detailEntry) : null,
    });
  }

  return courses;
};
