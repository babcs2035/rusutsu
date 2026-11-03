import { createMapCourseStatusSummary } from "@/features/resort-detail/utils/courseStatusSummary";
import type { FinalizedResortMapData } from "./finalizedResortGeojsonShared";
import type { LatestSuccessfulStatus } from "./latestStatusFiles";
import { createOperationStatusResolver } from "./operationStatusResolver";

export const CURRENT_MAP_OPERATION_VERSION = 2;

/** 採用済みカテゴリの中で、対応先を一意に特定できた場合だけ状態を使う。 */
export function createCurrentOperationProjector(
  current: LatestSuccessfulStatus | null,
) {
  const resolve = createOperationStatusResolver(current?.items);
  return (names: string[] | undefined) => {
    const { item: match, status } = resolve(names);
    return {
      latestStatusName: typeof match?.name === "string" ? match.name : null,
      status,
      update: typeof match?.update === "string" ? match.update : null,
      latestNote: typeof match?.note === "string" ? match.note : null,
    };
  };
}

/** 地図に残る過去の営業情報は使わず、採用済みの現在値だけを対応付ける。 */
export function applyCurrentMapOperations(
  data: FinalizedResortMapData | null,
  currents: Record<"courses" | "lifts", LatestSuccessfulStatus | null>,
): FinalizedResortMapData | null {
  if (!data) return null;
  const courseProjector = createCurrentOperationProjector(currents.courses);
  const liftProjector = createCurrentOperationProjector(currents.lifts);
  const courses = data.courses
    ? {
        ...data.courses,
        observedAt: currents.courses?.time ?? null,
        sourceUrls: currents.courses?.sourceUrls ?? [],
        features: data.courses.features.map(feature => {
          const { latestStatusName, ...properties } = courseProjector(
            feature.statusMappingNames,
          );
          return {
            ...feature,
            latestStatusName,
            statusSnapshotId: null,
            sourceUrls: currents.courses?.sourceUrls ?? [],
            properties: { ...feature.properties, ...properties },
          };
        }),
      }
    : null;
  const lifts = data.lifts
    ? {
        ...data.lifts,
        observedAt: currents.lifts?.time ?? null,
        sourceUrls: currents.lifts?.sourceUrls ?? [],
        features: data.lifts.features.map(feature => {
          const { latestStatusName, ...properties } = liftProjector(
            feature.statusMappingNames,
          );
          return {
            ...feature,
            latestStatusName,
            statusSnapshotId: null,
            properties: { ...feature.properties, ...properties },
          };
        }),
      }
    : null;
  const summary = createMapCourseStatusSummary(courses);
  return {
    ...data,
    courses,
    lifts,
    courseStatusSummary: summary
      ? { ...summary, sourceLabels: currents.courses?.sourceLabels }
      : null,
  };
}
