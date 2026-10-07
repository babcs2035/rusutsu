"use client";

import type { ReactNode } from "react";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import type { FinalizedCourseGroup } from "../types";
import {
  averageNullable,
  COURSE_STATUS_DESCRIPTION,
  createConnectedCourseElevationProfile,
  formatDegree,
  formatMeters,
  getCourseGroupNotes,
  getCourseGroupPisteSymbol,
  getCourseGroupStatus,
  getElevationRange,
  maxNullable,
  PISTE_STATUS_DESCRIPTION,
} from "../utils/detailMetrics";
import { getFeatureSearchWord } from "../utils/featureLinks";
import { collectFeatureMedia } from "../utils/featureMedia";
import { courseStatusSources } from "../utils/featureSources";
import { ElevationProfile } from "./ElevationProfile";
import {
  FeatureHeadline,
  FeatureMetrics,
  FeatureNotes,
} from "./FeatureHeadline";
import { FeatureMediaGallery } from "./FeatureMediaGallery";

type Props = {
  courseGroup: FinalizedCourseGroup;
  resortLabelName: string;
  sourceUrls: string[];
  similarCourses?: ReactNode;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
};

export const SelectedCourseDetail = ({
  courseGroup,
  resortLabelName,
  sourceUrls,
  similarCourses,
  selectedElevationProfilePoint,
  onSelectedElevationProfilePointChange,
}: Props) => {
  const selectedCourse = courseGroup.courses[0];

  if (!selectedCourse) return null;

  const status = getCourseGroupStatus(courseGroup);
  const pisteSymbol = getCourseGroupPisteSymbol(courseGroup);

  const distances = courseGroup.courses
    .map(
      course =>
        course.properties.slopeDistMap ?? course.properties.distance ?? null,
    )
    .filter((value): value is number => value !== null);
  const distance =
    distances.length > 0
      ? distances.reduce((sum, value) => sum + value, 0)
      : null;
  const horizontalDistances = courseGroup.courses.map(
    course => course.properties.horizontalDistMap,
  );
  const horizontalDistance = horizontalDistances.some(
    (value): value is number => typeof value === "number",
  )
    ? horizontalDistances.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
  const averageSlope = averageNullable(
    courseGroup.courses.map(course => course.properties.avgSlopeDegMap),
  );
  const maxSlope = maxNullable(
    courseGroup.courses.map(course => course.properties.maxSlopeDegMap),
  );
  const profilePoints = createConnectedCourseElevationProfile(
    courseGroup.courses,
  );
  const elevationRange = getElevationRange(
    courseGroup.courses.map(course => course.coordinates),
  );
  const elevationDiff = elevationRange
    ? elevationRange.max - elevationRange.min
    : null;
  const notes = getCourseGroupNotes(courseGroup);
  // 一部だけオープンしている場合の「下部のみオープン」も当日の状況として扱う
  const repeatedLabels = new Set([
    status.symbol ? COURSE_STATUS_DESCRIPTION[status.symbol] : "",
    pisteSymbol ? PISTE_STATUS_DESCRIPTION[pisteSymbol] : "",
    ...(status.symbol === "×" ? ["閉鎖中", "滑走不可", "CLOSE", "CLOSED"] : []),
  ]);
  const comments = [
    ...new Set([...(status.note ? [status.note] : []), ...notes.latest]),
  ].filter(comment => !repeatedLabels.has(comment.trim()));
  const searchWord = getFeatureSearchWord({
    searchWord: selectedCourse.properties.searchWord,
    resortLabelName,
    featureName: courseGroup.displayName,
  });

  return (
    <div className="flex flex-col gap-3">
      <FeatureHeadline
        kind="course"
        status={{
          symbol: status.symbol,
          text: status.symbol
            ? COURSE_STATUS_DESCRIPTION[status.symbol]
            : "状況不明",
        }}
        searchWord={searchWord}
        sources={courseStatusSources(courseGroup, sourceUrls)}
      />

      <FeatureMetrics
        items={[
          { title: "滑走距離", value: formatMeters(distance) },
          {
            title: "標高差",
            value: formatMeters(elevationDiff),
            detail: elevationRange
              ? `${Math.round(elevationRange.max)} - ${Math.round(elevationRange.min)}m`
              : null,
          },
          { title: "平均斜度", value: formatDegree(averageSlope) },
          { title: "最大斜度", value: formatDegree(maxSlope) },
          { title: "水平距離", value: formatMeters(horizontalDistance) },
        ]}
      />

      <FeatureNotes comments={comments} descriptions={notes.description} />

      <ElevationProfile
        points={profilePoints}
        activeDistance={
          selectedElevationProfilePoint?.courseGroupId === courseGroup.id
            ? selectedElevationProfilePoint.distance
            : null
        }
        onPointSelect={point =>
          onSelectedElevationProfilePointChange({
            courseGroupId: courseGroup.id,
            courseName: courseGroup.displayName,
            coordinate: point.coordinate,
            distance: point.distance,
            elevation: point.elevation,
            slope: point.slope,
          })
        }
      />

      {similarCourses}

      <FeatureMediaGallery
        media={collectFeatureMedia(
          courseGroup.courses.map(course => course.properties),
        )}
        name={courseGroup.displayName}
      />
    </div>
  );
};
