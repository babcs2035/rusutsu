"use client";

import { Box, Button, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import {
  COURSE_DIFFICULTY_META,
  getCourseDifficulty,
} from "@/lib/finalizedResortGeojsonShared";
import type { FinalizedCourseGroup } from "../types";
import {
  averageNullable,
  createElevationProfile,
  formatCourseStatus,
  formatDegree,
  formatMeters,
  formatPisteStatus,
  maxNullable,
} from "../utils/detailMetrics";
import { ElevationProfile } from "./ElevationProfile";
import { StatCard } from "./StatCard";

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

  const distance = courseGroup.courses.reduce(
    (sum, course) =>
      sum + (course.properties.slopeDistMap ?? course.properties.distance ?? 0),
    0,
  );
  const profilePoints = createElevationProfile(
    selectedCourse.coordinates,
    selectedCourse.slopeDeg,
  );

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
        <Box
          position="relative"
          h={{ base: "180px", md: "220px" }}
          w="100%"
          overflow="hidden"
          borderRadius="lg"
        >
          <Image
            src={selectedCourse.properties.image}
            alt={courseGroup.displayName}
            fill
            unoptimized
            style={{ objectFit: "cover" }}
          />
        </Box>
      )}

      <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap={3}>
        <StatCard
          title="営業状況"
          value={formatCourseStatus(selectedCourse.properties.status)}
        />
        <StatCard
          title="圧雪"
          value={formatPisteStatus(selectedCourse.properties.piste)}
        />
        <StatCard title="距離" value={formatMeters(distance)} />
        <StatCard
          title="平均斜度"
          value={formatDegree(
            averageNullable(
              courseGroup.courses.map(
                course => course.properties.avgSlopeDegMap,
              ),
            ),
          )}
        />
        <StatCard
          title="最大斜度"
          value={formatDegree(
            maxNullable(
              courseGroup.courses.map(
                course => course.properties.maxSlopeDegMap,
              ),
            ),
          )}
        />
        <StatCard
          title="区間"
          value={
            courseGroup.courses
              .map(course => course.sectionName)
              .filter(Boolean)
              .join(" / ") || "--"
          }
        />
      </Grid>

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
