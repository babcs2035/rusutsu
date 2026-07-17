"use client";

import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  NativeSelect,
  Table,
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
import type { SelectedMapFeature } from "@/features/map/JapanResortMap";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import {
  COURSE_DIFFICULTY_META,
  getCourseDifficulty,
} from "@/lib/finalizedResortGeojsonShared";
import { SelectedCourseDetail } from "../components/SelectedCourseDetail";
import { StatCard } from "../components/StatCard";
import type { FinalizedCourseGroup, Resort } from "../types";
import {
  createFinalizedCourseGroups,
  formatCourseStatus,
  formatMeters,
  formatPisteStatus,
  maxNullable,
} from "../utils/detailMetrics";

const getCourseGroupDistance = (group: FinalizedCourseGroup) =>
  group.courses.reduce(
    (sum, course) =>
      sum + (course.properties.slopeDistMap ?? course.properties.distance ?? 0),
    0,
  );

const getCourseGroupDifficulty = (group: FinalizedCourseGroup) => {
  const primaryCourse = group.courses[0];
  const difficulty = getCourseDifficulty(primaryCourse?.properties.level);
  return COURSE_DIFFICULTY_META[difficulty].label;
};

const getCourseGroupLevelBucket = (group: FinalizedCourseGroup) => {
  const primaryCourse = group.courses[0];
  const difficulty = getCourseDifficulty(primaryCourse?.properties.level);
  if (difficulty === "advanced" || difficulty === "intermediateAdvanced") {
    return "advanced";
  }
  if (difficulty === "intermediate") return "intermediate";
  return "beginner";
};

const getCourseGroupMaxSlope = (group: FinalizedCourseGroup) =>
  maxNullable(
    group.courses.map(
      course => course.properties.maxSlopeDegMap ?? course.properties.max,
    ),
  );

const getCourseGroupElevationDiff = (group: FinalizedCourseGroup) =>
  maxNullable(group.courses.map(course => course.properties.elevationDiffMap));

export const CoursesTab = ({
  resort,
  finalizedMapData,
  selectedFinalizedFeature,
  selectedElevationProfilePoint,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
}: {
  resort: Resort;
  finalizedMapData: FinalizedResortMapData | null;
  selectedFinalizedFeature: SelectedMapFeature | null;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
}) => {
  const finalizedCourses = finalizedMapData?.courses?.features ?? [];
  const finalizedCourseGroups = useMemo(
    () => createFinalizedCourseGroups(finalizedCourses),
    [finalizedCourses],
  );
  const selectedFinalizedCourseGroup =
    selectedFinalizedFeature?.kind === "course"
      ? (finalizedCourseGroups.find(
          group => group.id === selectedFinalizedFeature.id,
        ) ?? null)
      : null;
  const selectedFinalizedCourse =
    selectedFinalizedCourseGroup?.courses[0] ?? null;
  const courses = resort.courses;
  const hasFinalizedCourses = finalizedCourseGroups.length > 0;
  const [difficultyFilter, setDifficultyFilter] = useState("全て");
  const [sortConfig, setSortConfig] = useState<{
    key: "distance";
    direction: "asc" | "desc";
  } | null>(null);

  const difficultyOptions = useMemo(
    () =>
      hasFinalizedCourses
        ? [
            "全て",
            ...Array.from(
              new Set(finalizedCourseGroups.map(getCourseGroupDifficulty)),
            ),
          ]
        : [
            "全て",
            ...Array.from(
              new Set(
                courses.map(c => c.difficulty).filter(Boolean) as string[],
              ),
            ),
          ],
    [courses, finalizedCourseGroups, hasFinalizedCourses],
  );

  const processedCourses = useMemo(() => {
    let filtered = [...courses];
    if (difficultyFilter !== "全て") {
      filtered = filtered.filter(c => c.difficulty === difficultyFilter);
    }
    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        const aVal = a[sortConfig.key] || 0;
        const bVal = b[sortConfig.key] || 0;
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [courses, difficultyFilter, sortConfig]);

  const processedFinalizedCourseGroups = useMemo(() => {
    let filtered = [...finalizedCourseGroups];
    if (difficultyFilter !== "全て") {
      filtered = filtered.filter(
        group => getCourseGroupDifficulty(group) === difficultyFilter,
      );
    }
    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        const aVal = getCourseGroupDistance(a);
        const bVal = getCourseGroupDistance(b);
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [difficultyFilter, finalizedCourseGroups, sortConfig]);

  const finalizedStats = useMemo(() => {
    const total = finalizedCourseGroups.length;
    const beginner = finalizedCourseGroups.filter(
      group => getCourseGroupLevelBucket(group) === "beginner",
    ).length;
    const intermediate = finalizedCourseGroups.filter(
      group => getCourseGroupLevelBucket(group) === "intermediate",
    ).length;
    const advanced = finalizedCourseGroups.filter(
      group => getCourseGroupLevelBucket(group) === "advanced",
    ).length;

    return {
      total,
      longestDistance: maxNullable(
        finalizedCourseGroups.map(getCourseGroupDistance),
      ),
      maxSlope: maxNullable(finalizedCourseGroups.map(getCourseGroupMaxSlope)),
      maxElevationDiff: maxNullable(
        finalizedCourseGroups.map(getCourseGroupElevationDiff),
      ),
      beginnerPercent: total > 0 ? Math.round((beginner / total) * 100) : 0,
      intermediatePercent:
        total > 0 ? Math.round((intermediate / total) * 100) : 0,
      advancedPercent: total > 0 ? Math.round((advanced / total) * 100) : 0,
    };
  }, [finalizedCourseGroups]);

  if (selectedFinalizedCourseGroup && selectedFinalizedCourse) {
    return (
      <SelectedCourseDetail
        courseGroup={selectedFinalizedCourseGroup}
        selectedElevationProfilePoint={selectedElevationProfilePoint}
        onSelectedElevationProfilePointChange={
          onSelectedElevationProfilePointChange
        }
        onBack={() => {
          onSelectedFinalizedFeatureChange(null);
          onSelectedElevationProfilePointChange(null);
        }}
      />
    );
  }

  const handleSort = (key: "distance") => {
    setSortConfig(prev => ({
      key,
      direction: prev?.direction === "asc" ? "desc" : "asc",
    }));
  };

  if (hasFinalizedCourses) {
    return (
      <Flex flexDirection="column" gap={10}>
        <Box as="section">
          <Grid
            templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}
            gap={4}
          >
            <StatCard title="総コース数" value={`${finalizedStats.total}`} />
            <StatCard
              title="最長滑走距離"
              value={formatMeters(finalizedStats.longestDistance)}
            />
            <StatCard
              title="最大斜度"
              value={
                finalizedStats.maxSlope == null
                  ? "--"
                  : `${Math.round(finalizedStats.maxSlope)}°`
              }
            />
            <StatCard
              title="標高差"
              value={formatMeters(finalizedStats.maxElevationDiff)}
            />
          </Grid>
        </Box>

        <Box as="section">
          <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
            レベル別割合
          </Heading>
          <Flex
            mt={5}
            h={6}
            w="100%"
            overflow="hidden"
            borderRadius="full"
            bg="gray.100"
            border="1px solid"
            borderColor="gray.200"
            fontSize="xs"
            fontWeight="700"
            color="white"
          >
            <Flex
              w={`${Math.max(finalizedStats.beginnerPercent, 5)}%`}
              bg="green.500"
              alignItems="center"
              justifyContent="center"
              display={finalizedStats.beginnerPercent > 0 ? "flex" : "none"}
            >
              {finalizedStats.beginnerPercent}%
            </Flex>
            <Flex
              w={`${Math.max(finalizedStats.intermediatePercent, 5)}%`}
              bg="blue.500"
              alignItems="center"
              justifyContent="center"
              display={finalizedStats.intermediatePercent > 0 ? "flex" : "none"}
            >
              {finalizedStats.intermediatePercent}%
            </Flex>
            <Flex
              w={`${Math.max(finalizedStats.advancedPercent, 5)}%`}
              bg="red.500"
              alignItems="center"
              justifyContent="center"
              display={finalizedStats.advancedPercent > 0 ? "flex" : "none"}
            >
              {finalizedStats.advancedPercent}%
            </Flex>
          </Flex>
          <Flex
            justifyContent="center"
            gap={6}
            mt={3}
            fontSize="sm"
            color="gray.600"
          >
            <Flex alignItems="center" gap={2}>
              <Box w={3} h={3} borderRadius="full" bg="green.500" /> 初級
            </Flex>
            <Flex alignItems="center" gap={2}>
              <Box w={3} h={3} borderRadius="full" bg="blue.500" /> 中級
            </Flex>
            <Flex alignItems="center" gap={2}>
              <Box w={3} h={3} borderRadius="full" bg="red.500" /> 上級
            </Flex>
          </Flex>
        </Box>

        <Box as="section">
          <Flex
            flexDirection={{ base: "column", md: "row" }}
            gap={4}
            alignItems={{ md: "center" }}
            justifyContent={{ md: "space-between" }}
          >
            <Heading
              size="lg"
              fontFamily="var(--font-heading)"
              color="gray.900"
            >
              コース一覧
            </Heading>
            <NativeSelect.Root
              w={{ base: "100%", md: "200px" }}
              size="md"
              variant="outline"
            >
              <NativeSelect.Field
                value={difficultyFilter}
                onChange={e => setDifficultyFilter(e.target.value)}
                bg="white"
                color="gray.800"
                borderColor="gray.200"
                _focus={{ borderColor: "brand.500" }}
              >
                {difficultyOptions.map(opt => (
                  <option key={opt} value={opt}>
                    {opt === "全て" ? "すべての難易度" : opt}
                  </option>
                ))}
              </NativeSelect.Field>
            </NativeSelect.Root>
          </Flex>
          <Box
            mt={4}
            w="100%"
            overflowX="auto"
            borderRadius="xl"
            border="1px solid"
            borderColor="gray.200"
            bg="white"
          >
            <Table.Root size="md">
              <Table.Header>
                <Table.Row bg="gray.100">
                  <Table.ColumnHeader px={6} py={4}>
                    コース名
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    難易度
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    <Button
                      onClick={() => handleSort("distance")}
                      variant="ghost"
                      p={0}
                      h="auto"
                      minW="auto"
                      color="gray.600"
                      _hover={{ color: "brand.600" }}
                    >
                      距離{" "}
                      {sortConfig?.key === "distance" &&
                        (sortConfig.direction === "asc" ? "▲" : "▼")}
                    </Button>
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    状況
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    圧雪
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    スノボ
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {processedFinalizedCourseGroups.map(group => {
                  const primaryCourse = group.courses[0];
                  const isSelected =
                    selectedFinalizedFeature?.kind === "course" &&
                    selectedFinalizedFeature.id === group.id;
                  return (
                    <Table.Row
                      key={group.id}
                      cursor="pointer"
                      bg={isSelected ? "blue.50" : "white"}
                      borderColor="gray.200"
                      _hover={{ bg: isSelected ? "blue.100" : "gray.50" }}
                      onClick={() =>
                        onSelectedFinalizedFeatureChange({
                          kind: "course",
                          id: group.id,
                        })
                      }
                    >
                      <Table.Cell
                        px={6}
                        py={4}
                        fontWeight="800"
                        whiteSpace="nowrap"
                      >
                        {group.displayName}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        <Box
                          as="span"
                          px={2}
                          py={1}
                          borderRadius="md"
                          bg="gray.100"
                          color="gray.700"
                          fontSize="xs"
                          whiteSpace="nowrap"
                        >
                          {getCourseGroupDifficulty(group)}
                        </Box>
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {formatMeters(getCourseGroupDistance(group))}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {formatCourseStatus(primaryCourse?.properties.status)}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {formatPisteStatus(primaryCourse?.properties.piste)}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {primaryCourse?.properties.snowboard ?? "--"}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>
      </Flex>
    );
  }

  const maxSlope = resort.steepestSlope ?? resort.angleMax;

  return (
    <Flex flexDirection="column" gap={10}>
      <Box as="section">
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard title="総コース数" value={`${resort.numberOfCourses}`} />
          <StatCard
            title="最長滑走距離"
            value={formatMeters(resort.longestCourse)}
          />
          <StatCard
            title="最大斜度"
            value={maxSlope == null ? "--" : `${maxSlope}°`}
          />
          <StatCard title="標高差" value={`${resort.verticalDrop}m`} />
        </Grid>
      </Box>
      <Box as="section">
        <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
          レベル別割合
        </Heading>
        <Flex
          mt={5}
          h={6}
          w="100%"
          overflow="hidden"
          borderRadius="full"
          bg="gray.100"
          border="1px solid"
          borderColor="gray.200"
          fontSize="xs"
          fontWeight="700"
          color="white"
        >
          <Flex
            w={`${Math.max(resort.beginnersCoursesPercent, 5)}%`}
            bg="green.500"
            alignItems="center"
            justifyContent="center"
            display={resort.beginnersCoursesPercent > 0 ? "flex" : "none"}
          >
            {resort.beginnersCoursesPercent}%
          </Flex>
          <Flex
            w={`${Math.max(resort.intermediateCoursesPercent, 5)}%`}
            bg="blue.500"
            alignItems="center"
            justifyContent="center"
            display={resort.intermediateCoursesPercent > 0 ? "flex" : "none"}
          >
            {resort.intermediateCoursesPercent}%
          </Flex>
          <Flex
            w={`${Math.max(resort.advancedCoursesPercent, 5)}%`}
            bg="red.500"
            alignItems="center"
            justifyContent="center"
            display={resort.advancedCoursesPercent > 0 ? "flex" : "none"}
          >
            {resort.advancedCoursesPercent}%
          </Flex>
        </Flex>
        <Flex
          justifyContent="center"
          gap={6}
          mt={3}
          fontSize="sm"
          color="gray.600"
        >
          <Flex alignItems="center" gap={2}>
            <Box w={3} h={3} borderRadius="full" bg="green.500" /> 初級
          </Flex>
          <Flex alignItems="center" gap={2}>
            <Box w={3} h={3} borderRadius="full" bg="blue.500" /> 中級
          </Flex>
          <Flex alignItems="center" gap={2}>
            <Box w={3} h={3} borderRadius="full" bg="red.500" /> 上級
          </Flex>
        </Flex>
      </Box>
      <Box as="section">
        <Flex
          flexDirection={{ base: "column", md: "row" }}
          gap={4}
          alignItems={{ md: "center" }}
          justifyContent={{ md: "space-between" }}
        >
          <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
            コース一覧
          </Heading>
          <NativeSelect.Root
            w={{ base: "100%", md: "200px" }}
            size="md"
            variant="outline"
          >
            <NativeSelect.Field
              value={difficultyFilter}
              onChange={e => setDifficultyFilter(e.target.value)}
              bg="white"
              color="gray.800"
              borderColor="gray.200"
              _focus={{ borderColor: "brand.500" }}
            >
              {difficultyOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt === "全て" ? "すべての難易度" : opt}
                </option>
              ))}
            </NativeSelect.Field>
          </NativeSelect.Root>
        </Flex>
        <Box
          mt={4}
          w="100%"
          overflowX="auto"
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.200"
          bg="white"
        >
          <Table.Root size="md">
            <Table.Header>
              <Table.Row bg="gray.100">
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  コース名
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  難易度
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  <Button
                    onClick={() => handleSort("distance")}
                    variant="ghost"
                    p={0}
                    h="auto"
                    minW="auto"
                    color="gray.600"
                    _hover={{ color: "brand.600" }}
                  >
                    距離 (m){" "}
                    {sortConfig?.key === "distance" &&
                      (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </Button>
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  スノボ
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {processedCourses.map(c => (
                <Table.Row
                  key={c.id}
                  borderColor="gray.200"
                  _hover={{ bg: "gray.50" }}
                >
                  <Table.Cell
                    px={6}
                    py={4}
                    fontWeight="700"
                    color="gray.800"
                    whiteSpace="nowrap"
                  >
                    {c.name}
                  </Table.Cell>
                  <Table.Cell px={6} py={4} whiteSpace="nowrap">
                    <Box
                      as="span"
                      px={2}
                      py={1}
                      borderRadius="md"
                      bg="gray.100"
                      color="gray.700"
                      fontSize="xs"
                      whiteSpace="nowrap"
                    >
                      {c.difficulty}
                    </Box>
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.700"
                    fontFamily="mono"
                    whiteSpace="nowrap"
                  >
                    {c.distance?.toLocaleString() || "--"}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.700"
                    whiteSpace="nowrap"
                  >
                    {c.snowboard}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Box>
    </Flex>
  );
};
