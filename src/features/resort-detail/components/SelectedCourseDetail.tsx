"use client";

import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import {
  COURSE_DIFFICULTY_META,
  getCourseDifficulty,
} from "@/lib/finalizedResortGeojsonShared";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { FinalizedCourseGroup } from "../types";
import {
  averageNullable,
  createConnectedCourseElevationProfile,
  formatCourseStatus,
  formatDegree,
  formatMeters,
  formatPisteStatus,
  maxNullable,
} from "../utils/detailMetrics";
import { ElevationProfile } from "./ElevationProfile";

type Props = {
  courseGroup: FinalizedCourseGroup;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
  onBack: () => void;
};

export const SelectedCourseDetail = ({
  courseGroup,
  selectedElevationProfilePoint,
  onSelectedElevationProfilePointChange,
  onBack,
}: Props) => {
  const selectedCourse = courseGroup.courses[0];

  if (!selectedCourse) return null;

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
  const sectionText =
    courseGroup.courses
      .map(course => course.sectionName)
      .filter(Boolean)
      .join(" / ") || "--";

  return (
    <div className="flex flex-col gap-5">
      <Button
        type="button"
        variant="ghost"
        className="self-start text-gray-600 font-medium px-0 hover:bg-gray-50 hover:text-gray-900 -ml-2"
        onClick={onBack}
      >
        <ArrowLeft size={16} />
        コース一覧へ戻る
      </Button>
      <div>
        <h2 className="text-lg text-gray-900 font-bold font-[var(--font-heading)]">
          {courseGroup.displayName}
        </h2>
        <p className="mt-1 text-gray-700 font-medium">
          {
            COURSE_DIFFICULTY_META[
              getCourseDifficulty(selectedCourse.properties.level)
            ].label
          }
        </p>
      </div>

      {selectedCourse.properties.image && (
        <ExternalLinkComponent className="w-full">
          <div className="relative h-[180px] w-full overflow-hidden rounded-xl">
            <Image
              src={selectedCourse.properties.image}
              alt={courseGroup.displayName}
              fill
              sizes="(min-width: 768px) 1000px, 100vw"
              className="object-contain"
            />
          </div>
        </ExternalLinkComponent>
      )}

      <CourseStatusTable
        rows={[
          ["営業状況", formatCourseStatus(selectedCourse.properties.status)],
          ["圧雪", formatPisteStatus(selectedCourse.properties.piste)],
          [
            "難易度",
            COURSE_DIFFICULTY_META[
              getCourseDifficulty(selectedCourse.properties.level)
            ].label,
          ],
          ["区間", sectionText],
        ]}
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <CourseMetric
          title="水平距離"
          value={formatMeters(horizontalDistance)}
        />
        <CourseMetric title="斜面距離" value={formatMeters(distance)} />
        <CourseMetric title="標高差" value={formatMeters(elevationDiff)} />
        <CourseMetric title="平均斜度" value={formatDegree(averageSlope)} />
        <CourseMetric title="最大斜度" value={formatDegree(maxSlope)} />
      </div>

      {(selectedCourse.properties.latestNote ||
        selectedCourse.properties.note) && (
        <p className="text-gray-700 leading-relaxed">
          {selectedCourse.properties.latestNote ??
            selectedCourse.properties.note}
        </p>
      )}
    </div>
  );
};

const CourseMetric = ({ title, value }: { title: string; value: string }) => (
  <div className="border-b border-gray-200 pb-2">
    <p className="text-gray-500 text-xs font-medium">{title}</p>
    <p className="text-gray-900 text-lg font-semibold">{value}</p>
  </div>
);

const CourseStatusTable = ({ rows }: { rows: [string, string][] }) => (
  <Table>
    <TableBody>
      {rows.map(([label, value]) => (
        <TableRow key={label} className="border-b border-gray-100">
          <TableCell className="w-[7rem] py-2 pr-3 text-left text-gray-600 font-semibold text-xs">
            {label}
          </TableCell>
          <TableCell className="py-2 font-semibold">{value}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);
