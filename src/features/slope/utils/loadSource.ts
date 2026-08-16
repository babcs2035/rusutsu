import { LEVEL_OPTIONS } from "../constants";
import type {
  BinaryMark,
  CourseDetail,
  EditorCourse,
  LngLat,
  PisteMark,
  SlopeBeforeFeature,
  SlopeDetailEntry,
  SlopeSourceData,
} from "../types";
import { createEmptyCourse } from "./courseOps";

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
  "image",
  "searchWord",
]);

const toDetailString = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" ? value.trim() : "";
};

export type LevelNormalization = {
  level: string;
  raw: string;
  issue: "conflict" | "empty" | "no-marker" | null;
};

const LEVEL_BY_MARKERS: Record<string, (typeof LEVEL_OPTIONS)[number]> = {
  初: "初級",
  初中: "初中級",
  中: "中級",
  中上: "中上級",
  上: "上級",
};

// 既定の5段階ではない表記は、含まれる「初」「中」「上」から判定する。
// 「初+上」「初+中+上」は競合として扱い、該当文字がなければ判定しない。
export const normalizeLevel = (value: unknown): LevelNormalization => {
  const raw = toDetailString(value);
  if (raw === "") return { level: "", raw, issue: "empty" };

  const normalized = raw.replace(/[・･]/g, "");
  if (LEVEL_OPTIONS.includes(normalized as (typeof LEVEL_OPTIONS)[number])) {
    return { level: normalized, raw, issue: null };
  }

  const markers = ["初", "中", "上"]
    .filter(marker => raw.includes(marker))
    .join("");
  const inferredLevel = LEVEL_BY_MARKERS[markers];
  if (inferredLevel) {
    return { level: inferredLevel, raw, issue: null };
  }

  return {
    level: "",
    raw,
    issue: markers === "" ? "no-marker" : "conflict",
  };
};

export const buildLevelNormalizationWarning = (
  courseName: string,
  courseIndex: number,
  normalization: LevelNormalization,
): string | null => {
  if (!normalization.issue) return null;
  const label = courseName || `${courseIndex + 1}番目のコース`;
  if (normalization.issue === "empty") {
    return `「${label}」の level が空欄のため、難易度も空欄にしました。`;
  }
  if (normalization.issue === "no-marker") {
    return `「${label}」の level「${normalization.raw}」に「初」「中」「上」が含まれず判定できないため、難易度を空欄にしました。`;
  }
  return `「${label}」の level「${normalization.raw}」では「初」「中」「上」の組み合わせが競合するため、難易度を空欄にしました。`;
};

const normalizeMark = (value: unknown, allowed: string[]): string => {
  if (typeof value !== "string") return "";
  const mark = value.trim().replace(/[〇◯]/g, "○");
  return allowed.includes(mark) ? mark : "";
};

const buildDetail = (entry: SlopeDetailEntry): CourseDetail => ({
  level: normalizeLevel(entry.level).level,
  distance: toDetailString(entry.distance),
  avg: toDetailString(entry.avg),
  max: toDetailString(entry.max),
  piste: normalizeMark(entry.piste, ["○", "△", "×"]) as PisteMark,
  morning: normalizeMark(entry.morning, ["○", "×"]) as BinaryMark,
  night: normalizeMark(entry.night, ["○", "×"]) as BinaryMark,
  image: toDetailString(entry.image),
  searchWord: toDetailString(entry.searchWord),
});

const buildExtras = (entry: SlopeDetailEntry): Record<string, unknown> => {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!EDITABLE_DETAIL_KEYS.has(key)) extras[key] = value;
  }
  return extras;
};

// slope_detail の非空項目を優先し、空欄は slope_before の値を残す。
// lift で lift_detail を結合するときと同じ扱いにする。
const mergeDetail = (
  beforeEntry: SlopeDetailEntry,
  detailEntry: SlopeDetailEntry | undefined,
): { detail: CourseDetail; levelNormalization: LevelNormalization } => {
  const before = buildDetail(beforeEntry);
  const detailLevel = detailEntry ? toDetailString(detailEntry.level) : "";
  const levelNormalization = normalizeLevel(
    detailLevel !== "" ? detailEntry?.level : beforeEntry.level,
  );
  if (!detailEntry) {
    return {
      detail: { ...before, level: levelNormalization.level },
      levelNormalization,
    };
  }
  const detail = buildDetail(detailEntry);
  return {
    detail: {
      level: levelNormalization.level,
      distance: detail.distance || before.distance,
      avg: detail.avg || before.avg,
      max: detail.max || before.max,
      piste: detail.piste || before.piste,
      morning: detail.morning || before.morning,
      night: detail.night || before.night,
      image: detail.image || before.image,
      searchWord: detail.searchWord || before.searchWord,
    },
    levelNormalization,
  };
};

// サーバーから読み込んだ既存データを編集用のコース配列へ変換する
export const sourceDataToCourses = (
  source: SlopeSourceData,
): {
  courses: EditorCourse[];
  preservedFeatures: SlopeBeforeFeature[];
  preservedDetails: SlopeDetailEntry[];
  warnings: string[];
} => {
  const detailEntries = source.details ?? [];
  const detailCountByName = new Map<string, number>();
  for (const entry of detailEntries) {
    if (typeof entry.name !== "string" || entry.name === "") continue;
    detailCountByName.set(
      entry.name,
      (detailCountByName.get(entry.name) ?? 0) + 1,
    );
  }
  const featureCountByName = new Map<string, number>();
  for (const feature of source.geojson?.features ?? []) {
    const name = feature.properties?.name;
    if (typeof name !== "string" || name === "") continue;
    featureCountByName.set(name, (featureCountByName.get(name) ?? 0) + 1);
  }
  const detailByName = new Map<
    string,
    { entry: SlopeDetailEntry; index: number }
  >();
  detailEntries.forEach((entry, index) => {
    const name = typeof entry.name === "string" ? entry.name : "";
    if (
      name !== "" &&
      detailCountByName.get(name) === 1 &&
      featureCountByName.get(name) === 1
    ) {
      detailByName.set(name, { entry, index });
    }
  });
  const matchedDetailIndexes = new Set<number>();

  const courses: EditorCourse[] = [];
  const preservedFeatures: SlopeBeforeFeature[] = [];
  const warnings: string[] = [];
  for (const feature of source.geojson?.features ?? []) {
    if (
      feature.geometry?.type !== "LineString" ||
      !Array.isArray(feature.geometry.coordinates)
    ) {
      preservedFeatures.push(feature);
      continue;
    }

    const coordinates = (feature.geometry.coordinates as unknown[])
      .map(value => {
        if (!Array.isArray(value) || value.length < 2) return null;
        const lng = Number(value[0]);
        const lat = Number(value[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return [lng, lat] as LngLat;
      })
      .filter((coordinate): coordinate is LngLat => coordinate !== null);
    if (coordinates.length < 2) {
      preservedFeatures.push(feature);
      continue;
    }

    const rawName = feature.properties?.name;
    const name = typeof rawName === "string" ? rawName : "";
    const detailMatch = detailByName.get(name);
    if (detailMatch) matchedDetailIndexes.add(detailMatch.index);
    // slope_before の線・properties を土台に、同名の slope_detail が一意に
    // 対応する場合は、非空の詳細項目を優先して編集初期値へ取り込む。
    const combinedDetailEntry: SlopeDetailEntry = {
      ...(feature.properties ?? {}),
      ...(detailMatch?.entry ?? {}),
    };
    const beforeExtras = { ...(feature.properties ?? {}) };
    delete beforeExtras.name;
    for (const key of EDITABLE_DETAIL_KEYS) delete beforeExtras[key];
    const mergedDetail = mergeDetail(
      feature.properties ?? {},
      detailMatch?.entry,
    );
    const levelWarning = buildLevelNormalizationWarning(
      name,
      courses.length,
      mergedDetail.levelNormalization,
    );
    if (levelWarning) warnings.push(levelWarning);

    courses.push({
      ...createEmptyCourse(),
      name,
      coordinates,
      detail: mergedDetail.detail,
      beforeExtras,
      detailExtras:
        Object.keys(combinedDetailEntry).length > 0
          ? buildExtras(combinedDetailEntry)
          : null,
    });
  }

  const preservedDetails = detailEntries.filter(
    (_, index) => !matchedDetailIndexes.has(index),
  );
  return { courses, preservedFeatures, preservedDetails, warnings };
};
