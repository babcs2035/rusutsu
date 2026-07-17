"use client";

import { Box, Button, Flex, Heading, Input, Text } from "@chakra-ui/react";
import { useState } from "react";
import {
  BINARY_OPTIONS,
  LEVEL_OPTIONS,
  PISTE_DESCRIPTIONS,
  PISTE_OPTIONS,
} from "../constants";
import type {
  BinaryMark,
  CourseDetail,
  EditorCourse,
  PisteMark,
  ResortOption,
} from "../types";
import { mergeSplitGroup, splitCourseAtVertex } from "../utils/courseOps";
import {
  buildCsv,
  buildGpx,
  buildKml,
  buildRusutsuGeojson,
  buildSlopeDetailJson,
  buildStandardGeojson,
  downloadTextFile,
} from "../utils/exportFiles";
import { EditorMap } from "./EditorMap";

type DetailEditStepProps = {
  resort: ResortOption;
  courses: EditorCourse[];
  setCourses: (updater: (courses: EditorCourse[]) => EditorCourse[]) => void;
  googleMapsApiKey: string | null;
  savedAt: string | null;
  onBackToLines: () => void;
  onExported: () => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: "6px",
  border: "1px solid #cbd5e0",
  fontSize: "14px",
  background: "#fff",
};

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="xs" fontWeight="bold" color="gray.600" mb="2px">
    {children}
  </Text>
);

export function DetailEditStep({
  resort,
  courses,
  setCourses,
  googleMapsApiKey,
  savedAt,
  onBackToLines,
  onExported,
}: DetailEditStepProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    courses[0]?.id ?? null,
  );
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  // マウント時に全コースへ fitBounds する
  const fitBoundsKey = 1;

  const selectedCourse =
    courses.find(course => course.id === selectedCourseId) ?? null;

  const updateSelectedCourse = (
    updater: (course: EditorCourse) => EditorCourse,
  ) => {
    if (!selectedCourseId) return;
    setCourses(previous =>
      previous.map(course =>
        course.id === selectedCourseId ? updater(course) : course,
      ),
    );
  };

  const updateDetail = (patch: Partial<CourseDetail>) => {
    updateSelectedCourse(course => ({
      ...course,
      detail: { ...course.detail, ...patch },
    }));
  };

  const handleSplitAtVertex = (vertexIndex: number) => {
    if (!selectedCourseId) return;
    setCourses(previous =>
      splitCourseAtVertex(previous, selectedCourseId, vertexIndex),
    );
    setIsSplitMode(false);
  };

  const handleMergeGroup = () => {
    const groupId = selectedCourse?.splitGroupId;
    if (!groupId) return;
    if (
      !window.confirm("分割したコースを 1 本に結合し直します。よろしいですか？")
    ) {
      return;
    }
    setCourses(previous => mergeSplitGroup(previous, groupId));
  };

  const handleExport = (
    label: string,
    fileName: string,
    build: () => string,
    mimeType: string,
  ) => {
    downloadTextFile(fileName, build(), mimeType);
    onExported();
    setExportMessage(`${label}（${fileName}）をダウンロードしました。`);
  };

  // 分割グループには結合したベース名ごとに色分け用の番号を振ってもよいが、
  // ここでは一覧に分割由来であることだけ示す
  const levelOptions: string[] =
    selectedCourse &&
    selectedCourse.detail.level !== "" &&
    !LEVEL_OPTIONS.includes(
      selectedCourse.detail.level as (typeof LEVEL_OPTIONS)[number],
    )
      ? [...LEVEL_OPTIONS, selectedCourse.detail.level]
      : [...LEVEL_OPTIONS];

  return (
    <Flex h="100%" minH={0}>
      <Flex
        direction="column"
        w="460px"
        minW="460px"
        borderRightWidth="1px"
        borderColor="gray.200"
        p={4}
        gap={3}
        overflowY="auto"
      >
        <Flex justify="space-between" align="center">
          <Box>
            <Heading size="md">{resort.nameJa}</Heading>
            <Text fontSize="xs" color="gray.500">
              {savedAt
                ? `最終保存: ${formatDateTime(savedAt)}（自動保存）`
                : "未保存"}
            </Text>
          </Box>
          <Button size="xs" variant="outline" onClick={onBackToLines}>
            コース線編集へ戻る
          </Button>
        </Flex>

        <Box
          borderWidth="1px"
          borderRadius="md"
          maxH="200px"
          minH="80px"
          flexShrink={0}
          overflowY="auto"
        >
          {courses.map(course => (
            <Flex
              key={course.id}
              px={3}
              py={2}
              gap={2}
              align="center"
              cursor="pointer"
              borderBottomWidth="1px"
              borderColor="gray.100"
              bg={course.id === selectedCourseId ? "blue.50" : undefined}
              _hover={{ bg: "gray.50" }}
              onClick={() => {
                setSelectedCourseId(course.id);
                setIsSplitMode(false);
              }}
            >
              <Text fontSize="sm" flex="1" truncate>
                {course.name}
              </Text>
              {course.splitGroupId && (
                <Text fontSize="xs" color="purple.600">
                  分割
                </Text>
              )}
              <Text fontSize="xs" color="gray.500">
                {course.detail.level || "難易度未設定"}
              </Text>
            </Flex>
          ))}
        </Box>

        <Box
          borderWidth="1px"
          borderColor="purple.200"
          flexShrink={0}
          bg="purple.50"
          borderRadius="md"
          p={2}
          fontSize="xs"
          color="gray.700"
        >
          <Text fontWeight="bold" color="purple.700" mb={1}>
            コース分割のすすめ
          </Text>
          <Text>次のような場合はコースの分割をおすすめします。</Text>
          <Text>・圧雪 / 非圧雪がコースの途中で分かれている</Text>
          <Text>・公式サイトが上部・中部・下部を分けて案内している</Text>
          <Text>・ナイター営業の有無がコースの上下で分かれている</Text>
          <Text mt={1}>
            分割すると「コース名_#上部」「コース名_#下部」のような名前が自動で付きます（4
            分割以上は #上部, #中部1, #中部2, …, #下部）。
          </Text>
        </Box>

        {selectedCourse ? (
          <Box borderWidth="1px" borderRadius="md" p={3} flexShrink={0}>
            <Flex gap={2} mb={3}>
              <Button
                size="xs"
                colorPalette="purple"
                variant={isSplitMode ? "solid" : "outline"}
                disabled={selectedCourse.coordinates.length < 3}
                title={
                  selectedCourse.coordinates.length < 3
                    ? "分割には中間の点が必要です（3 点以上）"
                    : undefined
                }
                onClick={() => setIsSplitMode(previous => !previous)}
              >
                {isSplitMode
                  ? "分割を中止"
                  : "このコースを分割（地図上の紫の点をクリック）"}
              </Button>
              {selectedCourse.splitGroupId && (
                <Button
                  size="xs"
                  variant="outline"
                  colorPalette="purple"
                  onClick={handleMergeGroup}
                >
                  分割を結合して戻す
                </Button>
              )}
            </Flex>

            <Flex direction="column" gap={2}>
              <Box>
                <FieldLabel>コース名</FieldLabel>
                <Input
                  size="sm"
                  value={selectedCourse.name}
                  onChange={event =>
                    updateSelectedCourse(course => ({
                      ...course,
                      name: event.target.value,
                    }))
                  }
                />
              </Box>

              <Box>
                <FieldLabel>難易度</FieldLabel>
                <select
                  style={selectStyle}
                  value={selectedCourse.detail.level}
                  onChange={event =>
                    updateDetail({ level: event.target.value })
                  }
                >
                  <option value="">未設定</option>
                  {levelOptions.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Box>

              <Flex gap={2}>
                <Box flex="1">
                  <FieldLabel>滑走距離（m）</FieldLabel>
                  <Input
                    size="sm"
                    type="number"
                    value={selectedCourse.detail.distance}
                    onChange={event =>
                      updateDetail({ distance: event.target.value })
                    }
                  />
                </Box>
                <Box flex="1">
                  <FieldLabel>平均斜度（°）</FieldLabel>
                  <Input
                    size="sm"
                    type="number"
                    value={selectedCourse.detail.avg}
                    onChange={event =>
                      updateDetail({ avg: event.target.value })
                    }
                  />
                </Box>
                <Box flex="1">
                  <FieldLabel>最大斜度（°）</FieldLabel>
                  <Input
                    size="sm"
                    type="number"
                    value={selectedCourse.detail.max}
                    onChange={event =>
                      updateDetail({ max: event.target.value })
                    }
                  />
                </Box>
              </Flex>

              <Box>
                <FieldLabel>圧雪</FieldLabel>
                <select
                  style={selectStyle}
                  value={selectedCourse.detail.piste}
                  onChange={event =>
                    updateDetail({ piste: event.target.value as PisteMark })
                  }
                >
                  {PISTE_OPTIONS.map(option => (
                    <option key={option || "empty"} value={option}>
                      {option === ""
                        ? "未設定"
                        : `${option}（${PISTE_DESCRIPTIONS[option]}）`}
                    </option>
                  ))}
                </select>
              </Box>

              <Flex gap={2}>
                <Box flex="1">
                  <FieldLabel>早朝営業</FieldLabel>
                  <select
                    style={selectStyle}
                    value={selectedCourse.detail.morning}
                    onChange={event =>
                      updateDetail({
                        morning: event.target.value as BinaryMark,
                      })
                    }
                  >
                    {BINARY_OPTIONS.map(option => (
                      <option key={option || "empty"} value={option}>
                        {option === ""
                          ? "未設定"
                          : option === "○"
                            ? "○（あり）"
                            : "×（なし）"}
                      </option>
                    ))}
                  </select>
                </Box>
                <Box flex="1">
                  <FieldLabel>ナイター営業</FieldLabel>
                  <select
                    style={selectStyle}
                    value={selectedCourse.detail.night}
                    onChange={event =>
                      updateDetail({ night: event.target.value as BinaryMark })
                    }
                  >
                    {BINARY_OPTIONS.map(option => (
                      <option key={option || "empty"} value={option}>
                        {option === ""
                          ? "未設定"
                          : option === "○"
                            ? "○（あり）"
                            : "×（なし）"}
                      </option>
                    ))}
                  </select>
                </Box>
              </Flex>
            </Flex>
          </Box>
        ) : (
          <Text fontSize="sm" color="gray.500">
            上の一覧からコースを選ぶと詳細を編集できます。
          </Text>
        )}

        <Box borderWidth="1px" borderRadius="md" p={3} flexShrink={0}>
          <Text fontSize="sm" fontWeight="bold" mb={2}>
            エクスポート
          </Text>
          <Flex wrap="wrap" gap={2}>
            <Button
              size="xs"
              colorPalette="blue"
              onClick={() =>
                handleExport(
                  "Rusutsu 用 slope_before",
                  `${resort.id}.geojson`,
                  () => buildRusutsuGeojson(courses),
                  "application/geo+json",
                )
              }
            >
              Rusutsu 用 GeoJSON
            </Button>
            <Button
              size="xs"
              colorPalette="blue"
              onClick={() =>
                handleExport(
                  "Rusutsu 用 slope_detail",
                  `${resort.id}.json`,
                  () => buildSlopeDetailJson(resort.id, courses),
                  "application/json",
                )
              }
            >
              Rusutsu 用 slope_detail
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                handleExport(
                  "標準 GeoJSON",
                  `${resort.id}_standard.geojson`,
                  () => buildStandardGeojson(courses),
                  "application/geo+json",
                )
              }
            >
              標準 GeoJSON
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                handleExport(
                  "CSV",
                  `${resort.id}.csv`,
                  () => buildCsv(courses),
                  "text/csv",
                )
              }
            >
              CSV
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                handleExport(
                  "KML",
                  `${resort.id}.kml`,
                  () => buildKml(resort.nameJa, courses),
                  "application/vnd.google-earth.kml+xml",
                )
              }
            >
              KML
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                handleExport(
                  "GPX",
                  `${resort.id}.gpx`,
                  () => buildGpx(resort.nameJa, courses),
                  "application/gpx+xml",
                )
              }
            >
              GPX
            </Button>
          </Flex>
          {exportMessage && (
            <Text mt={2} fontSize="xs" color="green.600">
              {exportMessage}
            </Text>
          )}
          <Text mt={2} fontSize="xs" color="gray.500">
            slope_before へ反映するには、Rusutsu 用 GeoJSON を
            src/private/data/resorts-temporary/slope_before/ へ、slope_detail を
            slope_detail/
            へ手動で配置してください（このページから直接書き込みは行いません）。
          </Text>
        </Box>
      </Flex>

      <Box flex="1" minW={0}>
        <EditorMap
          center={[resort.longitude, resort.latitude]}
          zoom={14}
          courses={courses}
          activeCourseId={selectedCourseId}
          mode={isSplitMode ? "split" : "view"}
          googleMapsApiKey={googleMapsApiKey}
          fitBoundsKey={fitBoundsKey}
          onSelectCourse={courseId => {
            if (!isSplitMode) setSelectedCourseId(courseId);
          }}
          onSplitVertex={handleSplitAtVertex}
        />
      </Box>
    </Flex>
  );
}
