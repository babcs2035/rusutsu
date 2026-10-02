"use client";

import { useMemo } from "react";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import type { CourseColorMode, SelectedMapFeature } from "../types";
import {
  buildCourseFeatureCollection,
  buildCourseOutlineFeatureCollection,
  buildLiftFeatureCollection,
  EMPTY_FINALIZED_COURSES,
  EMPTY_FINALIZED_LIFTS,
  getFeatureStatusKind,
  getFinalizedMapDataBounds,
  toDownhillCourses,
} from "../utils/finalizedMapData";
import {
  DEFAULT_MAP_DISPLAY_SETTINGS,
  isCourseStatusVisible,
  type MapDisplaySettings,
} from "../utils/mapDisplaySettings";

type UseFinalizedMapFeaturesParams = {
  showOpenOnly?: boolean;
  mapDisplaySettings?: MapDisplaySettings;
  courseColorMode: CourseColorMode;
  finalizedMapData: FinalizedResortMapData | null;
  interactionMode: "default" | "detail" | "compare";
  selectedFinalizedFeature: SelectedMapFeature | null;
};

export const useFinalizedMapFeatures = ({
  mapDisplaySettings = DEFAULT_MAP_DISPLAY_SETTINGS,
  courseColorMode,
  finalizedMapData,
  interactionMode,
  selectedFinalizedFeature,
}: UseFinalizedMapFeaturesParams) => {
  const sourceCourses =
    finalizedMapData?.courses?.features ?? EMPTY_FINALIZED_COURSES;
  const finalizedLifts =
    finalizedMapData?.lifts?.features ?? EMPTY_FINALIZED_LIFTS;

  // 滑走方向（標高降順）に揃えたコースを唯一の入力にする。
  // 線・ラベル・方向記号がすべて同じ向きを前提にできる（FR-4.1）。
  const allCourses = useMemo(
    () =>
      sourceCourses.length > 0
        ? toDownhillCourses(sourceCourses)
        : EMPTY_FINALIZED_COURSES,
    [sourceCourses],
  );
  const { courseStatuses } = mapDisplaySettings;
  const finalizedCourses = useMemo(
    () =>
      allCourses.filter(course =>
        isCourseStatusVisible(
          getFeatureStatusKind(course.properties.status),
          courseStatuses,
        ),
      ),
    [allCourses, courseStatuses],
  );
  const hasFinalizedCourses = allCourses.length > 0;
  const hasFinalizedLifts = finalizedLifts.length > 0;
  const isFinalizedFocusMode =
    interactionMode === "detail" && (hasFinalizedCourses || hasFinalizedLifts);
  const finalizedBounds = useMemo(
    () => getFinalizedMapDataBounds(allCourses, finalizedLifts),
    [allCourses, finalizedLifts],
  );

  // ズームには依存させない。営業状態による表示対象の変更だけを反映する。
  // ズームで変わるのは線幅・不透明度だけなので setStyle 側で処理する。
  const courseFeatureCollection = useMemo(
    () =>
      hasFinalizedCourses
        ? buildCourseFeatureCollection(finalizedCourses, courseColorMode)
        : null,
    [courseColorMode, finalizedCourses, hasFinalizedCourses],
  );
  const courseOutlineFeatureCollection = useMemo(
    () =>
      hasFinalizedCourses
        ? buildCourseOutlineFeatureCollection(finalizedCourses)
        : null,
    [finalizedCourses, hasFinalizedCourses],
  );
  const liftFeatureCollection = useMemo(
    () =>
      hasFinalizedLifts ? buildLiftFeatureCollection(finalizedLifts) : null,
    [finalizedLifts, hasFinalizedLifts],
  );
  const selectedCourses = useMemo(() => {
    if (selectedFinalizedFeature?.kind !== "course") return null;
    const { routeId } = selectedFinalizedFeature;
    const route = routeId
      ? finalizedCourses.find(course => course.id === routeId)
      : undefined;
    if (route) return [route];
    const matchedCourses = finalizedCourses.filter(
      course =>
        course.groupId === selectedFinalizedFeature.id ||
        course.id === selectedFinalizedFeature.id,
    );
    return matchedCourses.length > 0 ? matchedCourses : null;
  }, [finalizedCourses, selectedFinalizedFeature]);
  const selectedLift = useMemo(() => {
    if (selectedFinalizedFeature?.kind !== "lift") return null;
    return (
      finalizedLifts.find(lift => lift.id === selectedFinalizedFeature.id) ??
      null
    );
  }, [finalizedLifts, selectedFinalizedFeature]);

  return {
    allFinalizedCourses: allCourses,
    courseFeatureCollection,
    courseOutlineFeatureCollection,
    finalizedBounds,
    finalizedCourses,
    finalizedLifts,
    hasFinalizedCourses,
    hasFinalizedLifts,
    isFinalizedFocusMode,
    liftFeatureCollection,
    selectedCourses,
    selectedLift,
  };
};
