import { isDeepStrictEqual } from "node:util";
import {
  type BaseNameIndex,
  createBaseNameIndex,
  matchBaseName,
  stripKindWord,
} from "../../src/lib/resortMapMerge";
import type { SheetRow } from "./xlsxReader";

export type ResortSheetKind = "course" | "lift";

export type GeoJsonFeature = {
  type: "Feature";
  properties?: Record<string, unknown> | null;
  geometry?: unknown;
  [key: string]: unknown;
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
  [key: string]: unknown;
};

const NUMERIC_FIELDS = new Set([
  "distance",
  "maxWidth",
  "minWidth",
  "avg",
  "max",
  "capacity",
  "vertical",
  "top",
  "bottom",
  "towers",
  "year",
]);

const MEASURED_FIELDS = new Set([
  "horizontal_dist_map",
  "slope_dist_map",
  "elevation_diff_map",
  "avg_slope_deg_map",
  "max_slope_deg_map",
  "midstation",
  "slope_deg",
]);

const trimmed = (row: SheetRow, key: string): string => (row[key] ?? "").trim();

/**
 * Excel の行を使う条件。
 *
 * コースは piste、リフトは主に searchWord で対象になる。どちらも空なら、
 * 名前などが入っていても GeoJSON へ混ぜない。
 */
export const isLinkableSheetRow = (row: SheetRow): boolean =>
  trimmed(row, "name").length > 0 &&
  (trimmed(row, "piste").length > 0 || trimmed(row, "searchWord").length > 0);

const hasStoredValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  return typeof value !== "string" || value.trim().length > 0;
};

const toStoredValue = (key: string, value: string): string | number => {
  if (!NUMERIC_FIELDS.has(key) || value.trim().length === 0) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const normalizeSheetRow = (row: SheetRow): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, toStoredValue(key, value)]),
  );

const normalizeLooseName = (name: string): string =>
  stripKindWord(name.normalize("NFKC").replace(/_#/gu, "_"))
    .replace(/\s+/gu, " ")
    .trim();

/** 通常規則で見つからない場合だけ、表記差を正規化した一意候補を使う。 */
const matchDataName = (
  index: BaseNameIndex,
  names: Iterable<string>,
  name: string,
  kind: ResortSheetKind,
): string | null => {
  const direct = matchBaseName(index, name, kind);
  if (direct) return direct;

  const target = normalizeLooseName(name);
  const candidates = [...names];
  const exactMatches = candidates.filter(
    candidate => normalizeLooseName(candidate) === target,
  );
  if (exactMatches.length === 1) return exactMatches[0] ?? null;

  // 「ルスツ イゾラ第5ペア」のようなスキー場名付き表記も、一意なときだけ扱う。
  const suffixMatches = candidates.filter(candidate => {
    const normalized = normalizeLooseName(candidate);
    return (
      normalized.endsWith(` ${target}`) || target.endsWith(` ${normalized}`)
    );
  });
  return suffixMatches.length === 1 ? (suffixMatches[0] ?? null) : null;
};

export type SheetMergeResult = {
  collection: GeoJsonFeatureCollection;
  eligibleRows: number;
  skippedRows: number;
  matchedRows: number;
  matchedFeatures: number;
  changedFeatures: number;
  unmatchedRowNames: string[];
};

/**
 * Excel の適格行を *_before へ統合する。
 *
 * 既存の非空値は人手で更新された可能性があるため優先し、未設定・空欄だけを
 * Excel で補完する。GeoJSON 側の内部名は分割線を表すため上書きしない。
 */
export const mergeSheetRowsIntoBefore = (
  collection: GeoJsonFeatureCollection,
  rows: SheetRow[],
  kind: ResortSheetKind,
): SheetMergeResult => {
  const namedRows = rows.filter(row => trimmed(row, "name").length > 0);
  const eligibleRows = namedRows.filter(isLinkableSheetRow);
  const rowByName = new Map<string, SheetRow>();
  for (const row of eligibleRows) rowByName.set(trimmed(row, "name"), row);

  const nameIndex = createBaseNameIndex(rowByName.keys());
  const usedRowNames = new Set<string>();
  let matchedFeatures = 0;
  let changedFeatures = 0;

  const features = collection.features.map(feature => {
    const properties = feature.properties ?? {};
    const featureName = properties.name;
    if (typeof featureName !== "string" || featureName.length === 0) {
      return feature;
    }

    const matchedName = matchDataName(
      nameIndex,
      rowByName.keys(),
      featureName,
      kind,
    );
    if (!matchedName) return feature;

    const row = rowByName.get(matchedName);
    if (!row) return feature;
    usedRowNames.add(matchedName);
    matchedFeatures += 1;

    const nextProperties = { ...properties };
    for (const [key, value] of Object.entries(normalizeSheetRow(row))) {
      if (key === "name") continue;
      if (hasStoredValue(nextProperties[key])) continue;
      nextProperties[key] = value;
    }
    // 分割コースなどでは Excel と GeoJSON の名前が異なるため、必ず元名を保つ。
    nextProperties.name = featureName;

    if (isDeepStrictEqual(nextProperties, properties)) return feature;
    changedFeatures += 1;
    return { ...feature, properties: nextProperties };
  });

  return {
    collection: { ...collection, features },
    eligibleRows: eligibleRows.length,
    skippedRows: namedRows.length - eligibleRows.length,
    matchedRows: usedRowNames.size,
    matchedFeatures,
    changedFeatures,
    unmatchedRowNames: [...rowByName.keys()].filter(
      name => !usedRowNames.has(name),
    ),
  };
};

export type BeforeSyncResult = {
  collection: GeoJsonFeatureCollection;
  matchedFeatures: number;
  changedFeatures: number;
  unmatchedFeatureNames: string[];
};

/** *_before の基本情報を、座標・標高計算済みの *_10m / *_20m へ同期する。 */
export const syncBeforePropertiesToMeasured = (
  measured: GeoJsonFeatureCollection,
  before: GeoJsonFeatureCollection,
  kind: ResortSheetKind,
): BeforeSyncResult => {
  const beforeByName = new Map<string, Record<string, unknown>>();
  for (const feature of before.features) {
    const properties = feature.properties ?? {};
    const name = properties.name;
    if (typeof name === "string" && name.length > 0) {
      beforeByName.set(name, properties);
    }
  }
  const nameIndex = createBaseNameIndex(beforeByName.keys());

  let matchedFeatures = 0;
  let changedFeatures = 0;
  const unmatchedFeatureNames: string[] = [];
  const features = measured.features.map(feature => {
    const properties = feature.properties ?? {};
    const featureName = properties.name;
    if (typeof featureName !== "string" || featureName.length === 0) {
      return feature;
    }

    const matchedName = matchDataName(
      nameIndex,
      beforeByName.keys(),
      featureName,
      kind,
    );
    const beforeProperties = matchedName
      ? beforeByName.get(matchedName)
      : undefined;
    if (!beforeProperties) {
      unmatchedFeatureNames.push(featureName);
      return feature;
    }
    matchedFeatures += 1;

    const nextProperties = { ...properties };
    for (const [key, value] of Object.entries(beforeProperties)) {
      if (key === "name" || MEASURED_FIELDS.has(key)) continue;
      nextProperties[key] = value;
    }
    nextProperties.name = featureName;

    if (isDeepStrictEqual(nextProperties, properties)) return feature;
    changedFeatures += 1;
    return { ...feature, properties: nextProperties };
  });

  return {
    collection: { ...measured, features },
    matchedFeatures,
    changedFeatures,
    unmatchedFeatureNames,
  };
};
