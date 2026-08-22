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
  getFinalizedMapDataBounds,
  toDownhillCourses,
} from "../utils/finalizedMapData";

type UseFinalizedMapFeaturesParams = {
  courseColorMode: CourseColorMode;
  finalizedMapData: FinalizedResortMapData | null;
  interactionMode: "default" | "detail" | "compare";
  selectedFinalizedFeature: SelectedMapFeature | null;
};

export const useFinalizedMapFeatures = ({
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
  const finalizedCourses = useMemo(
    () =>
      sourceCourses.length > 0
        ? toDownhillCourses(sourceCourses)
        : EMPTY_FINALIZED_COURSES,
    [sourceCourses],
  );
  const hasFinalizedCourses = finalizedCourses.length > 0;
  const hasFinalizedLifts = finalizedLifts.length > 0;
  const isFinalizedFocusMode =
    interactionMode === "detail" && (hasFinalizedCourses || hasFinalizedLifts);
  const finalizedBounds = useMemo(
    () => getFinalizedMapDataBounds(finalizedCourses, finalizedLifts),
    [finalizedCourses, finalizedLifts],
  );

  // ズームと「営業中のみ」には依存させない（FR-1.1）。
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
