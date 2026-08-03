import { promises as fs } from "node:fs";
import path from "node:path";

export type GeoCoordinate = [number, number] | [number, number, number];

export type FinalizedCourseFeature = {
  id: string;
  name: string;
  displayName: string;
  groupId: string;
  sectionName: string | null;
  coordinates: GeoCoordinate[];
  slopeDeg: number[] | null;
  properties: {
    name: string;
    level: string | null;
    piste: string | null;
    snowboard: string | null;
    status: string | null;
    update: string | null;
    latestNote: string | null;
    horizontalDistMap: number | null;
    slopeDistMap: number | null;
    elevationDiffMap: number | null;
    avgSlopeDegMap: number | null;
    maxSlopeDegMap: number | null;
    distance: number | null;
    avg: number | null;
    max: number | null;
    maxWidth: number | null;
    minWidth: number | null;
    note: string | null;
    image: string | null;
  };
};

const COURSE_SECTION_NAME_RE = /^(.+)_#?(上部|中部|下部)$/u;
const NAMELESS_COURSE_RE = /^無名_(.+)$/u;

const getCourseDisplayName = (name: string): string => {
  const namelessMatch = NAMELESS_COURSE_RE.exec(name);
  if (!namelessMatch) return name;

  const suffix = namelessMatch[1]?.trim();
  if (!suffix) return "無名";
  return /^\d+$/u.test(suffix) ? "無名" : suffix;
};

const parseFinalizedCourseName = (name: string) => {
  const sectionMatch = COURSE_SECTION_NAME_RE.exec(name);
  if (!sectionMatch) {
    return {
      displayName: getCourseDisplayName(name),
      groupName: name,
      sectionName: null,
    };
  }

  const baseName = sectionMatch[1] ?? name;
  return {
    displayName: getCourseDisplayName(baseName),
    groupName: baseName,
    sectionName: sectionMatch[2] ?? null,
  };
};

export type FinalizedLiftFeature = {
  id: string;
  name: string;
  coordinates: GeoCoordinate[];
  properties: {
    name: string;
    type: string | null;
    speed: string | null;
    hood: string | null;
    capacity: number | null;
    distance: number | null;
    vertical: number | null;
    top: number | null;
    bottom: number | null;
    footrest: string | null;
    towers: number | null;
    signal: string | null;
    oilShield: string | null;
    maker: string | null;
    year: number | null;
    note: string | null;
    status: string | null;
    update: string | null;
    latestNote: string | null;
    horizontalDistMap: number | null;
    slopeDistMap: number | null;
    elevationDiffMap: number | null;
  };
};

export type FinalizedResortMapData = {
  courses: {
    source: "resorts-finalized" | "slope_10m" | "slope_before";
    fileName: string;
    features: FinalizedCourseFeature[];
  } | null;
  lifts: {
    source: "resorts-finalized" | "lift_20m" | "lift_before";
    fileName: string;
    features: FinalizedLiftFeature[];
  } | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: unknown[];
};

type GeoJsonFeature = {
  type: "Feature";
  geometry?: {
    type?: string;
    coordinates?: unknown;
  } | null;
  properties?: Record<string, unknown> | null;
};

type TimestampedFile = {
  fileName: string;
  timestamp: number;
};

export const FINALIZED_RESORTS_ROOT = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "src/private/data/resorts-finalized",
);

export const TEMPORARY_RESORTS_ROOT = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "src/private/data/resorts-temporary",
);

const TIMESTAMPED_GEOJSON_RE =
  /^(\d{4})_(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.geojson$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseGeojsonFileTimestamp = (fileName: string): number | null => {
  const match = TIMESTAMPED_GEOJSON_RE.exec(fileName);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }

  return date.getTime();
};

export const selectLatestTimestampedGeojsonFile = (
  fileNames: string[],
): string | null => {
  const candidates = getTimestampedGeojsonFiles(fileNames);

  if (candidates.length === 0) return null;

  return candidates[0].fileName;
};

const getTimestampedGeojsonFiles = (fileNames: string[]): TimestampedFile[] =>
  fileNames
    .map(fileName => {
      const timestamp = parseGeojsonFileTimestamp(fileName);
      return timestamp == null ? null : { fileName, timestamp };
    })
    .filter((file): file is TimestampedFile => file !== null)
    .sort((a, b) => b.timestamp - a.timestamp);

export const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCoordinates = (coordinates: unknown): GeoCoordinate[] | null => {
  if (!Array.isArray(coordinates)) return null;

  const normalized = coordinates
    .map(coordinate => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
      const lng = normalizeNumber(coordinate[0]);
      const lat = normalizeNumber(coordinate[1]);
      if (lng == null || lat == null) return null;
      const elevation = normalizeNumber(coordinate[2]);
      return elevation == null
        ? ([lng, lat] as GeoCoordinate)
        : ([lng, lat, elevation] as GeoCoordinate);
    })
    .filter((coordinate): coordinate is GeoCoordinate => coordinate !== null);

  return normalized.length >= 2 ? normalized : null;
};

const normalizeSlopeDeg = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null;
  const slopes = value.map(normalizeNumber);
  if (slopes.some(slope => slope === null)) return null;
  return slopes as number[];
};

const createFeatureId = (
  kind: "course" | "lift",
  properties: Record<string, unknown>,
  index: number,
) => {
  const name = normalizeString(properties.name) ?? `${kind}-${index + 1}`;
  return `${kind}-${index}-${name}`;
};

const normalizeCourseFeature = (
  feature: unknown,
  index: number,
): FinalizedCourseFeature | null => {
  if (!isRecord(feature)) return null;
  const candidate = feature as GeoJsonFeature;
  if (candidate.type !== "Feature") return null;
  if (candidate.geometry?.type !== "LineString") return null;

  const coordinates = normalizeCoordinates(candidate.geometry.coordinates);
  if (!coordinates) return null;

  const properties = candidate.properties ?? {};
  const name = normalizeString(properties.name) ?? `コース ${index + 1}`;
  const parsedName = parseFinalizedCourseName(name);

  return {
    id: createFeatureId("course", properties, index),
    name,
    displayName: parsedName.displayName,
    groupId:
      parsedName.sectionName === null
        ? createFeatureId("course", properties, index)
        : `course-group-${parsedName.groupName}`,
    sectionName: parsedName.sectionName,
    coordinates,
    slopeDeg: normalizeSlopeDeg(properties.slope_deg),
    properties: {
      name,
      level: normalizeString(properties.level),
      piste: normalizeString(properties.piste),
      snowboard: normalizeString(properties.snowboard),
      status: normalizeString(properties.status),
      update: normalizeString(properties.update),
      latestNote: normalizeString(properties.latest_note),
      horizontalDistMap: normalizeNumber(properties.horizontal_dist_map),
      slopeDistMap: normalizeNumber(properties.slope_dist_map),
      elevationDiffMap: normalizeNumber(properties.elevation_diff_map),
      avgSlopeDegMap: normalizeNumber(properties.avg_slope_deg_map),
      maxSlopeDegMap: normalizeNumber(properties.max_slope_deg_map),
      distance: normalizeNumber(properties.distance),
      avg: normalizeNumber(properties.avg),
      max: normalizeNumber(properties.max),
      maxWidth: normalizeNumber(properties.maxWidth),
      minWidth: normalizeNumber(properties.minWidth),
      note: normalizeString(properties.note),
      image: normalizeString(properties.image),
    },
  };
};

const normalizeLiftFeature = (
  feature: unknown,
  index: number,
): FinalizedLiftFeature | null => {
  if (!isRecord(feature)) return null;
  const candidate = feature as GeoJsonFeature;
  if (candidate.type !== "Feature") return null;
  if (candidate.geometry?.type !== "LineString") return null;

  const coordinates = normalizeCoordinates(candidate.geometry.coordinates);
  if (!coordinates) return null;

  const properties = candidate.properties ?? {};
  const name = normalizeString(properties.name) ?? `リフト ${index + 1}`;

  return {
    id: createFeatureId("lift", properties, index),
    name,
    coordinates,
    properties: {
      name,
      type:
        normalizeString(properties.type) ??
        normalizeString(properties.aerialway),
      speed: normalizeString(properties.speed),
      hood: normalizeString(properties.hood),
      capacity: normalizeNumber(properties.capacity),
      distance: normalizeNumber(properties.distance),
      vertical: normalizeNumber(properties.vertical),
      top: normalizeNumber(properties.top),
      bottom: normalizeNumber(properties.bottom),
      footrest: normalizeString(properties.footrest),
      towers: normalizeNumber(properties.towers),
      signal: normalizeString(properties.signal),
      oilShield: normalizeString(properties.oilShield),
      maker: normalizeString(properties.maker),
      year: normalizeNumber(properties.year),
      note: normalizeString(properties.note),
      status: normalizeString(properties.status),
      update: normalizeString(properties.update),
      latestNote: normalizeString(properties.latest_note),
      horizontalDistMap: normalizeNumber(properties.horizontal_dist_map),
      slopeDistMap: normalizeNumber(properties.slope_dist_map),
      elevationDiffMap: normalizeNumber(properties.elevation_diff_map),
    },
  };
};

const parseFeatureCollection = (value: unknown): GeoJsonFeatureCollection => {
  if (!isRecord(value) || value.type !== "FeatureCollection") {
    throw new Error("GeoJSON is not a FeatureCollection");
  }
  if (!Array.isArray(value.features)) {
    throw new Error("GeoJSON FeatureCollection has no features array");
  }

  return value as GeoJsonFeatureCollection;
};

const isSafeResortId = (resortId: string) =>
  /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(resortId);

const resolveFinalizedDataPath = (
  kind: "courses" | "lifts",
  resortId: string,
  finalizedRoot: string,
) => {
  if (!isSafeResortId(resortId)) return null;

  const resolved = path.resolve(finalizedRoot, kind, resortId);
  const root = path.resolve(finalizedRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  return resolved;
};

const resolveTemporaryDataPath = (
  kind: "slope_10m" | "slope_before" | "lift_20m" | "lift_before",
  resortId: string,
  temporaryRoot: string,
) => {
  if (!isSafeResortId(resortId)) return null;

  const directory = path.resolve(temporaryRoot, kind);
  const resolved = path.resolve(directory, `${resortId}.geojson`);
  if (!resolved.startsWith(`${directory}${path.sep}`)) return null;

  return resolved;
};

const loadLatestKindData = async <TFeature>(
  resortId: string,
  kind: "courses" | "lifts",
  normalizeFeature: (feature: unknown, index: number) => TFeature | null,
  finalizedRoot: string,
): Promise<{
  source: "resorts-finalized";
  fileName: string;
  features: TFeature[];
} | null> => {
  const directory = resolveFinalizedDataPath(kind, resortId, finalizedRoot);
  if (!directory) return null;

  let fileNames: string[];
  try {
    fileNames = await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to read finalized ${kind} directory`, error);
    }
    return null;
  }

  for (const candidate of getTimestampedGeojsonFiles(fileNames)) {
    const filePath = path.join(directory, candidate.fileName);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const collection = parseFeatureCollection(JSON.parse(raw));
      const features = collection.features
        .map(normalizeFeature)
        .filter((feature): feature is TFeature => feature !== null);

      if (features.length > 0) {
        return {
          source: "resorts-finalized",
          fileName: candidate.fileName,
          features,
        };
      }
    } catch (error) {
      console.warn(`Failed to load finalized ${kind} GeoJSON`, {
        resortId,
        fileName: candidate.fileName,
        error,
      });
    }
  }

  return null;
};

const loadTemporaryKindData = async <
  TFeature,
  TSource extends "slope_10m" | "slope_before" | "lift_20m" | "lift_before",
>(
  resortId: string,
  source: TSource,
  normalizeFeature: (feature: unknown, index: number) => TFeature | null,
  temporaryRoot: string,
): Promise<{
  source: TSource;
  fileName: string;
  features: TFeature[];
} | null> => {
  const filePath = resolveTemporaryDataPath(source, resortId, temporaryRoot);
  if (!filePath) return null;

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const collection = parseFeatureCollection(JSON.parse(raw));
    const features = collection.features
      .map(normalizeFeature)
      .filter((feature): feature is TFeature => feature !== null);

    if (features.length === 0) return null;

    return {
      source,
      fileName: path.basename(filePath),
      features,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to load temporary ${source} GeoJSON`, {
        resortId,
        fileName: path.basename(filePath),
        error,
      });
    }
    return null;
  }
};

export type ResortMapDataRoots = {
  finalizedRoot: string;
  temporaryRoot: string;
};

const loadCourseData = async (resortId: string, roots: ResortMapDataRoots) =>
  (await loadLatestKindData(
    resortId,
    "courses",
    normalizeCourseFeature,
    roots.finalizedRoot,
  )) ??
  (await loadTemporaryKindData(
    resortId,
    "slope_10m",
    normalizeCourseFeature,
    roots.temporaryRoot,
  )) ??
  loadTemporaryKindData(
    resortId,
    "slope_before",
    normalizeCourseFeature,
    roots.temporaryRoot,
  );

const loadLiftData = async (resortId: string, roots: ResortMapDataRoots) =>
  (await loadLatestKindData(
    resortId,
    "lifts",
    normalizeLiftFeature,
    roots.finalizedRoot,
  )) ??
  (await loadTemporaryKindData(
    resortId,
    "lift_20m",
    normalizeLiftFeature,
    roots.temporaryRoot,
  )) ??
  loadTemporaryKindData(
    resortId,
    "lift_before",
    normalizeLiftFeature,
    roots.temporaryRoot,
  );

export const getResortMapDataFromRoots = async (
  resortId: string,
  roots: ResortMapDataRoots,
): Promise<FinalizedResortMapData | null> => {
  const [courses, lifts] = await Promise.all([
    loadCourseData(resortId, roots),
    loadLiftData(resortId, roots),
  ]);

  if (!courses && !lifts) return null;

  return { courses, lifts };
};

export const getFinalizedResortMapData = (resortId: string) =>
  getResortMapDataFromRoots(resortId, {
    finalizedRoot: FINALIZED_RESORTS_ROOT,
    temporaryRoot: TEMPORARY_RESORTS_ROOT,
  });

export type CourseDifficulty =
  | "beginner"
  | "beginnerIntermediate"
  | "intermediate"
  | "intermediateAdvanced"
  | "advanced"
  | "unknown";

export const COURSE_DIFFICULTY_META: Record<
  CourseDifficulty,
  { label: string; color: string }
> = {
  beginner: { label: "初級", color: "#22C55E" },
  beginnerIntermediate: { label: "初・中級", color: "#F2C94C" },
  intermediate: { label: "中級", color: "#E53935" },
  intermediateAdvanced: { label: "中・上級", color: "#8B1E2D" },
  advanced: { label: "上級", color: "#222222" },
  unknown: { label: "不明", color: "#6B7280" },
};

export const getCourseDifficulty = (
  level: string | null | undefined,
): CourseDifficulty => {
  if (!level) return "unknown";

  const hasBeginner = level.includes("初");
  const hasIntermediate = level.includes("中");
  const hasAdvanced = level.includes("上");
  const count = [hasBeginner, hasIntermediate, hasAdvanced].filter(
    Boolean,
  ).length;

  if (count !== 1 && count !== 2) return "unknown";
  if (hasBeginner && hasIntermediate && !hasAdvanced) {
    return "beginnerIntermediate";
  }
  if (!hasBeginner && hasIntermediate && hasAdvanced) {
    return "intermediateAdvanced";
  }
  if (hasBeginner && !hasIntermediate && !hasAdvanced) return "beginner";
  if (!hasBeginner && hasIntermediate && !hasAdvanced) return "intermediate";
  if (!hasBeginner && !hasIntermediate && hasAdvanced) return "advanced";
  return "unknown";
};

export type PisteStyle = "solid" | "dash" | "dot";

export const getPisteStyle = (piste: string | null | undefined): PisteStyle => {
  if (!piste) return "solid";
  if (/[△]/u.test(piste)) return "dash";
  if (/[×✕✖]/u.test(piste)) return "dot";
  return "solid";
};

export const getStatusOpacity = (status: string | null | undefined) => {
  if (!status) return 0.75;
  if (/[○〇◯]/u.test(status)) return 1;
  if (/[△]/u.test(status)) return 0.6;
  if (/[×✕✖]/u.test(status)) return 0.25;
  return 0.75;
};

const hexToRgb = (hex: string) => {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b]
    .map(value =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

export const SLOPE_COLOR_STOPS = [
  { slope: 0, color: "#22C55E" },
  { slope: 10, color: "#84CC16" },
  { slope: 15, color: "#FACC15" },
  { slope: 20, color: "#F97316" },
  { slope: 25, color: "#EF4444" },
  { slope: 30, color: "#991B1B" },
  { slope: 40, color: "#222222" },
] as const;

export const getSlopeColor = (slope: number | null | undefined): string => {
  if (slope == null || !Number.isFinite(slope)) return "#6B7280";

  const clamped = Math.max(0, Math.min(40, slope));
  const upperIndex = SLOPE_COLOR_STOPS.findIndex(stop => clamped <= stop.slope);
  if (upperIndex <= 0) return SLOPE_COLOR_STOPS[0].color;

  const lower = SLOPE_COLOR_STOPS[upperIndex - 1];
  const upper = SLOPE_COLOR_STOPS[upperIndex];
  const ratio = (clamped - lower.slope) / (upper.slope - lower.slope);
  const lowerRgb = hexToRgb(lower.color);
  const upperRgb = hexToRgb(upper.color);

  return rgbToHex({
    r: lowerRgb.r + (upperRgb.r - lowerRgb.r) * ratio,
    g: lowerRgb.g + (upperRgb.g - lowerRgb.g) * ratio,
    b: lowerRgb.b + (upperRgb.b - lowerRgb.b) * ratio,
  });
};

export type CourseSlopeSegment = {
  courseId: string;
  index: number;
  coordinates: [GeoCoordinate, GeoCoordinate];
  slope: number | null;
};

export const createCourseSlopeSegments = (
  course: FinalizedCourseFeature,
): CourseSlopeSegment[] => {
  const { coordinates, slopeDeg } = course;
  if (coordinates.length < 2) return [];

  const canUsePointSlopes =
    slopeDeg != null &&
    slopeDeg.length === coordinates.length &&
    slopeDeg.every(slope => Number.isFinite(slope));

  return coordinates.slice(0, -1).map((coordinate, index) => {
    const fallbackSlope = course.properties.avgSlopeDegMap;
    const slope = canUsePointSlopes
      ? ((slopeDeg[index] as number) + (slopeDeg[index + 1] as number)) / 2
      : fallbackSlope;

    return {
      courseId: course.id,
      index,
      coordinates: [coordinate, coordinates[index + 1]],
      slope,
    };
  });
};
