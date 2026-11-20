/** I/O と独立した，地図用 GeoJSON の地物と属性の変換処理． */
import {
  courseGroupingLabel,
  courseGroupingRoute,
  readCourseGrouping,
} from "@/shared/course-lift/identity";
import { normalizePropertySegments } from "@/shared/course-lift/segments";
import {
  type FinalizedCourseFeature,
  type FinalizedLiftFeature,
  type GeoCoordinate,
  normalizeNumber,
  parseFinalizedCourseName,
  resolveLiftMidstation,
} from "./finalizedResortGeojsonShared";

type GeoJsonFeature = {
  type: "Feature";
  geometry?: {
    type?: string;
    coordinates?: unknown;
  } | null;
  properties?: Record<string, unknown> | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  return typeof properties.entityId === "string"
    ? properties.entityId
    : `${kind}-${index}-${name}`;
};

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .map(normalizeString)
            .filter((name): name is string => name !== null),
        ),
      ]
    : [];

/** コースの座標・名称・属性を表示用の型に変換する． */
export const normalizeCourseFeature = (
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
  const name = normalizeString(properties.name) ?? "名前不明";
  const parsedName = parseFinalizedCourseName(name);
  const grouping = readCourseGrouping(properties.courseGrouping);
  const explicitGrouping = Object.hasOwn(properties, "courseGrouping");
  const baseId = createFeatureId("course", properties, index);
  const sourcePrefix = verificationStatus === "unverified" ? "osm-" : "";

  return {
    id: `${sourcePrefix}${baseId}`,
    originalName:
      normalizeString(properties.source_name) ??
      normalizeString(properties.name),
    recommendationGroupingInvalid:
      properties.courseGrouping != null &&
      (!grouping ||
        (isRecord(properties.courseGrouping) &&
          properties.courseGrouping.kind === "routes" &&
          ((properties.courseGrouping.route != null &&
            (!Number.isSafeInteger(properties.courseGrouping.route) ||
              Number(properties.courseGrouping.route) < 1)) ||
            (properties.courseGrouping.section != null &&
              (!Number.isSafeInteger(properties.courseGrouping.section) ||
                Number(properties.courseGrouping.section) < 1))))),
    coordinateDataInvalid:
      !Array.isArray(candidate.geometry.coordinates) ||
      candidate.geometry.coordinates.some(
        (c: unknown) =>
          !Array.isArray(c) ||
          c.length < 3 ||
          c.slice(0, 3).some(v => normalizeNumber(v) === null),
      ),
    name,
    displayName:
      grouping?.name ?? (explicitGrouping ? name : parsedName.displayName),
    groupId:
      grouping?.id ??
      (explicitGrouping
        ? `${sourcePrefix}${baseId}`
        : parsedName.sectionName === null
          ? `${sourcePrefix}${baseId}`
          : `${sourcePrefix}course-group-${parsedName.groupName}`),
    sectionName: grouping
      ? courseGroupingLabel(grouping)
      : explicitGrouping
        ? null
        : parsedName.sectionName,
    ...(grouping
      ? {
          sectionOrder: grouping.order,
          groupKind: grouping.kind,
          ...(grouping.kind === "routes"
            ? {
                routeKey: `${sourcePrefix}${grouping.id}:route:${courseGroupingRoute(grouping)}`,
              }
            : {}),
        }
      : {}),
    latestStatusName: normalizeString(properties.latest_status_name),
    statusSnapshotId: normalizeString(properties.status_snapshot_id),
    statusMappingNames: normalizeStringArray(properties.status_mapping_names),
    verificationStatus,
    sourceUrls,
    coordinates,
    properties: {
      name,
      level: normalizeString(properties.level),
      piste: normalizeString(properties.piste),
      pisteSegments: normalizePropertySegments(properties.pisteSegments),
      morningSegments: normalizePropertySegments(
        properties.morningSegments,
        false,
      ),
      nightSegments: normalizePropertySegments(properties.nightSegments, false),
      snowboard: normalizeString(properties.snowboard),
      status: normalizeString(properties.status),
      update: normalizeString(properties.update),
      latestNote: normalizeString(properties.latest_note),
      horizontalDistMap: normalizeNumber(properties.horizontal_dist_map),
      slopeDistMap: normalizeNumber(properties.slope_dist_map),
      elevationDiffMap: normalizeNumber(properties.elevation_diff_map),
      avgSlopeDegMap: normalizeNumber(properties.avg_slope_deg_map),
      maxSlopeDegMap: normalizeNumber(properties.max_slope_deg_map),
      maxWidth: normalizeNumber(properties.maxWidth),
      minWidth: normalizeNumber(properties.minWidth),
      note: normalizeString(properties.note),
      image: normalizeString(properties.image),
      youtubeUrl: normalizeString(properties.youtubeUrl),
      searchWord: normalizeString(properties.searchWord),
      morning: normalizeString(properties.morning),
      night: normalizeString(properties.night),
    },
  };
};

/** リフトの座標・名称・属性を表示用の型に変換する． */
export const normalizeLiftFeature = (
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
    statusSnapshotId: normalizeString(properties.status_snapshot_id),
    latestStatusName: normalizeString(properties.latest_status_name),
    statusMappingNames: normalizeStringArray(properties.status_mapping_names),
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
      image: normalizeString(properties.image),
      youtubeUrl: normalizeString(properties.youtubeUrl),
      morning: normalizeString(properties.morning),
      night: normalizeString(properties.night),
      midstation: resolveLiftMidstation(properties.midstation, coordinates),
    },
  };
};
