import type { MapCourse, MapLift, Prisma } from "@prisma/client";
import { featureIdentity } from "@/shared/course-lift/identity";
import type { MapFeature } from "./migrationPlan";

export const CANONICAL_MAP_MIGRATION_KEY = "map-canonical-v2";
export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const text = (value: unknown) =>
  typeof value === "string" ? value : null;
const numericText = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : text(value);
export const number = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
export const jsonValue = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const metrics = {
  horizontal_dist_map: "horizontalDistance",
  slope_dist_map: "slopeDistance",
  elevation_diff_map: "elevationDifference",
  avg_slope_deg_map: "calculatedAverageSlope",
  max_slope_deg_map: "calculatedMaxSlope",
} as const;
const columns = {
  name: "name",
  distance: "distance",
  level: "difficulty",
  avg: "angleAvg",
  max: "angleMax",
  type: "type",
  capacity: "capacity",
} as const;
export const courseAttributes = (properties: Record<string, unknown>) => ({
  piste: text(properties.piste),
  snowboard: text(properties.snowboard),
  morning: text(properties.morning),
  night: text(properties.night),
  note: text(properties.note),
  image: text(properties.image),
  youtubeUrl: text(properties.youtubeUrl),
  searchWord: text(properties.searchWord),
  maxWidth: number(properties.maxWidth),
  minWidth: number(properties.minWidth),
});
export const liftAttributes = (properties: Record<string, unknown>) => ({
  speed: text(properties.speed),
  hood: text(properties.hood),
  footrest: text(properties.footrest),
  towers: numericText(properties.towers),
  signal: text(properties.signal),
  oilShield: text(properties.oilShield),
  maker: text(properties.maker),
  year: numericText(properties.year),
  note: text(properties.note),
  searchWord: text(properties.searchWord),
  link: text(properties.link),
  image: text(properties.image),
  youtubeUrl: text(properties.youtubeUrl),
  morning: text(properties.morning),
  night: text(properties.night),
  vertical: number(properties.vertical),
  top: number(properties.top),
  bottom: number(properties.bottom),
});
export const mapDocumentKind = (key: string) => {
  const match =
    /^resorts-temporary\/(slope_before(?:_osm)?|slope_10m(?:_osm)?|lift_before|lift_20m|slope_detail|lift_detail|latest_status_mapping)\/([a-z0-9-]+)\.(geojson|json)$/u.exec(
      key,
    );
  if (!match) return null;
  const folder = match[1];
  return {
    resortId: match[2],
    kind: folder.startsWith("lift") ? ("lift" as const) : ("course" as const),
    sourceKind: folder.endsWith("_osm") ? "osm" : "curated",
    derived: /10m|20m/u.test(folder),
    mapping: folder === "latest_status_mapping",
    detail: folder.endsWith("_detail"),
    primaryKey: key
      .replace("slope_10m_osm/", "slope_before_osm/")
      .replace("slope_10m/", "slope_before/")
      .replace("lift_20m/", "lift_before/")
      .replace("slope_detail/", "slope_before/")
      .replace("lift_detail/", "lift_before/")
      .replace(/\.json$/u, ".geojson"),
  };
};

export function splitFeature(
  feature: MapFeature,
  documentKey: string,
  index: number,
) {
  const properties = { ...record(feature.properties) };
  const { geometry, properties: _properties, ...metadata } = feature;
  const id = featureIdentity(properties, documentKey, index);
  const capacity = number(properties.capacity);
  const fields = {
    name: text(properties.name),
    distance: number(properties.distance),
    difficulty: text(properties.level),
    angleAvg: number(properties.avg),
    angleMax: number(properties.max),
    type: text(properties.type),
    capacity:
      capacity !== null &&
      Number.isSafeInteger(capacity) &&
      Math.abs(capacity) <= 2147483647
        ? capacity
        : null,
  };
  const baseMetrics = splitDerivedFeature(feature, index);
  const kind = mapDocumentKind(documentKey)?.kind;
  const attributes =
    kind === "lift" ? liftAttributes(properties) : courseAttributes(properties);
  const indexedKeys = Object.keys(columns).filter(key =>
    kind === "lift"
      ? !["level", "avg", "max"].includes(key)
      : !["type", "capacity"].includes(key),
  );
  for (const key of [
    "entityId",
    ...indexedKeys,
    ...Object.keys(attributes),
    ...Object.keys(metrics),
  ])
    delete properties[key];
  // Unknown source attributes remain round-trippable; geometry and indexed fields do not.
  return { id, fields, geometry, properties, metadata, baseMetrics };
}

export function splitDerivedFeature(feature: MapFeature, index: number) {
  const properties = { ...record(feature.properties) };
  const { geometry, properties: _properties, ...metadata } = feature;
  const fields = {
    horizontalDistance: number(properties.horizontal_dist_map),
    slopeDistance: number(properties.slope_dist_map),
    elevationDifference: number(properties.elevation_diff_map),
    calculatedAverageSlope: number(properties.avg_slope_deg_map),
    calculatedMaxSlope: number(properties.max_slope_deg_map),
  };
  for (const key of [
    "entityId",
    "name",
    "courseGrouping",
    "slope_deg",
    ...Object.keys(columns),
    ...Object.keys(courseAttributes({})),
    ...Object.keys(liftAttributes({})),
    ...Object.keys(metrics),
  ])
    delete properties[key];
  const coordinates = record(geometry).coordinates;
  const elevationReady =
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    coordinates.every(
      point => Array.isArray(point) && Number.isFinite(point[2]),
    );
  return {
    derivedGeometry: geometry,
    derivedIndex: index,
    derivedProperties: properties,
    derivedMetadata: metadata,
    elevationReady,
    ...fields,
  };
}

export function entityFeature(
  row: MapCourse | MapLift,
  derived = false,
): MapFeature {
  const values = row as unknown as Record<string, unknown>;
  const properties = {
    ...record(derived ? row.derivedProperties : row.properties),
    entityId: row.id,
  } as Record<string, unknown>;
  if (!derived) {
    const attributes =
      "sourceKind" in row ? courseAttributes({}) : liftAttributes({});
    for (const key of Object.keys(attributes)) properties[key] = values[key];
  }
  for (const [key, column] of Object.entries(derived ? metrics : columns)) {
    if (column in values) properties[key] = values[column];
  }
  if (!derived && row.elevationReady && row.derivedIndex === null) {
    for (const [key, column] of Object.entries(metrics))
      properties[key] = values[column];
  }
  properties.name = row.name;
  if (derived) {
    const grouping = record(row.properties).courseGrouping;
    if (grouping !== undefined) properties.courseGrouping = grouping;
  }
  return {
    ...record(derived ? row.derivedMetadata : row.featureMetadata),
    type: "Feature",
    properties,
    geometry: (derived
      ? row.derivedGeometry
      : row.geometry) as MapFeature["geometry"],
  };
}
