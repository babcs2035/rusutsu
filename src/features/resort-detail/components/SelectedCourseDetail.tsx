"use client";

import Image from "next/image";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import {
  COURSE_DIFFICULTY_META,
  getCourseDifficulty,
} from "@/lib/finalizedResortGeojsonShared";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { getExternalImageUrl } from "@/shared/utils/externalImage";
import type { FinalizedCourseGroup } from "../types";
import {
  averageNullable,
  createConnectedCourseElevationProfile,
  formatDegree,
  formatMeters,
  getCourseGroupNotes,
  getCourseGroupPisteSymbol,
  getCourseGroupStatus,
  maxNullable,
} from "../utils/detailMetrics";
import { ElevationProfile } from "./ElevationProfile";
import { StatusSummary } from "./StatusRow";

type Props = {
  courseGroup: FinalizedCourseGroup;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
};

export const SelectedCourseDetail = ({
  courseGroup,
  selectedElevationProfilePoint,
  onSelectedElevationProfilePointChange,
}: Props) => {
  const selectedCourse = courseGroup.courses[0];

  if (!selectedCourse) return null;

  const courseImageUrl = getExternalImageUrl(selectedCourse.properties.image);
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
  const profileElevations = profilePoints.map(point => point.elevation);
  const elevationDiff =
    profileElevations.length > 0
      ? Math.max(...profileElevations) - Math.min(...profileElevations)
      : null;
  const notes = getCourseGroupNotes(courseGroup);
  // 一部だけオープンしている場合の「下部のみオープン」も当日の状況として扱う
  const comments = [...(status.note ? [status.note] : []), ...notes.latest];

  return (
    <div className="flex flex-col gap-5">
      {courseImageUrl && (
        <ExternalLinkComponent className="w-full">
          <div className="relative h-[180px] w-full overflow-hidden rounded-xl">
            <Image
              src={courseImageUrl}
              alt={courseGroup.displayName}
              fill
              sizes="(min-width: 768px) 1000px, 100vw"
              className="object-contain"
              // コース画像は各スキー場の公式サイト上にあり、ホスト名は
              // スキー場が増えるたびに増える。remotePatterns で列挙しきれないので
              // 最適化を切って直接読み込む（getExternalImageUrl の説明を参照）。
              unoptimized
            />
          </div>
        </ExternalLinkComponent>
      )}

      <StatusSummary
        statusSymbol={status.symbol}
        pisteSymbol={pisteSymbol}
        difficultyLabel={difficulty.label}
        difficultyColor={difficulty.color}
      />

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <CourseMetric
          title="水平距離"
          value={formatMeters(horizontalDistance)}
        />
        <CourseMetric title="斜面距離" value={formatMeters(distance)} />
        <CourseMetric title="標高差" value={formatMeters(elevationDiff)} />
        <CourseMetric title="平均斜度" value={formatDegree(averageSlope)} />
        <CourseMetric title="最大斜度" value={formatDegree(maxSlope)} />
      </div>
    </div>
  );
};

const CourseMetric = ({ title, value }: { title: string; value: string }) => (
  <div className="border-b border-gray-200 pb-2">
    <p className="text-gray-500 text-xs font-medium">{title}</p>
    <p className="text-gray-900 text-lg font-semibold">{value}</p>
  </div>
);
