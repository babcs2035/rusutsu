"use client";

import { Box, Button, Flex, Heading, Input, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { updateDefaultSearchWord } from "@/shared/utils/searchWord";
import {
  BINARY_OPTIONS,
  LEVEL_OPTIONS,
  PISTE_DESCRIPTIONS,
  PISTE_OPTIONS,
  REQUIRED_COURSE_FIELD_LABELS,
} from "../constants";
import type {
  BinaryMark,
  CourseDetail,
  EditorCourse,
  PisteMark,
  ResortOption,
} from "../types";
import { mergeSplitGroup } from "../utils/courseOps";
import {
  buildCsv,
  buildGpx,
  buildKml,
  buildRusutsuGeojson,
  buildSlopeDetailJson,
  buildStandardGeojson,
  downloadTextFile,
} from "../utils/exportFiles";
import { getEmptyRequiredCourseFields } from "../utils/validation";

type DetailEditStepProps = {
  resort: ResortOption;
  courses: EditorCourse[];
  setCourses: (updater: (courses: EditorCourse[]) => EditorCourse[]) => void;
  savedAt: string | null;
  selectedCourseId: string | null;
  onSelectedCourseIdChange: (courseId: string | null) => void;
  isSplitMode: boolean;
  onSplitModeChange: (isSplitMode: boolean) => void;
  onBackToLines: () => void;
  onProceed: () => void;
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
  savedAt,
  selectedCourseId,
  onSelectedCourseIdChange,
  isSplitMode,
  onSplitModeChange,
  onBackToLines,
  onProceed,
  onExported,
}: DetailEditStepProps) {
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [showProceedWarning, setShowProceedWarning] = useState(false);
  const [draggedCourseId, setDraggedCourseId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    courseId: string;
    position: "before" | "after";
  } | null>(null);

  const selectedCourse =
    courses.find(course => course.id === selectedCourseId) ?? null;

  const incompleteCourses = useMemo(
    () =>
      courses
        .map((course, index) => ({
          course,
          index,
          emptyFields: getEmptyRequiredCourseFields(course),
        }))
        .filter(item => item.emptyFields.length > 0),
    [courses],
  );

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

  const reorderCourse = (
    sourceCourseId: string,
    targetCourseId: string,
    position: "before" | "after",
  ): void => {
    if (sourceCourseId === targetCourseId) return;
    setCourses(previous => {
      const sourceIndex = previous.findIndex(
        course => course.id === sourceCourseId,
      );
      if (sourceIndex < 0) return previous;

      const reordered = [...previous];
      const [draggedCourse] = reordered.splice(sourceIndex, 1);
      const targetIndex = reordered.findIndex(
        course => course.id === targetCourseId,
      );
      if (targetIndex < 0) return previous;

      reordered.splice(
        position === "after" ? targetIndex + 1 : targetIndex,
        0,
        draggedCourse,
      );
      return reordered;
    });
  };

  const clearDragState = (): void => {
    setDraggedCourseId(null);
    setDropTarget(null);
  };

  const handleMergeGroup = () => {
    const groupId = selectedCourse?.splitGroupId;
    if (!groupId) return;
    if (
      !window.confirm("分割したコースを 1 本に結合し直します。よろしいですか？")
    ) {
      return;
    }
    setCourses(previous =>
      mergeSplitGroup(previous, groupId, resort.searchName),
    );
  };

  const handleProceed = () => {
    if (incompleteCourses.length === 0) {
      onProceed();
      return;
    }
    setShowProceedWarning(true);
    onSelectedCourseIdChange(incompleteCourses[0].course.id);
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

  return (
    <Flex
      direction="column"
      h="100%"
      minH={0}
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
            cursor="grab"
            borderBottomWidth="1px"
            borderColor="gray.100"
            bg={course.id === selectedCourseId ? "blue.50" : undefined}
            opacity={course.id === draggedCourseId ? 0.45 : 1}
            boxShadow={
              dropTarget?.courseId === course.id
                ? dropTarget.position === "before"
                  ? "inset 0 3px 0 var(--chakra-colors-blue-500)"
                  : "inset 0 -3px 0 var(--chakra-colors-blue-500)"
                : undefined
            }
            _hover={{ bg: "gray.50" }}
            _active={{ cursor: "grabbing" }}
            draggable
            onDragStart={event => {
              setDraggedCourseId(course.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", course.id);
            }}
            onDragOver={event => {
              if (draggedCourseId === null || draggedCourseId === course.id) {
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              const bounds = event.currentTarget.getBoundingClientRect();
              setDropTarget({
                courseId: course.id,
                position:
                  event.clientY < bounds.top + bounds.height / 2
                    ? "before"
                    : "after",
              });
            }}
            onDrop={event => {
              event.preventDefault();
              const sourceCourseId =
                draggedCourseId || event.dataTransfer.getData("text/plain");
              const bounds = event.currentTarget.getBoundingClientRect();
              reorderCourse(
                sourceCourseId,
                course.id,
                event.clientY < bounds.top + bounds.height / 2
                  ? "before"
                  : "after",
              );
              clearDragState();
            }}
            onDragEnd={clearDragState}
            onClick={() => {
              onSelectedCourseIdChange(course.id);
              onSplitModeChange(false);
            }}
          >
            <Text
              aria-hidden="true"
              color="gray.400"
              fontSize="lg"
              lineHeight="1"
              userSelect="none"
            >
              ⠿
            </Text>
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
      <Text fontSize="xs" color="gray.500" mt={-2}>
        コースをドラッグして並び替えられます。変更した順番が、保存後の GeoJSON
        のコース順になります。
      </Text>

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
              onClick={() => onSplitModeChange(!isSplitMode)}
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
                  updateSelectedCourse(course => {
                    const nextName = event.target.value;
                    return {
                      ...course,
                      name: nextName,
                      detail: {
                        ...course.detail,
                        searchWord: updateDefaultSearchWord(
                          course.detail.searchWord,
                          resort.searchName,
                          course.name,
                          nextName,
                        ),
                      },
                    };
                  })
                }
              />
            </Box>

            <Box>
              <FieldLabel>難易度</FieldLabel>
              <select
                style={selectStyle}
                value={selectedCourse.detail.level}
                onChange={event => updateDetail({ level: event.target.value })}
              >
                <option value="">未設定</option>
                {LEVEL_OPTIONS.map(option => (
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
                  onChange={event => updateDetail({ avg: event.target.value })}
                />
              </Box>
              <Box flex="1">
                <FieldLabel>最大斜度（°）</FieldLabel>
                <Input
                  size="sm"
                  type="number"
                  value={selectedCourse.detail.max}
                  onChange={event => updateDetail({ max: event.target.value })}
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

            <Box>
              <FieldLabel>画像URL</FieldLabel>
              <Input
                size="sm"
                type="url"
                placeholder="https://example.com/course.jpg"
                value={selectedCourse.detail.image}
                onChange={event => updateDetail({ image: event.target.value })}
              />
            </Box>

            <Box>
              <FieldLabel>検索ワード</FieldLabel>
              <Input
                size="sm"
                placeholder="スキー場名 コース名"
                value={selectedCourse.detail.searchWord}
                onChange={event =>
                  updateDetail({ searchWord: event.target.value })
                }
              />
            </Box>
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
                () => buildRusutsuGeojson(resort.id, courses),
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
          確認画面から slope_before へ直接保存できます。各形式のダウンロードは
          バックアップや外部ツール用です。
        </Text>
      </Box>

      {showProceedWarning && incompleteCourses.length > 0 && (
        <Box
          borderWidth="1px"
          borderColor="orange.300"
          borderRadius="md"
          p={3}
          bg="orange.50"
          flexShrink={0}
        >
          <Text fontSize="sm" fontWeight="bold" color="orange.800">
            未入力の詳細情報があります
          </Text>
          <Text fontSize="xs" color="orange.700" mt={1}>
            次の項目を修正するか、未入力のまま確認画面へ進んでください。
          </Text>
          <Flex direction="column" gap={1} mt={2} maxH="140px" overflowY="auto">
            {incompleteCourses.map(({ course, index, emptyFields }) => (
              <Button
                key={course.id}
                size="xs"
                variant="ghost"
                justifyContent="flex-start"
                colorPalette="orange"
                onClick={() => onSelectedCourseIdChange(course.id)}
              >
                {index + 1}. {course.name || "（コース名未入力）"}:{" "}
                {emptyFields
                  .map(key => REQUIRED_COURSE_FIELD_LABELS[key])
                  .join("、")}
              </Button>
            ))}
          </Flex>
          <Flex gap={2} mt={3}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowProceedWarning(false);
                onSelectedCourseIdChange(incompleteCourses[0].course.id);
              }}
            >
              入力を修正する
            </Button>
            <Button size="sm" colorPalette="orange" onClick={onProceed}>
              未入力のまま進む
            </Button>
          </Flex>
        </Box>
      )}

      {(!showProceedWarning || incompleteCourses.length === 0) && (
        <Button colorPalette="blue" flexShrink={0} onClick={handleProceed}>
          次へ（確認・保存）
        </Button>
      )}
    </Flex>
  );
}
