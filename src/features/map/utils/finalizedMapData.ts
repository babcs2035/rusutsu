import L from "leaflet";
import {
  COURSE_DIFFICULTY_META,
  createCourseSlopeSegments,
  type FinalizedCourseFeature,
  type FinalizedLiftFeature,
  type GeoCoordinate,
  getCourseDifficulty,
  getPisteStyle,
  getSlopeColor,
  getStatusOpacity,
} from "@/lib/finalizedResortGeojsonShared";
import type {
  CourseColorMode,
  FinalizedLineFeature,
  FinalizedLineFeatureCollection,
} from "../types";

export const EMPTY_FINALIZED_COURSES: FinalizedCourseFeature[] = [];
export const EMPTY_FINALIZED_LIFTS: FinalizedLiftFeature[] = [];

export const toLatLngTuple = (coordinate: GeoCoordinate): L.LatLngTuple => [
  coordinate[1],
  coordinate[0],
];

export const getFeatureBounds = (coordinates: GeoCoordinate[]) =>
  L.latLngBounds(coordinates.map(toLatLngTuple));

export const getFinalizedMapDataBounds = (
  courses: FinalizedCourseFeature[],
  lifts: FinalizedLiftFeature[],
): L.LatLngBounds | null => {
  const coordinates = [
    ...courses.flatMap(course => course.coordinates),
    ...lifts.flatMap(lift => lift.coordinates),
  ];

  return coordinates.length > 0 ? getFeatureBounds(coordinates) : null;
};

export const getLiftStatusKind = (
  status: string | null | undefined,
): "open" | "limited" | "closed" | "unknown" => {
  if (/[○〇◯]/u.test(status ?? "")) return "open";
  if (/[△]/u.test(status ?? "")) return "limited";
  if (/[×✕✖]/u.test(status ?? "")) return "closed";
  return "unknown";
};

export const getFeatureStatusKind = getLiftStatusKind;

export const getPisteStatusKind = (
  piste: string | null | undefined,
): "open" | "limited" | "closed" | "unknown" => {
  if (/[○〇◯]/u.test(piste ?? "")) return "open";
  if (/[△]/u.test(piste ?? "")) return "limited";
  if (/[×✕✖]/u.test(piste ?? "")) return "closed";
  return "unknown";
};

type LiftStatusPalette = {
  baseColor: string;
  flowColor: string;
};

const LIFT_STATUS_PALETTE: Record<
  "open" | "limited" | "closed" | "unknown",
  LiftStatusPalette
> = {
  open: {
    baseColor: "#1E3A8A", // 濃い青・紺色
    flowColor: "#00ffff", // 明るい水色
  },
  limited: {
    baseColor: "#DC2626",
    flowColor: "#FFFFFF",
  },
  closed: {
    baseColor: "#64748B",
    flowColor: "#FFFFFF",
  },
  unknown: {
    baseColor: "#4F46E5",
    flowColor: "#FFFFFF",
  },
};

const getLiftStatusPalette = (
  status: string | null | undefined,
): LiftStatusPalette => LIFT_STATUS_PALETTE[getLiftStatusKind(status)];

const getLiftStatusColor = (status: string | null | undefined) =>
  getLiftStatusPalette(status).baseColor;

const getLiftFlowColor = (status: string | null | undefined) =>
  getLiftStatusPalette(status).flowColor;

const getSlopeSegmentPointStride = (zoom: number) => {
  if (zoom < 12) return 16;
  if (zoom < 13) return 12;
  if (zoom < 14) return 8;
  if (zoom < 15) return 6;
  if (zoom < 16) return 4;
  if (zoom < 17) return 2;
  return 1;
};

export const getLiftFlowDashLength = (zoom: number) => {
  const zoomScale = 1.3 ** Math.max(0, zoom - 11);
  return Number((6 * zoomScale).toFixed(2));
};

export const buildCourseFeatureCollection = (
  courses: FinalizedCourseFeature[],
  mode: CourseColorMode,
  zoom: number,
  showOpenOnly: boolean,
): FinalizedLineFeatureCollection => {
  if (mode === "slope") {
    const pointStride = getSlopeSegmentPointStride(zoom);
    return {
      type: "FeatureCollection",
      features: courses.flatMap<FinalizedLineFeature>(course => {
        const statusKind = getFeatureStatusKind(course.properties.status);
        if (showOpenOnly && statusKind !== "open") {
          return [
            {
              type: "Feature" as const,
              geometry: {
                type: "LineString" as const,
                coordinates: course.coordinates,
              },
              properties: {
                id: course.id,
                kind: "course" as const,
                sourceId: course.groupId,
                name: course.displayName,
                color: getSlopeColor(course.properties.avgSlopeDegMap),
                opacity: getStatusOpacity(course.properties.status),
                pisteStyle: getPisteStyle(course.properties.piste),
                pisteStatus: getPisteStatusKind(course.properties.piste),
                statusKind,
                segmented: false,
              },
            },
          ];
        }

        return createCourseSlopeSegments(course, pointStride).map(segment => ({
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: segment.coordinates,
          },
          properties: {
            id: `${course.id}-segment-${segment.index}`,
            kind: "course" as const,
            sourceId: course.groupId,
            name: course.displayName,
            color: getSlopeColor(segment.slope),
            opacity: getStatusOpacity(course.properties.status),
            pisteStyle: getPisteStyle(course.properties.piste),
            pisteStatus: getPisteStatusKind(course.properties.piste),
            statusKind,
            segmented: true,
          },
        }));
      }),
    };
  }

  return {
    type: "FeatureCollection",
    features: courses.map(course => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: course.coordinates,
      },
      properties: {
        id: course.id,
        kind: "course",
        sourceId: course.groupId,
        name: course.displayName,
        color:
          COURSE_DIFFICULTY_META[getCourseDifficulty(course.properties.level)]
            .color,
        opacity: getStatusOpacity(course.properties.status),
        pisteStyle: getPisteStyle(course.properties.piste),
        pisteStatus: getPisteStatusKind(course.properties.piste),
        statusKind: getFeatureStatusKind(course.properties.status),
      },
    })),
  };
};

const getLiftDisplayCoordinates = (lift: FinalizedLiftFeature) => {
  const first = lift.coordinates[0];
  const last = lift.coordinates[lift.coordinates.length - 1];
  const firstElevation = first?.[2];
  const lastElevation = last?.[2];

  if (
    typeof firstElevation === "number" &&
    typeof lastElevation === "number" &&
    firstElevation > lastElevation
  ) {
    return [...lift.coordinates].reverse();
  }

  return lift.coordinates;
};

const getLiftFlowSpeed = (
  speed: string | null | undefined,
): "slow" | "normal" | "fast" => {
  if (!speed) return "normal";
  if (/高速|high|fast|express/i.test(speed)) return "fast";
  if (/低速|slow/i.test(speed)) return "slow";
  return "normal";
};

export const buildLiftFeatureCollection = (
  lifts: FinalizedLiftFeature[],
): FinalizedLineFeatureCollection => ({
  type: "FeatureCollection",
  features: lifts.map(lift => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: getLiftDisplayCoordinates(lift),
    },
    properties: {
      id: lift.id,
      kind: "lift",
      sourceId: lift.id,
      name: lift.name,
      color: getLiftStatusColor(lift.properties.status),
      flowColor: getLiftFlowColor(lift.properties.status),
      opacity: getStatusOpacity(lift.properties.status),
      liftStatus: getLiftStatusKind(lift.properties.status),
      statusKind: getFeatureStatusKind(lift.properties.status),
      flowSpeed: getLiftFlowSpeed(lift.properties.speed),
    },
  })),
});

export const getUngroomedDashArray = (zoom: number) => {
  if (zoom >= 16) return "6 3";
  if (zoom >= 14) return "4 2";
  if (zoom >= 12) return "3 1.5";
  return "3 1.5";
};
