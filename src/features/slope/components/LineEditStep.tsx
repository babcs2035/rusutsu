"use client";

import { TriangleAlert as TriangleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
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

  const handleDeleteCourseConfirm = () => {
    const courseId = deletingCourseId;
    if (!courseId) {
      setDeleteDialogOpen(false);
      return;
    }
    const target = courses.find(course => course.id === courseId);
    if (!target) return;
    setCourses(previous => previous.filter(course => course.id !== courseId));
    if (activeCourseId === courseId) {
      onActiveCourseIdChange(null);
      onDrawingChange(false);
    }
    setDeleteDialogOpen(false);
    setDeletingCourseId(null);
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

  const dropShadow = dropTarget
    ? dropTarget.position === "before"
      ? "inset 0 3px 0 #3b82f6"
      : "inset 0 -3px 0 #3b82f6"
    : undefined;

  return (
    <div className="flex h-full min-h-0 w-[min(460px,60vw)] lg:w-[460px] min-w-0 lg:min-w-[460px] flex-col border-r border-gray-200 gap-3 overflow-y-auto p-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold font-[var(--font-heading)]">
            {resort.nameJa}
          </h2>
          <p className="text-xs text-gray-500">
            {savedAt
              ? `最終保存: ${formatDateTime(savedAt)}（自動保存）`
              : "未保存"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onBackToSelect}>
          スキー場選択へ戻る
        </Button>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="default" onClick={handleAddCourse}>
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
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson,.json,.kml,.gpx,.csv"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handleImportFile(file);
          event.target.value = "";
        }}
      />
      {importMessage && (
        <p className="text-xs text-gray-600">{importMessage}</p>
      )}

      <Card className="flex-shrink-0">
        <CardContent className="p-2">
          <p className="mb-1 font-semibold text-xs text-gray-600">地図の操作</p>
          <p className="text-xs text-gray-600">
            ・「コースを追加」→ 地図をクリックして始点から終点へ点を打つ
          </p>
          <p className="text-xs text-gray-600">
            ・オレンジの終点をクリック（または Esc）で描画終了
          </p>
          <p className="text-xs text-gray-600">
            ・赤い点: ドラッグで移動 / 右クリックで削除
          </p>
          <p className="text-xs text-gray-600">
            ・青い点: クリックで中間に点を追加
          </p>
        </CardContent>
      </Card>

      <div className="min-h-[160px] flex-1 overflow-y-auto rounded-md border">
        {courses.map((course, index) => {
          const isActive = course.id === activeCourseId;
          return (
            <div
              key={course.id}
              role="button"
              tabIndex={0}
              className={cn(
                "border-b border-gray-100 p-2 cursor-pointer",
                isActive && "bg-blue-50",
                course.id === draggedCourseId && "opacity-45",
              )}
              style={{
                boxShadow: dropShadow,
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
              onClick={() => {
                onActiveCourseIdChange(course.id);
                onDrawingChange(false);
              }}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onActiveCourseIdChange(course.id);
                  onDrawingChange(false);
                }
              }}
            >
              <div className="flex gap-2 items-center">
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${course.name || `${index + 1}番目のコース`}を並び替え`}
                  className="text-lg leading-none cursor-grab select-none"
                  draggable
                  onDragStart={event => {
                    setDraggedCourseId(course.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", course.id);
                  }}
                  onDragEnd={clearDragState}
                  onClick={event => event.stopPropagation()}
                  onKeyDown={event => event.stopPropagation()}
                >
                  ⠿
                </span>
                <span className="text-xs text-gray-500 w-5 shrink-0">
                  {index + 1}
                </span>
                <Input
                  className="h-9 flex-1 rounded-md border border-input bg-white px-3 text-sm shadow-sm"
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
                <TooltipProvider delay={0}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="sm"
                          variant={course.unnamed ? "default" : "outline"}
                          className="text-gray-500 hover:text-gray-700"
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
                      }
                    />
                    <TooltipContent
                      side="top"
                      className="max-w-[240px] text-xs"
                    >
                      コース名が不明な場合に選択します（エクスポート時に「無名_1」のような名前が付きます）
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <ConfirmDialog
                  open={deleteDialogOpen && deletingCourseId === course.id}
                  onOpenChange={open => {
                    if (!open) {
                      setDeleteDialogOpen(false);
                      setDeletingCourseId(null);
                    }
                  }}
                  title="コースの削除"
                  description={`「${course.name || "名前未入力のコース"}」を削除します。よろしいですか？`}
                  onConfirm={handleDeleteCourseConfirm}
                  confirmLabel="削除する"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-700 hover:text-red-800 hover:bg-red-50"
                  onClick={event => {
                    event.stopPropagation();
                    setDeletingCourseId(course.id);
                    setDeleteDialogOpen(true);
                  }}
                >
                  削除
                </Button>
              </div>
              <div className="flex mt-1 gap-2 items-center pl-7">
                <span className="text-xs text-gray-500">
                  {course.coordinates.length} 点
                </span>
                {course.unnamed && (
                  <span className="text-xs text-orange-900">無名コース</span>
                )}
                {isActive && (
                  <>
                    <Button
                      size="sm"
                      variant={isDrawing ? "default" : "outline"}
                      className="text-orange-900 hover:text-orange-700 hover:bg-orange-50"
                      onClick={event => {
                        event.stopPropagation();
                        onDrawingChange(!isDrawing);
                      }}
                    >
                      {isDrawing ? "描画終了" : "点を追加"}
                    </Button>
                    {course.coordinates.length > 0 && (
                      <Button
                        size="sm"
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
              </div>
            </div>
          );
        })}
        {courses.length === 0 && (
          <p className="p-3 text-sm font-semibold text-gray-500">
            「コースを追加」を押して、地図上で始点から終点へ順に点を打ってください。
          </p>
        )}
      </div>
      {courses.length > 1 && (
        <p className="text-xs text-gray-500 -mt-2">
          ⠿をドラッグして並び替えられます。変更した順番が保存後の GeoJSON
          のコース順になります。
        </p>
      )}

      {validation && validation.errors.length > 0 && (
        <Alert variant="destructive" className="border-red-300 bg-red-50">
          <TriangleAlertIcon className="h-4 w-4 text-red-700" />
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>
            {validation.errors.map(error => (
              <p key={error} className="text-xs text-red-700">
                ・{error}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}
      {validation &&
        validation.errors.length === 0 &&
        validation.warnings.length > 0 && (
          <Alert className="border-orange-300 bg-orange-50">
            <TriangleAlertIcon className="h-4 w-4 text-orange-900" />
            <AlertTitle className="text-orange-900">警告</AlertTitle>
            <AlertDescription className="flex flex-col gap-1 text-orange-900">
              {validation.warnings.map(warning => (
                <p key={warning}>・{warning}</p>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="text-orange-900 hover:text-orange-700 hover:bg-orange-100"
                onClick={() => handleProceed(true)}
              >
                警告を無視して次へ進む
              </Button>
            </AlertDescription>
          </Alert>
        )}

      <Button
        variant="default"
        className="w-full flex-shrink-0"
        onClick={() => handleProceed(false)}
        disabled={courses.length === 0}
      >
        次へ（コース分割・詳細編集）
      </Button>
    </div>
  );
}
