import { promises as fs } from "node:fs";
import path from "node:path";
import { readResolvedLatestStatusMapping } from "@/features/latest-status-mapping/server/mappingFiles";
import type { ResolvedLatestStatusMapping } from "@/features/latest-status-mapping/types";
import { createMapCourseStatusSummary } from "@/features/resort-detail/utils/courseStatusSummary";
import { createCourseStatusSummary } from "./courseStatusSummary";
import {
  normalizeCourseFeature,
  normalizeLiftFeature,
} from "./finalizedMapFeatures";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
  FinalizedResortMapData,
  ResortMapSection,
} from "./finalizedResortGeojsonShared";
import {
  type LatestSuccessfulStatus,
  loadLatestSuccessfulStatus,
  selectLatestStatusFile as selectLatestTimestampedStatusFile,
} from "./latestStatusFiles";
import {
  createBaseNameIndex,
  type MergeIssue,
  matchBaseName,
  mergeCourseFeatures,
  mergeLiftFeatures,
  type RawGeoFeature,
} from "./resortMapMerge";

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: unknown[];
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

/** 統合保存用。元の線と標高付きの線を分け、基本情報だけを埋め込む。 */
export async function loadResortGeometryForMerge(
  resortId: string,
  roots: ResolvedResortMapDataRoots,
) {
  const collections: Record<string, RawGeoFeature[]> = {};
  for (const [primary, fallback, kind] of [
    ["slope_10m", "slope_before", "course"],
    ["slope_10m_osm", "slope_before_osm", "course"],
    ["lift_20m", "lift_before", "lift"],
  ] as const) {
    const geometry = await readKindGeometry(
      resortId,
      roots.temporaryRoot,
      primary,
      fallback,
      roots.documentLoader,
    );
    if (!geometry) continue;
    const base =
      fallback === "slope_before_osm"
        ? null
        : await (kind === "course" ? loadCourseBase : loadLiftBase)(
            resortId,
            roots.temporaryRoot,
            geometry.beforeFeatures,
            roots.documentLoader,
          );
    const baseById = new Map(
      (base?.items ?? [])
        .filter(item => typeof item.entityId === "string")
        .map(item => [item.entityId, item]),
    );
    const baseByName = new Map(
      (base?.items ?? []).map(item => [String(item.name), item]),
    );
    const index = createBaseNameIndex(baseByName.keys());
    const enrich = (features: RawGeoFeature[]) =>
      features.map(feature => {
        const name = feature.properties.name;
        const matched =
          typeof name === "string" ? matchBaseName(index, name, kind) : null;
        const properties = {
          ...feature.properties,
          ...(typeof feature.properties.entityId === "string"
            ? baseById.get(feature.properties.entityId)
            : matched
              ? baseByName.get(matched)
              : undefined),
          name,
        };
        // 営業状況は統合先のクローラーで更新する。保存時の状態を固定しない。
        for (const key of ["status", "update", "latest_note", "source_name"])
          delete (properties as Record<string, unknown>)[key];
        return { ...feature, properties };
      });
    collections[fallback] = enrich(
      geometry.beforeFeatures ?? geometry.features,
    );
    if (geometry.source === primary)
      collections[primary] = enrich(geometry.features);
  }
  return collections;
}

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
  // OSM 由来のコースは、営業状況の出典ではなく形だけの取り込み元なので、
  // 画面の「出典」に混ぜない。未確認であることは verificationStatus が持つ。
  const sourceUrls = isOsm ? [] : (status?.sourceUrls ?? []);
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
      observedAt: status?.time ?? null,
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
      observedAt: status?.time ?? null,
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
      observedAt: status?.time ?? null,
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

  const mapCourseSummary = createMapCourseStatusSummary(courses.section);
  const courseStatusSummary = mapCourseSummary
    ? { ...mapCourseSummary, sourceLabels: courseStatus?.sourceLabels }
    : createCourseStatusSummary(courseStatus, [], false);
  if (!courses.section && !lifts.section && !courseStatusSummary)
    return { data: null, report };

  return {
    data: {
      courses: courses.section,
      lifts: lifts.section,
      courseStatusSummary,
    },
    report,
  };
};

export const getResortMapDataFromRoots = async (
  resortId: string,
  roots: ResortMapDataRoots,
): Promise<FinalizedResortMapData | null> =>
  (await buildResortMapData(resortId, roots)).data;

export const getFinalizedResortMapDataSnapshot = async (resortId: string) => {
  const { readCanonicalResortMap } = await import(
    "@/server/course-lift/mapData"
  );
  const canonical = await readCanonicalResortMap(resortId);
  if (canonical.enabled)
    return {
      data: canonical.data,
      canonicalEnabled: true,
      revision: canonical.revision ?? null,
    };
  return {
    data: await getResortMapDataFromRoots(resortId, {
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
    }),
    canonicalEnabled: false,
    revision: null,
  };
};

export const getFinalizedResortMapData = async (resortId: string) =>
  (await getFinalizedResortMapDataSnapshot(resortId)).data;
