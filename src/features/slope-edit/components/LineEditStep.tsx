"use client";

import { Box, Button, Flex, Heading, Input, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import type { EditorCourse, ResortOption, ValidationResult } from "../types";
import { createEmptyCourse } from "../utils/courseOps";
import { importCoursesFromFile } from "../utils/importFiles";
import { validateCourses } from "../utils/validation";

type LineEditStepProps = {
  resort: ResortOption;
  courses: EditorCourse[];
  setCourses: (updater: (courses: EditorCourse[]) => EditorCourse[]) => void;
  savedAt: string | null;
  activeCourseId: string | null;
  onActiveCourseIdChange: (courseId: string | null) => void;
  isDrawing: boolean;
  onDrawingChange: (isDrawing: boolean) => void;
  onFitBounds: () => void;
  onProceed: () => void;
  onBackToSelect: () => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

export function LineEditStep({
  resort,
  courses,
  setCourses,
  savedAt,
  activeCourseId,
  onActiveCourseIdChange,
  isDrawing,
  onDrawingChange,
  onFitBounds,
  onProceed,
  onBackToSelect,
}: LineEditStepProps) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [draggedCourseId, setDraggedCourseId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    courseId: string;
    position: "before" | "after";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Escape キーで描画モードを終了する
  useEffect(() => {
    if (!isDrawing) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDrawingChange(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawing, onDrawingChange]);

  const updateActiveCourse = (
    updater: (course: EditorCourse) => EditorCourse,
  ) => {
    if (!activeCourseId) return;
    setCourses(previous =>
      previous.map(course =>
        course.id === activeCourseId ? updater(course) : course,
      ),
    );
  };

  const handleAddCourse = () => {
    const course = createEmptyCourse();
    setCourses(previous => [...previous, course]);
    onActiveCourseIdChange(course.id);
    onDrawingChange(true);
    setValidation(null);
  };

  const handleDeleteCourse = (courseId: string) => {
    const target = courses.find(course => course.id === courseId);
    if (!target) return;
    const label = target.name || "名前未入力のコース";
    if (!window.confirm(`「${label}」を削除します。よろしいですか？`)) return;
    setCourses(previous => previous.filter(course => course.id !== courseId));
    if (activeCourseId === courseId) {
      onActiveCourseIdChange(null);
      onDrawingChange(false);
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const result = await importCoursesFromFile(file);
      if (result.courses.length === 0) {
        setImportMessage("読み込めるコース線がありませんでした。");
        return;
      }
      setCourses(previous => [...previous, ...result.courses]);
      onFitBounds();
      setImportMessage(
        `${result.courses.length} コースを読み込みました。` +
          (result.skipped > 0
            ? `（LineString 以外など ${result.skipped} 件はスキップ）`
            : ""),
      );
    } catch (error) {
      setImportMessage(
        `読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleProceed = (ignoreWarnings: boolean) => {
    const result = validateCourses(courses);
    setValidation(result);
    if (result.errors.length > 0) return;
    if (result.warnings.length > 0 && !ignoreWarnings) return;
    onProceed();
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
        <Button size="xs" variant="outline" onClick={onBackToSelect}>
          スキー場選択へ戻る
        </Button>
      </Flex>

      <Flex gap={2}>
        <Button size="sm" colorPalette="blue" onClick={handleAddCourse}>
          ＋ コースを追加
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
        >
          ファイルを読み込む
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onFitBounds}
          disabled={courses.every(course => course.coordinates.length === 0)}
        >
          全体表示
        </Button>
      </Flex>
      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson,.json,.kml,.gpx,.csv"
        style={{ display: "none" }}
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handleImportFile(file);
          event.target.value = "";
        }}
      />
      {importMessage && (
        <Text fontSize="xs" color="gray.600">
          {importMessage}
        </Text>
      )}

      <Box
        borderWidth="1px"
        borderRadius="md"
        p={2}
        flexShrink={0}
        bg="gray.50"
        fontSize="xs"
        color="gray.600"
      >
        <Text fontWeight="bold" mb={1}>
          地図の操作
        </Text>
        <Text>
          ・「コースを追加」→ 地図をクリックして始点から終点へ点を打つ
        </Text>
        <Text>・オレンジの終点をクリック（または Esc）で描画終了</Text>
        <Text>・赤い点: ドラッグで移動 / 右クリックで削除</Text>
        <Text>・青い点: クリックで中間に点を追加</Text>
      </Box>

      <Box
        flex="1"
        minH="160px"
        borderWidth="1px"
        borderRadius="md"
        overflowY="auto"
      >
        {courses.map((course, index) => {
          const isActive = course.id === activeCourseId;
          return (
            <Box
              key={course.id}
              p={2}
              borderBottomWidth="1px"
              borderColor="gray.100"
              bg={isActive ? "blue.50" : undefined}
              opacity={course.id === draggedCourseId ? 0.45 : 1}
              boxShadow={
                dropTarget?.courseId === course.id
                  ? dropTarget.position === "before"
                    ? "inset 0 3px 0 var(--chakra-colors-blue-500)"
                    : "inset 0 -3px 0 var(--chakra-colors-blue-500)"
                  : undefined
              }
              cursor="pointer"
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
              onClick={() => {
                onActiveCourseIdChange(course.id);
                onDrawingChange(false);
              }}
            >
              <Flex gap={2} align="center">
                <Text
                  aria-label={`${course.name || `${index + 1}番目のコース`}を並び替え`}
                  color="gray.400"
                  fontSize="lg"
                  lineHeight="1"
                  cursor="grab"
                  userSelect="none"
                  draggable
                  onDragStart={event => {
                    setDraggedCourseId(course.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", course.id);
                  }}
                  onDragEnd={clearDragState}
                  onClick={event => event.stopPropagation()}
                >
                  ⠿
                </Text>
                <Text fontSize="xs" color="gray.500" w="20px">
                  {index + 1}
                </Text>
                <Input
                  size="sm"
                  flex="1"
                  placeholder="コース名"
                  value={course.name}
                  disabled={course.unnamed}
                  onClick={event => event.stopPropagation()}
                  onChange={event => {
                    const name = event.target.value;
                    setCourses(previous =>
                      previous.map(item =>
                        item.id === course.id ? { ...item, name } : item,
                      ),
                    );
                  }}
                />
                <Button
                  size="xs"
                  variant={course.unnamed ? "solid" : "outline"}
                  colorPalette="gray"
                  title="コース名が不明な場合に選択します（エクスポート時に「無名_1」のような名前が付きます）"
                  onClick={event => {
                    event.stopPropagation();
                    setCourses(previous =>
                      previous.map(item =>
                        item.id === course.id
                          ? {
                              ...item,
                              unnamed: !item.unnamed,
                              name: item.unnamed ? item.name : "",
                            }
                          : item,
                      ),
                    );
                  }}
                >
                  名前なし
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  colorPalette="red"
                  onClick={event => {
                    event.stopPropagation();
                    handleDeleteCourse(course.id);
                  }}
                >
                  削除
                </Button>
              </Flex>
              <Flex mt={1} gap={2} align="center" pl="28px">
                <Text fontSize="xs" color="gray.500">
                  {course.coordinates.length} 点
                </Text>
                {course.unnamed && (
                  <Text fontSize="xs" color="orange.600">
                    無名コース
                  </Text>
                )}
                {isActive && (
                  <>
                    <Button
                      size="xs"
                      variant={isDrawing ? "solid" : "outline"}
                      colorPalette="orange"
                      onClick={event => {
                        event.stopPropagation();
                        onDrawingChange(!isDrawing);
                      }}
                    >
                      {isDrawing ? "描画終了" : "点を追加"}
                    </Button>
                    {course.coordinates.length > 0 && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={event => {
                          event.stopPropagation();
                          updateActiveCourse(item => ({
                            ...item,
                            coordinates: item.coordinates.slice(0, -1),
                          }));
                        }}
                      >
                        最後の点を取消
                      </Button>
                    )}
                  </>
                )}
              </Flex>
            </Box>
          );
        })}
        {courses.length === 0 && (
          <Text p={3} fontSize="sm" color="gray.500">
            「コースを追加」を押して、地図上で始点から終点へ順に点を打ってください。
          </Text>
        )}
      </Box>
      {courses.length > 1 && (
        <Text fontSize="xs" color="gray.500" mt={-2}>
          ⠿をドラッグして並び替えられます。変更した順番が保存後の GeoJSON
          のコース順になります。
        </Text>
      )}

      {validation && validation.errors.length > 0 && (
        <Box borderWidth="1px" borderColor="red.300" borderRadius="md" p={2}>
          {validation.errors.map(error => (
            <Text key={error} fontSize="xs" color="red.600">
              ・{error}
            </Text>
          ))}
        </Box>
      )}
      {validation &&
        validation.errors.length === 0 &&
        validation.warnings.length > 0 && (
          <Box
            borderWidth="1px"
            borderColor="orange.300"
            borderRadius="md"
            p={2}
          >
            {validation.warnings.map(warning => (
              <Text key={warning} fontSize="xs" color="orange.600">
                ・{warning}
              </Text>
            ))}
            <Button
              mt={2}
              size="xs"
              colorPalette="orange"
              onClick={() => handleProceed(true)}
            >
              警告を無視して次へ進む
            </Button>
          </Box>
        )}

      <Button
        colorPalette="blue"
        flexShrink={0}
        onClick={() => handleProceed(false)}
        disabled={courses.length === 0}
      >
        次へ（コース分割・詳細編集）
      </Button>
    </Flex>
  );
}
