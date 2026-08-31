"use client";

import type { ElevationProfileMapPoint } from "@/features/map/types";
import {
  COURSE_DIFFICULTY_META,
  getCourseDifficulty,
} from "@/lib/finalizedResortGeojsonShared";
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
  type StatusSymbol,
} from "../utils/detailMetrics";
import { getFeatureSearchWord } from "../utils/featureLinks";
import { ElevationProfile } from "./ElevationProfile";
import { FeatureHeadline, FeatureMetric } from "./FeatureHeadline";

type Props = {
  courseGroup: FinalizedCourseGroup;
  resortLabelName: string;
  sourceUrls: string[];
  verificationStatus?: "verified" | "unverified" | "mixed";
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
};

const SYMBOL_TONE: Record<StatusSymbol, "open" | "limited" | "closed"> = {
  "○": "open",
  "△": "limited",
  "×": "closed",
};

export const SelectedCourseDetail = ({
  courseGroup,
  resortLabelName,
  sourceUrls,
  verificationStatus,
  selectedElevationProfilePoint,
  onSelectedElevationProfilePointChange,
}: Props) => {
  const selectedCourse = courseGroup.courses[0];

  if (!selectedCourse) return null;

  const difficulty =
    COURSE_DIFFICULTY_META[
      getCourseDifficulty(selectedCourse.properties.level)
    ];
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
  const comments = [...(status.note ? [status.note] : []), ...notes.latest];
  const searchWord = getFeatureSearchWord({
    searchWord: selectedCourse.properties.searchWord,
    resortLabelName,
    featureName: courseGroup.displayName,
  });

  return (
    <div className="flex flex-col gap-5">
      <FeatureHeadline
        difficulty={difficulty}
        items={[
          {
            label: "営業状況",
            text: status.symbol
              ? COURSE_STATUS_DESCRIPTION[status.symbol]
              : "不明",
            tone: status.symbol ? SYMBOL_TONE[status.symbol] : null,
          },
          ...(pisteSymbol
            ? [
                {
                  label: "圧雪",
                  text: PISTE_STATUS_DESCRIPTION[pisteSymbol],
                  tone: SYMBOL_TONE[pisteSymbol],
                },
              ]
            : []),
        ]}
        update={selectedCourse.properties.update}
        searchWord={searchWord}
        sourceUrls={selectedCourse.sourceUrls ?? sourceUrls}
        verificationStatus={
          selectedCourse.verificationStatus ?? verificationStatus
        }
      />

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

      <div className="grid grid-cols-5 gap-2">
        <FeatureMetric
          title="水平距離"
          value={formatMeters(horizontalDistance)}
        />
        <FeatureMetric title="斜面距離" value={formatMeters(distance)} />
        <FeatureMetric
          title="標高差"
          value={formatMeters(elevationDiff)}
          detail={
            elevationRange
              ? `${Math.round(elevationRange.max)} - ${Math.round(elevationRange.min)}m`
              : null
          }
        />
        <FeatureMetric title="平均斜度" value={formatDegree(averageSlope)} />
        <FeatureMetric title="最大斜度" value={formatDegree(maxSlope)} />
      </div>

      {comments.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500">コメント</p>
          <ul className="mt-1 flex flex-col gap-1">
            {comments.map(comment => (
              <li
                key={comment}
                className="text-sm leading-relaxed text-gray-800"
              >
                {comment}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.description.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
          {notes.description.map(note => (
            <p key={note} className="text-sm leading-relaxed text-gray-700">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
