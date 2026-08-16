"use client";

import { TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
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

  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  const handleMergeGroup = () => {
    const groupId = selectedCourse?.splitGroupId;
    if (!groupId) return;
    setCourses(previous =>
      mergeSplitGroup(previous, groupId, resort.searchName),
    );
    setMergeDialogOpen(false);
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
    <div className="flex h-full min-h-0 w-[min(460px,60vw)] lg:w-[460px] min-w-0 lg:min-w-[460px] flex-col border-r border-gray-200 p-4 gap-3 overflow-y-auto">
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
        <Button size="xs" variant="outline" onClick={onBackToLines}>
          コース線編集へ戻る
        </Button>
      </div>

      <ScrollArea className="border border-gray-200 rounded-md max-h-[200px] min-h-[80px] flex-shrink-0">
        {courses.map(course => (
          <div
            key={course.id}
            role="button"
            tabIndex={0}
            className={cn(
              "flex px-3 py-2 gap-2 items-center cursor-grab border-b border-gray-100 hover:bg-gray-50 hover:text-gray-900 active:cursor-grabbing transition-smooth",
              course.id === selectedCourseId && "bg-blue-50",
              course.id === draggedCourseId && "opacity-45",
              dropTarget?.courseId === course.id &&
                (dropTarget.position === "before"
                  ? "border-t-[3px] border-t-blue-600"
                  : "border-b-[3px] border-b-blue-600"),
            )}
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
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectedCourseIdChange(course.id);
                onSplitModeChange(false);
              }
            }}
          >
            <p
              aria-hidden="true"
              className="text-gray-400 text-lg leading-none select-none"
            >
              &#x283f;
            </p>
            <p className="text-sm flex-1 truncate">{course.name}</p>
            {course.splitGroupId && (
              <p className="text-xs text-purple-900">分割</p>
            )}
            <p className="text-xs text-gray-500">
              {course.detail.level || "難易度未設定"}
            </p>
          </div>
        ))}
      </ScrollArea>
      <p className="text-xs text-gray-500 -mt-1">
        コースをドラッグして並び替えられます。変更した順番が、保存後の GeoJSON
        のコース順になります。
      </p>

      <Card className="flex-shrink-0">
        <CardContent className="p-2">
          <p className="mb-1 font-medium text-purple-900 text-xs">
            コース分割のすすめ
          </p>
          <p className="text-xs text-gray-700">
            次のような場合はコースの分割をおすすめします。
          </p>
          <p className="text-xs text-gray-700">
            ・圧雪 / 非圧雪がコースの途中で分かれている
          </p>
          <p className="text-xs text-gray-700">
            ・公式サイトが上部・中部・下部を分けて案内している
          </p>
          <p className="text-xs text-gray-700">
            ・ナイター営業の有無がコースの上下で分かれている
          </p>
          <p className="mt-1 text-xs text-gray-700">
            分割すると「コース名_#上部」「コース名_#下部」のような名前が自動で付きます（4
            分割以上は #上部, #中部1, #中部2, …, #下部）。
          </p>
        </CardContent>
      </Card>

      {selectedCourse ? (
        <div className="border border-gray-200 rounded-md p-3 flex-shrink-0">
          <div className="flex gap-2 mb-3">
            <Button
              size="xs"
              variant={isSplitMode ? "default" : "outline"}
              className={
                isSplitMode
                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                  : "border-purple-300 text-purple-900"
              }
              disabled={selectedCourse.coordinates.length < 3}
              onClick={() => onSplitModeChange(!isSplitMode)}
            >
              {isSplitMode
                ? "分割を中止"
                : "このコースを分割（地図上の紫の点をクリック）"}
            </Button>
            {selectedCourse.splitGroupId && (
              <>
                <ConfirmDialog
                  open={mergeDialogOpen}
                  onOpenChange={setMergeDialogOpen}
                  title="分割の結合"
                  description="分割したコースを 1 本に結合し直します。よろしいですか？"
                  onConfirm={handleMergeGroup}
                  confirmLabel="結合する"
                />
                <Button
                  size="xs"
                  variant="outline"
                  className="border-purple-300 text-purple-900"
                  onClick={() => setMergeDialogOpen(true)}
                >
                  分割を結合して戻す
                </Button>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div>
              <Label>コース名</Label>
              <Input
                className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
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
            </div>

            <div>
              <Label>難易度</Label>
              <Select
                value={selectedCourse.detail.level}
                onValueChange={v =>
                  updateDetail({ level: v === "__empty__" ? "" : (v ?? "") })
                }
              >
                <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">未設定</SelectItem>
                  {LEVEL_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label>滑走距離（m）</Label>
                <Input
                  className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
                  type="number"
                  value={selectedCourse.detail.distance}
                  onChange={event =>
                    updateDetail({ distance: event.target.value })
                  }
                />
              </div>
              <div className="flex-1">
                <Label>平均斜度（°）</Label>
                <Input
                  className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
                  type="number"
                  value={selectedCourse.detail.avg}
                  onChange={event => updateDetail({ avg: event.target.value })}
                />
              </div>
              <div className="flex-1">
                <Label>最大斜度（°）</Label>
                <Input
                  className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
                  type="number"
                  value={selectedCourse.detail.max}
                  onChange={event => updateDetail({ max: event.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>圧雪</Label>
              <Select
                value={selectedCourse.detail.piste}
                onValueChange={v =>
                  v && updateDetail({ piste: v as PisteMark })
                }
              >
                <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PISTE_OPTIONS.map(option => (
                    <SelectItem key={option || "empty"} value={option}>
                      {option === ""
                        ? "未設定"
                        : `${option}（${PISTE_DESCRIPTIONS[option]}）`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label>早朝営業</Label>
                <Select
                  value={selectedCourse.detail.morning}
                  onValueChange={v =>
                    v && updateDetail({ morning: v as BinaryMark })
                  }
                >
                  <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BINARY_OPTIONS.map(option => (
                      <SelectItem key={option || "empty"} value={option}>
                        {option === ""
                          ? "未設定"
                          : option === "○"
                            ? "○（あり）"
                            : "×（なし）"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label>ナイター営業</Label>
                <Select
                  value={selectedCourse.detail.night}
                  onValueChange={v =>
                    v && updateDetail({ night: v as BinaryMark })
                  }
                >
                  <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BINARY_OPTIONS.map(option => (
                      <SelectItem key={option || "empty"} value={option}>
                        {option === ""
                          ? "未設定"
                          : option === "○"
                            ? "○（あり）"
                            : "×（なし）"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>画像URL</Label>
              <Input
                className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
                type="url"
                placeholder="https://example.com/course.jpg"
                value={selectedCourse.detail.image}
                onChange={event => updateDetail({ image: event.target.value })}
              />
            </div>

            <div>
              <Label>検索ワード</Label>
              <Input
                className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
                placeholder="スキー場名 コース名"
                value={selectedCourse.detail.searchWord}
                onChange={event =>
                  updateDetail({ searchWord: event.target.value })
                }
              />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          上の一覧からコースを選ぶと詳細を編集できます。
        </p>
      )}

      <div className="border border-gray-200 rounded-md p-3 flex-shrink-0">
        <p className="text-sm font-bold mb-2">エクスポート</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="xs"
            variant="default"
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
            variant="default"
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
        </div>
        {exportMessage && (
          <p className="mt-2 text-xs text-green-900">{exportMessage}</p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          確認画面から slope_before へ直接保存できます。各形式のダウンロードは
          バックアップや外部ツール用です。
        </p>
      </div>

      {showProceedWarning && incompleteCourses.length > 0 && (
        <Alert className="border-orange-300 bg-orange-50 flex-shrink-0">
          <TriangleAlert className="h-4 w-4 text-orange-900" />
          <AlertTitle>未入力の詳細情報があります</AlertTitle>
          <AlertDescription>
            次の項目を修正するか、未入力のまま確認画面へ進んでください。
          </AlertDescription>
          <ScrollArea className="flex flex-col gap-1 mt-2 max-h-[140px]">
            {incompleteCourses.map(({ course, index, emptyFields }) => (
              <Button
                key={course.id}
                size="xs"
                variant="ghost"
                className="justify-start text-purple-900 hover:text-purple-700"
                onClick={() => onSelectedCourseIdChange(course.id)}
              >
                {index + 1}. {course.name || "（コース名未入力）"}:{" "}
                {emptyFields
                  .map(key => REQUIRED_COURSE_FIELD_LABELS[key])
                  .join("、")}
              </Button>
            ))}
          </ScrollArea>
          <div className="flex gap-2 mt-3">
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
            <Button size="sm" variant="destructive" onClick={onProceed}>
              未入力のまま進む
            </Button>
          </div>
        </Alert>
      )}

      {(!showProceedWarning || incompleteCourses.length === 0) && (
        <Button variant="default" className="shrink-0" onClick={handleProceed}>
          次へ（確認・保存）
        </Button>
      )}
    </div>
  );
}
