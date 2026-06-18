"use client";

import { useMemo } from "react";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import type { CourseColorMode, SelectedMapFeature } from "../types";
import {
  buildCourseFeatureCollection,
  buildLiftFeatureCollection,
  EMPTY_FINALIZED_COURSES,
  EMPTY_FINALIZED_LIFTS,
  getFinalizedMapDataBounds,
} from "../utils/finalizedMapData";

type UseFinalizedMapFeaturesParams = {
  courseColorMode: CourseColorMode;
  finalizedMapData: FinalizedResortMapData | null;
  interactionMode: "default" | "detail" | "compare";
  mapZoom: number;
  showOpenOnly: boolean;
  selectedFinalizedFeature: SelectedMapFeature | null;
};

export const useFinalizedMapFeatures = ({
  courseColorMode,
  finalizedMapData,
  interactionMode,
  mapZoom,
  showOpenOnly,
  selectedFinalizedFeature,
}: UseFinalizedMapFeaturesParams) => {
  const finalizedCourses =
    finalizedMapData?.courses?.features ?? EMPTY_FINALIZED_COURSES;
  const finalizedLifts =
    finalizedMapData?.lifts?.features ?? EMPTY_FINALIZED_LIFTS;
  const hasFinalizedCourses = finalizedCourses.length > 0;
  const hasFinalizedLifts = finalizedLifts.length > 0;
  const isFinalizedFocusMode =
    interactionMode === "detail" && (hasFinalizedCourses || hasFinalizedLifts);
  const finalizedBounds = useMemo(
    () => getFinalizedMapDataBounds(finalizedCourses, finalizedLifts),
    [finalizedCourses, finalizedLifts],
  );
  const courseFeatureCollection = useMemo(
    () =>
      hasFinalizedCourses
        ? buildCourseFeatureCollection(
            finalizedCourses,
            courseColorMode,
            mapZoom,
            showOpenOnly,
          )
        : null,
    [
      courseColorMode,
      finalizedCourses,
      hasFinalizedCourses,
      mapZoom,
      showOpenOnly,
    ],
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
