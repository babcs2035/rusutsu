"use client";

import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  Image,
  Link,
  Text,
} from "@chakra-ui/react";
import { ArrowLeft } from "lucide-react";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import {
  COURSE_DIFFICULTY_META,
  getCourseDifficulty,
} from "@/lib/finalizedResortGeojsonShared";
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
    <Flex flexDirection="column" gap={5}>
      <Button
        type="button"
        alignSelf="flex-start"
        variant="ghost"
        color="gray.700"
        fontWeight="800"
        px={2}
        onClick={onBack}
      >
        <ArrowLeft size={18} />
        コース一覧へ戻る
      </Button>
      <Box>
        <Heading size="lg" color="gray.900">
          {courseGroup.displayName}
        </Heading>
        <Text mt={1} color="gray.600" fontWeight="800">
          {
            COURSE_DIFFICULTY_META[
              getCourseDifficulty(selectedCourse.properties.level)
            ].label
          }
        </Text>
      </Box>

      {selectedCourse.properties.image && (
        <Link
          display="inline-flex"
          h={{ base: "180px", md: "220px" }}
          maxW="100%"
          alignSelf="flex-start"
          overflow="hidden"
          borderRadius="md"
          href={selectedCourse.properties.image}
          rel="noopener noreferrer"
          target="_blank"
        >
          <Image
            src={selectedCourse.properties.image}
            alt={courseGroup.displayName}
            h="100%"
            maxW="100%"
            objectFit="contain"
          />
        </Link>
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
        showSlope
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

      <Grid
        templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(5, 1fr)" }}
        gap={3}
      >
        <CourseMetric
          title="水平距離"
          value={formatMeters(horizontalDistance)}
        />
        <CourseMetric title="斜面距離" value={formatMeters(distance)} />
        <CourseMetric title="標高差" value={formatMeters(elevationDiff)} />
        <CourseMetric title="平均斜度" value={formatDegree(averageSlope)} />
        <CourseMetric title="最大斜度" value={formatDegree(maxSlope)} />
      </Grid>

      {(selectedCourse.properties.latestNote ||
        selectedCourse.properties.note) && (
        <Text color="gray.700" lineHeight="1.7">
          {selectedCourse.properties.latestNote ??
            selectedCourse.properties.note}
        </Text>
      )}
    </Flex>
  );
};

const CourseMetric = ({ title, value }: { title: string; value: string }) => (
  <Box borderBottom="1px solid" borderColor="gray.200" pb={2}>
    <Text color="gray.500" fontSize="xs" fontWeight="800">
      {title}
    </Text>
    <Text color="gray.900" fontSize="lg" fontWeight="900">
      {value}
    </Text>
  </Box>
);

const CourseStatusTable = ({ rows }: { rows: [string, string][] }) => (
  <Box
    as="table"
    w="100%"
    borderCollapse="collapse"
    fontSize="sm"
    color="gray.700"
  >
    <Box as="tbody">
      {rows.map(([label, value]) => (
        <Box
          key={label}
          as="tr"
          borderBottom="1px solid"
          borderColor="gray.100"
        >
          <Box
            as="th"
            w="7rem"
            py={2}
            pr={3}
            textAlign="left"
            color="gray.500"
            fontWeight="800"
          >
            {label}
          </Box>
          <Box as="td" py={2} fontWeight="800">
            {value}
          </Box>
        </Box>
      ))}
    </Box>
  </Box>
);
