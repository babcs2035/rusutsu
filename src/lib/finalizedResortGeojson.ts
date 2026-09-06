import { promises as fs } from "node:fs";
import path from "node:path";
import { readResolvedLatestStatusMapping } from "@/features/latest-status-mapping/server/mappingFiles";
import type { ResolvedLatestStatusMapping } from "@/features/latest-status-mapping/types";
import { calculateCoordinateSlopes } from "./finalizedResortGeojsonShared";
import {
  type LatestSuccessfulStatus,
  loadLatestSuccessfulStatus,
  selectLatestStatusFile as selectLatestTimestampedStatusFile,
} from "./latestStatusFiles";
import {
  type MergeIssue,
  mergeCourseFeatures,
  mergeLiftFeatures,
  type RawGeoFeature,
} from "./resortMapMerge";

export type GeoCoordinate = [number, number] | [number, number, number];

export type FinalizedCourseFeature = {
  id: string;
  name: string;
  displayName: string;
  groupId: string;
  sectionName: string | null;
  /** 人手確認済みの既存データか、未確認のOSM由来か。 */
  verificationStatus?: "verified" | "unverified";
  sourceUrls?: string[];
  coordinates: GeoCoordinate[];
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
    searchWord: string | null;
    morning: string | null;
    night: string | null;
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
    searchWord: string | null;
    link: string | null;
    morning: string | null;
    night: string | null;
  };
};

export type ResortMapSection<TFeature> = {
  /** 線を取ってきた場所 */
  source:
    | "slope_10m"
    | "slope_before"
    | "slope_10m_osm"
    | "slope_before_osm"
    | "mixed"
    | "lift_20m"
    | "lift_before";
  /** 基本情報を取ってきた場所 */
  baseSource:
    | "slope_before"
    | "slope_before_osm"
    | "slope_detail"
    | "lift_before"
    | "lift_detail"
    | "mixed"
    | null;
  fileName: string;
  /** 公式サイトの出典（latest_data の courseUrl / liftUrl） */
  sourceUrls: string[];
  verificationStatus?: "verified" | "unverified" | "mixed";
  features: TFeature[];
};

export type FinalizedResortMapData = {
  courses: ResortMapSection<FinalizedCourseFeature> | null;
  lifts: ResortMapSection<FinalizedLiftFeature> | null;
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
  verificationStatus: "verified" | "unverified" = "verified",
  sourceUrls: string[] = [],
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
  const baseId = createFeatureId("course", properties, index);
  const sourcePrefix = verificationStatus === "unverified" ? "osm-" : "";

  return {
    id: `${sourcePrefix}${baseId}`,
    name,
    displayName: parsedName.displayName,
    groupId:
      parsedName.sectionName === null
        ? `${sourcePrefix}${baseId}`
        : `${sourcePrefix}course-group-${parsedName.groupName}`,
    sectionName: parsedName.sectionName,
    verificationStatus,
    sourceUrls,
    coordinates,
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
      searchWord: normalizeString(properties.searchWord),
      morning: normalizeString(properties.morning),
      night: normalizeString(properties.night),
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
      searchWord: normalizeString(properties.searchWord),
      link: normalizeString(properties.link),
      morning: normalizeString(properties.morning),
      night: normalizeString(properties.night),
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

const resolveTemporaryFile = (
  kind: string,
  fileName: string,
  temporaryRoot: string,
) => {
  const directory = path.resolve(temporaryRoot, kind);
  const resolved = path.resolve(directory, fileName);
  if (!resolved.startsWith(`${directory}${path.sep}`)) return null;
  return resolved;
};

type ResortDataDocumentLoader = (
  absoluteFilePath: string,
) => Promise<string | null>;

const readJsonFile = async <T>(
  filePath: string,
  documentLoader?: ResortDataDocumentLoader,
): Promise<T | null> => {
  try {
    const raw = documentLoader
      ? await documentLoader(filePath)
      : await fs.readFile(filePath, "utf8");
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Failed to read resort data file", { filePath, error });
    }
    return null;
  }
};

const readGeoJsonFeatures = async (
  filePath: string,
  documentLoader?: ResortDataDocumentLoader,
): Promise<RawGeoFeature[] | null> => {
  const parsed = await readJsonFile<unknown>(filePath, documentLoader);
  if (parsed === null) return null;

  try {
    const collection = parseFeatureCollection(parsed);
    const features = collection.features.filter(isRecord).map(feature => ({
      type: "Feature" as const,
      geometry: (feature.geometry ?? null) as RawGeoFeature["geometry"],
      properties: isRecord(feature.properties) ? feature.properties : {},
    }));
    return features.length > 0 ? features : null;
  } catch (error) {
    console.warn("Failed to parse resort GeoJSON", { filePath, error });
    return null;
  }
};

/**
 * latest_data の最新ファイル。
 *
 * Python 側は mtime で選んでいるが、git clone すると mtime は揃ってしまう。
 * ファイル名が時刻そのものなので、そちらから選ぶ。
 */
export const selectLatestStatusFile = (fileNames: string[]): string | null => {
  return selectLatestTimestampedStatusFile(fileNames);
};

const toRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

/** *_before に基本情報まで入っているかどうかで、基本情報の出どころを決める */
const hasAnyKey = (items: Record<string, unknown>[], keys: readonly string[]) =>
  items.some(item => keys.some(key => item[key] !== undefined));

const COURSE_BASE_KEYS = [
  "level",
  "piste",
  "snowboard",
  "avg",
  "max",
  "distance",
  "image",
  "searchWord",
] as const;

const LIFT_BASE_KEYS = [
  "type",
  "speed",
  "capacity",
  "hood",
  "distance",
  "vertical",
  "searchWord",
] as const;

type BaseSourceResult<TLabel> = {
  items: Record<string, unknown>[];
  label: TLabel;
  /** 人手で整備済みの基本情報か（欠損チェックを走らせるかの判断に使う） */
  isCurated: boolean;
} | null;

const loadCourseBase = async (
  resortId: string,
  temporaryRoot: string,
  beforeFeatures: RawGeoFeature[] | null,
  documentLoader?: ResortDataDocumentLoader,
): Promise<BaseSourceResult<"slope_before" | "slope_detail">> => {
  const beforeItems = (beforeFeatures ?? []).map(feature => feature.properties);
  if (hasAnyKey(beforeItems, COURSE_BASE_KEYS)) {
    return { items: beforeItems, label: "slope_before", isCurated: true };
  }

  const detailPath = resolveTemporaryFile(
    "slope_detail",
    `${resortId}.json`,
    temporaryRoot,
  );
  const detail = detailPath
    ? await readJsonFile<unknown>(detailPath, documentLoader)
    : null;
  const detailItems = toRecordArray(detail);
  if (detailItems.length > 0) {
    return { items: detailItems, label: "slope_detail", isCurated: true };
  }

  return beforeItems.length > 0
    ? { items: beforeItems, label: "slope_before", isCurated: false }
    : null;
};

const loadLiftBase = async (
  resortId: string,
  temporaryRoot: string,
  beforeFeatures: RawGeoFeature[] | null,
  documentLoader?: ResortDataDocumentLoader,
): Promise<BaseSourceResult<"lift_before" | "lift_detail">> => {
  const beforeItems = (beforeFeatures ?? []).map(feature => feature.properties);
  if (hasAnyKey(beforeItems, LIFT_BASE_KEYS)) {
    return { items: beforeItems, label: "lift_before", isCurated: true };
  }

  const detailPath = resolveTemporaryFile(
    "lift_detail",
    `${resortId}.json`,
    temporaryRoot,
  );
  const detail = detailPath
    ? await readJsonFile<unknown>(detailPath, documentLoader)
    : null;
  const detailItems = toRecordArray(detail);
  if (detailItems.length > 0) {
    return { items: detailItems, label: "lift_detail", isCurated: true };
  }

  return beforeItems.length > 0
    ? { items: beforeItems, label: "lift_before", isCurated: false }
    : null;
};

export type ResortMapDataRoots = {
  temporaryRoot: string;
  documentLoader?: ResortDataDocumentLoader;
  latestStatusLoader?: (
    resortId: string,
    kind: "courses" | "lifts",
  ) => Promise<LatestSuccessfulStatus | null>;
};

type ResolvedResortMapDataRoots = {
  temporaryRoot: string;
  documentLoader?: ResortDataDocumentLoader;
};

export type ResortMergeReport = {
  resortId: string;
  courses: MergeIssue[];
  lifts: MergeIssue[];
};

const readKindGeometry = async (
  resortId: string,
  temporaryRoot: string,
  primary: "slope_10m" | "slope_10m_osm" | "lift_20m",
  fallback: "slope_before" | "slope_before_osm" | "lift_before",
  documentLoader?: ResortDataDocumentLoader,
) => {
  const primaryPath = resolveTemporaryFile(
    primary,
    `${resortId}.geojson`,
    temporaryRoot,
  );
  const fallbackPath = resolveTemporaryFile(
    fallback,
    `${resortId}.geojson`,
    temporaryRoot,
  );
  const beforeFeatures = fallbackPath
    ? await readGeoJsonFeatures(fallbackPath, documentLoader)
    : null;
  const primaryFeatures = primaryPath
    ? await readGeoJsonFeatures(primaryPath, documentLoader)
    : null;

  if (primaryFeatures) {
    return {
      source: primary,
      fileName: `${resortId}.geojson`,
      features: primaryFeatures,
      beforeFeatures,
    };
  }
  if (beforeFeatures) {
    return {
      source: fallback,
      fileName: `${resortId}.geojson`,
      features: beforeFeatures,
      beforeFeatures,
    };
  }
  return null;
};

const buildCourseSourceSection = async (
  resortId: string,
  roots: ResolvedResortMapDataRoots,
  status: LatestSuccessfulStatus | null,
  statusMapping: ResolvedLatestStatusMapping,
  sourceKind: "curated" | "osm",
) => {
  const { documentLoader, temporaryRoot } = roots;
  const geometry =
    sourceKind === "curated"
      ? await readKindGeometry(
          resortId,
          temporaryRoot,
          "slope_10m",
          "slope_before",
          documentLoader,
        )
      : await readKindGeometry(
          resortId,
          temporaryRoot,
          "slope_10m_osm",
          "slope_before_osm",
          documentLoader,
        );
  if (!geometry) return null;

  const isOsm = sourceKind === "osm";
  const base = isOsm
    ? ({
        items: (geometry.beforeFeatures ?? []).map(
          feature => feature.properties,
        ),
        label: "slope_before_osm" as const,
        isCurated: false,
      } satisfies NonNullable<BaseSourceResult<"slope_before_osm">>)
    : await loadCourseBase(
        resortId,
        temporaryRoot,
        geometry.beforeFeatures,
        documentLoader,
      );
  const sourceUrls = isOsm
    ? ["https://www.openstreetmap.org/copyright"]
    : (status?.sourceUrls ?? []);
  const verificationStatus = isOsm ? "unverified" : "verified";
  const merged = mergeCourseFeatures({
    geometryFeatures: geometry.features,
    baseItems: base?.items ?? [],
    statusItems: status?.items ?? [],
    statusMapping,
    baseSourceLabel: base?.label ?? "slope_detail",
    hasStatusSource: (status?.items.length ?? 0) > 0,
    validateBaseFields: base?.isCurated === true,
  });

  const features = merged.features
    .map((feature, index) =>
      normalizeCourseFeature(feature, index, verificationStatus, sourceUrls),
    )
    .filter((feature): feature is FinalizedCourseFeature => feature !== null);
  if (features.length === 0) return { section: null, issues: merged.issues };

  return {
    section: {
      source: geometry.source,
      baseSource: base?.label ?? null,
      fileName: status?.fileName ?? geometry.fileName,
      sourceUrls,
      verificationStatus,
      features,
    } satisfies ResortMapSection<FinalizedCourseFeature>,
    issues: merged.issues,
  };
};

const buildCourseSection = async (
  resortId: string,
  roots: ResolvedResortMapDataRoots,
  status: LatestSuccessfulStatus | null,
  statusMapping: ResolvedLatestStatusMapping,
) => {
  const [curated, osm] = await Promise.all([
    buildCourseSourceSection(resortId, roots, status, statusMapping, "curated"),
    buildCourseSourceSection(resortId, roots, status, statusMapping, "osm"),
  ]);

  if (!curated && !osm) {
    return { section: null, issues: [] as MergeIssue[] };
  }
  if (!curated) {
    return osm ?? { section: null, issues: [] as MergeIssue[] };
  }
  if (!osm) return curated;
  if (!curated.section) return osm;
  if (!osm.section) return curated;

  return {
    section: {
      source: "mixed",
      baseSource: "mixed",
      fileName: status?.fileName ?? curated.section.fileName,
      sourceUrls: [
        ...new Set([...curated.section.sourceUrls, ...osm.section.sourceUrls]),
      ],
      verificationStatus: "mixed",
      features: [...curated.section.features, ...osm.section.features],
    } satisfies ResortMapSection<FinalizedCourseFeature>,
    issues: [...curated.issues, ...osm.issues],
  };
};

const buildLiftSection = async (
  resortId: string,
  roots: ResolvedResortMapDataRoots,
  status: LatestSuccessfulStatus | null,
  statusMapping: ResolvedLatestStatusMapping,
) => {
  const { documentLoader, temporaryRoot } = roots;
  const geometry = await readKindGeometry(
    resortId,
    temporaryRoot,
    "lift_20m",
    "lift_before",
    documentLoader,
  );
  if (!geometry) return { section: null, issues: [] as MergeIssue[] };

  const base = await loadLiftBase(
    resortId,
    temporaryRoot,
    geometry.beforeFeatures,
    documentLoader,
  );
  const merged = mergeLiftFeatures({
    geometryFeatures: geometry.features,
    baseItems: base?.items ?? [],
    statusItems: status?.items ?? [],
    statusMapping,
    baseSourceLabel: base?.label ?? "lift_detail",
    hasStatusSource: (status?.items.length ?? 0) > 0,
    validateBaseFields: base?.isCurated === true,
  });

  const features = merged.features
    .map(normalizeLiftFeature)
    .filter((feature): feature is FinalizedLiftFeature => feature !== null);
  if (features.length === 0) return { section: null, issues: merged.issues };

  return {
    section: {
      source: geometry.source,
      baseSource: base?.label ?? null,
      fileName: status?.fileName ?? geometry.fileName,
      sourceUrls: status?.sourceUrls ?? [],
      features,
    } satisfies ResortMapSection<FinalizedLiftFeature>,
    issues: merged.issues,
  };
};

/**
 * 表示用データと、突き合わせで見つかった問題を一緒に返す。
 * 画面側は data だけ使い、report は検証スクリプトが使う。
 */
export const buildResortMapData = async (
  resortId: string,
  roots: ResortMapDataRoots,
): Promise<{
  data: FinalizedResortMapData | null;
  report: ResortMergeReport;
}> => {
  const report: ResortMergeReport = { resortId, courses: [], lifts: [] };
  if (!isSafeResortId(resortId)) return { data: null, report };

  const resolvedRoots = {
    temporaryRoot: roots.temporaryRoot,
    documentLoader: roots.documentLoader,
  };
  const latestStatusLoader =
    roots.latestStatusLoader ??
    ((id: string, kind: "courses" | "lifts") =>
      loadLatestSuccessfulStatus(roots.temporaryRoot, id, kind));
  const [courseStatus, liftStatus, courseStatusMapping, liftStatusMapping] =
    await Promise.all([
      latestStatusLoader(resortId, "courses"),
      latestStatusLoader(resortId, "lifts"),
      readResolvedLatestStatusMapping(
        roots.temporaryRoot,
        resortId,
        "courses",
        roots.documentLoader,
      ),
      readResolvedLatestStatusMapping(
        roots.temporaryRoot,
        resortId,
        "lifts",
        roots.documentLoader,
      ),
    ]);
  const [courses, lifts] = await Promise.all([
    buildCourseSection(
      resortId,
      resolvedRoots,
      courseStatus,
      courseStatusMapping,
    ),
    buildLiftSection(resortId, resolvedRoots, liftStatus, liftStatusMapping),
  ]);

  report.courses = courses.issues;
  report.lifts = lifts.issues;

  if (!courses.section && !lifts.section) return { data: null, report };

  return {
    data: { courses: courses.section, lifts: lifts.section },
    report,
  };
};

export const getResortMapDataFromRoots = async (
  resortId: string,
  roots: ResortMapDataRoots,
): Promise<FinalizedResortMapData | null> =>
  (await buildResortMapData(resortId, roots)).data;

export const getFinalizedResortMapData = (resortId: string) => {
  return getResortMapDataFromRoots(resortId, {
    temporaryRoot: TEMPORARY_RESORTS_ROOT,
    documentLoader: async absoluteFilePath => {
      const dataRoot = path.resolve(
        /* turbopackIgnore: true */ process.cwd(),
        "src/private/data",
      );
      const relativePath = path.relative(dataRoot, absoluteFilePath);
      if (
        relativePath === "" ||
        relativePath === ".." ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
      ) {
        return null;
      }
      const key = relativePath.split(path.sep).join("/");
      const { getDataDocument } = await import(
        "@/server/data-documents/client"
      );
      return (await getDataDocument(key))?.content ?? null;
    },
    latestStatusLoader: async (id, kind) => {
      const { readCurrentCrawlLatestStatus } = await import(
        "./crawlLatestCurrent"
      );
      return readCurrentCrawlLatestStatus(id, kind);
    },
  });
};

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
  intermediateAdvanced: { label: "中・上級", color: "#B45309" },
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
  const { coordinates } = course;
  if (coordinates.length < 2) return [];
  const pointSlopes = calculateCoordinateSlopes(coordinates);

  return coordinates.slice(0, -1).map((coordinate, index) => {
    const fallbackSlope = course.properties.avgSlopeDegMap;
    const segmentSlopes = [pointSlopes[index], pointSlopes[index + 1]].filter(
      (slope): slope is number => slope !== null,
    );
    const slope =
      segmentSlopes.length > 0
        ? segmentSlopes.reduce((sum, value) => sum + value, 0) /
          segmentSlopes.length
        : fallbackSlope;

    return {
      courseId: course.id,
      index,
      coordinates: [coordinate, coordinates[index + 1]],
      slope,
    };
  });
};
