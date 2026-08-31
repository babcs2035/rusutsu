"use client";

import {
  ArrowLeft,
  ListOrdered,
  Maximize2,
  Merge,
  Plus,
  Tag,
  TriangleAlert as TriangleAlertIcon,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { OrderOrganizerDialog } from "@/features/latest-status-mapping/components/OrderOrganizerDialog";
import { useLatestStatusMapping } from "@/features/latest-status-mapping/hooks/useLatestStatusMapping";
import type { ApplyGeojsonOrderResult } from "@/features/latest-status-mapping/types";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { PanelSection } from "@/shared/components/PanelSection";
import { moveItem, useSortableList } from "@/shared/hooks/useSortableList";
import type { EditorCourse, ResortOption, ValidationResult } from "../types";
import { createEmptyCourse, mergeSplitGroup } from "../utils/courseOps";
import { importCoursesFromFile } from "../utils/importFiles";
import { validateCourses } from "../utils/validation";
import { CourseMappingList } from "./CourseMappingList";
import { MergeCoursesPanel, type MergeDraft } from "./MergeCoursesPanel";

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
  onApplyGeojsonOrder: (
    geojsonNames: string[],
  ) => Promise<ApplyGeojsonOrderResult>;
  onBackToSelect: () => void;
  backLabel?: string;
  showLabels: boolean;
  onShowLabelsChange: (showLabels: boolean) => void;
  isSplitMode: boolean;
  onSplitModeChange: (isSplitMode: boolean) => void;
  resortSearchName: string;
  mergeDraft: MergeDraft | null;
  canMerge: boolean;
  onMergeStart: () => void;
  onMergeCancel: () => void;
  onMergeConfirm: () => void;
  onMergeKeepChange: MergeCoursesPanelHandlers["onKeepChange"];
  onMergeClearSlot: MergeCoursesPanelHandlers["onClearSlot"];
  onMergeNameChange: (name: string) => void;
  onMergeDetailFromChange: (detailFrom: "first" | "second") => void;
};

type MergeCoursesPanelHandlers = Pick<
  React.ComponentProps<typeof MergeCoursesPanel>,
  "onKeepChange" | "onClearSlot"
>;

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
  onApplyGeojsonOrder,
  onBackToSelect,
  backLabel = "スキー場選択へ戻る",
  showLabels,
  onShowLabelsChange,
  isSplitMode,
  onSplitModeChange,
  resortSearchName,
  mergeDraft,
  canMerge,
  onMergeStart,
  onMergeCancel,
  onMergeConfirm,
  onMergeKeepChange,
  onMergeClearSlot,
  onMergeNameChange,
  onMergeDetailFromChange,
}: LineEditStepProps) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const geojsonNames = useMemo(
    () =>
      courses
        .filter(course => course.skiId === resort.id)
        .map(course => course.name.trim())
        .filter(Boolean),
    [courses, resort.id],
  );
  const isMerging = mergeDraft !== null;

  const mapping = useLatestStatusMapping({
    resortId: resort.id,
    kind: "courses",
    geojsonNames,
  });

  const sortable = useSortableList({
    ids: courses.map(course => course.id),
    onReorder: (from, to) =>
      setCourses(previous => moveItem(previous, from, to)),
    disabled: isMerging,
  });

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
    const course = {
      ...createEmptyCourse(),
      skiId: resort.id,
      originalSkiId: resort.id,
    };
    setCourses(previous => [...previous, course]);
    onActiveCourseIdChange(course.id);
    onDrawingChange(true);
    setValidation(null);
  };

  const handleDeleteCourseConfirm = () => {
    const courseId = deletingCourseId;
    if (!courseId) return;
    setCourses(previous => previous.filter(course => course.id !== courseId));
    if (activeCourseId === courseId) {
      onActiveCourseIdChange(null);
      onDrawingChange(false);
    }
    setDeletingCourseId(null);
  };

  const handleImportFile = async (file: File) => {
    try {
      const result = await importCoursesFromFile(file);
      if (result.courses.length === 0) {
        setImportMessage("読み込めるコース線がありませんでした。");
        return;
      }
      setCourses(previous => [
        ...previous,
        ...result.courses.map(course => ({
          ...course,
          skiId: resort.id,
          originalSkiId: resort.id,
        })),
      ]);
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

  const deletingCourse = courses.find(course => course.id === deletingCourseId);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 border-l border-gray-200 bg-white p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-bold font-[var(--font-heading)] text-base">
            {resort.nameJa}
          </h2>
          <p className="truncate text-[11px] text-gray-500">
            {savedAt
              ? `自動保存: ${formatDateTime(savedAt)}`
              : "まだ自動保存されていません"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={onBackToSelect}
        >
          <ArrowLeft className="size-3.5" />
          <span className="truncate">{backLabel}</span>
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="default"
          className="min-w-[140px] flex-1"
          disabled={isMerging}
          onClick={handleAddCourse}
        >
          <Plus className="size-3.5" />
          新しいコースを追加
        </Button>
        <Button
          size="sm"
          variant={isMerging ? "green" : "outline"}
          disabled={!isMerging && courses.length < 2}
          title={
            courses.length < 2
              ? "コースが 2 本以上ないと結合できません"
              : undefined
          }
          onClick={isMerging ? onMergeCancel : onMergeStart}
        >
          <Merge className="size-3.5" />
          {isMerging ? "結合をやめる" : "コースを結合"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={courses.length < 2 || isMerging}
          onClick={() => setIsOrganizerOpen(true)}
        >
          <ListOrdered className="size-3.5" />
          並び替え画面
        </Button>
        <Button
          size="sm"
          variant={showLabels ? "default" : "outline"}
          aria-pressed={showLabels}
          onClick={() => onShowLabelsChange(!showLabels)}
        >
          <Tag className="size-3.5" />
          名前を地図に表示
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isMerging}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          ファイルを読み込む
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onFitBounds}
          disabled={courses.every(course => course.coordinates.length === 0)}
        >
          <Maximize2 className="size-3.5" />
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
        <p className="shrink-0 text-[11px] text-gray-600">{importMessage}</p>
      )}

      {mergeDraft && (
        <MergeCoursesPanel
          draft={mergeDraft}
          courses={courses}
          canMerge={canMerge}
          onKeepChange={onMergeKeepChange}
          onClearSlot={onMergeClearSlot}
          onNameChange={onMergeNameChange}
          onDetailFromChange={onMergeDetailFromChange}
          onCancel={onMergeCancel}
          onConfirm={onMergeConfirm}
        />
      )}

      <PanelSection
        title="地図の操作を見る"
        storageKey="rusutsu-slope-help-open"
        defaultOpen={false}
      >
        <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-gray-700">
          <li>
            <span className="font-bold">コースを選ぶ:</span>{" "}
            地図の線か左の一覧をクリック。線は少し離れていても反応します。
          </li>
          <li>
            <span className="font-bold">点を足す:</span>{" "}
            選んでいる赤い線の上をクリックすると、その場所に点が入ります。
          </li>
          <li>
            <span className="font-bold">点を動かす:</span> 赤い点をドラッグ。
          </li>
          <li>
            <span className="font-bold">点を消す:</span>{" "}
            赤い点を右クリック、または点に重ねて Backspace / Delete。
          </li>
          <li>
            <span className="font-bold">描き足す:</span>{" "}
            「点を追加」を押すと線の続きを描けます。オレンジの終点をクリックか
            Esc で終了。
          </li>
          <li>
            <span className="font-bold">分ける:</span>{" "}
            コースの行にある「分割」を押し、地図の紫の点をクリックすると そこで
            2 本に分かれます。
          </li>
          <li>
            <span className="font-bold">つなぐ:</span> 「コースを結合」で、2
            本のつなぎたい位置を順にクリックします。
          </li>
        </ul>
      </PanelSection>

      <CourseMappingList
        courses={courses}
        sortable={sortable}
        mapping={mapping}
        activeCourseId={activeCourseId}
        onSelectCourse={courseId => {
          onActiveCourseIdChange(courseId);
          onDrawingChange(false);
          onSplitModeChange(false);
        }}
        onRenameCourse={(courseId, name) => {
          const previousName = courses.find(item => item.id === courseId)?.name;
          if (previousName !== undefined) {
            mapping.renameGeojsonName(previousName, name);
          }
          setCourses(previous =>
            previous.map(item =>
              item.id === courseId ? { ...item, name } : item,
            ),
          );
        }}
        onToggleUnnamed={courseId =>
          setCourses(previous =>
            previous.map(item =>
              item.id === courseId
                ? {
                    ...item,
                    unnamed: !item.unnamed,
                    name: item.unnamed ? item.name : "",
                  }
                : item,
            ),
          )
        }
        onDeleteCourse={setDeletingCourseId}
        isDrawing={isDrawing}
        onDrawingChange={isNext => {
          onSplitModeChange(false);
          onDrawingChange(isNext);
        }}
        onUndoLastVertex={() =>
          updateActiveCourse(item => ({
            ...item,
            coordinates: item.coordinates.slice(0, -1),
          }))
        }
        isSplitMode={isSplitMode}
        onSplitModeChange={isNext => {
          onDrawingChange(false);
          onSplitModeChange(isNext);
        }}
        onMergeSplitGroup={groupId =>
          setCourses(previous =>
            mergeSplitGroup(previous, groupId, resortSearchName),
          )
        }
        disabled={isMerging}
      />

      <ConfirmDialog
        open={deletingCourseId !== null}
        onOpenChange={open => {
          if (!open) setDeletingCourseId(null);
        }}
        title="コースの削除"
        description={`「${deletingCourse?.name || "名前未入力のコース"}」を削除します。よろしいですか？`}
        onConfirm={handleDeleteCourseConfirm}
        confirmLabel="削除する"
      />

      {validation && validation.errors.length > 0 && (
        <Alert
          variant="destructive"
          className="max-h-[160px] shrink-0 overflow-y-auto border-red-300 bg-red-50"
        >
          <TriangleAlertIcon className="size-4 text-red-700" />
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
          <Alert className="max-h-[180px] shrink-0 overflow-y-auto border-orange-300 bg-orange-50">
            <TriangleAlertIcon className="size-4 text-orange-900" />
            <AlertTitle className="text-orange-900">警告</AlertTitle>
            <AlertDescription className="flex flex-col gap-1 text-orange-900">
              {validation.warnings.map(warning => (
                <p key={warning} className="text-xs">
                  ・{warning}
                </p>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="self-start text-orange-900 hover:bg-orange-100 hover:text-orange-700"
                onClick={() => handleProceed(true)}
              >
                警告を無視して次へ進む
              </Button>
            </AlertDescription>
          </Alert>
        )}

      <Button
        variant="default"
        className="w-full shrink-0"
        onClick={() => handleProceed(false)}
        disabled={courses.length === 0 || isMerging}
      >
        次へ（詳細編集）
      </Button>

      <OrderOrganizerDialog
        open={isOrganizerOpen}
        onOpenChange={setIsOrganizerOpen}
        resortId={resort.id}
        resortName={resort.nameJa}
        kind="courses"
        items={courses.map(course => ({
          id: course.id,
          name: course.name,
          detail: `${course.coordinates.length} 点`,
        }))}
        selectedItemId={activeCourseId}
        onSelectItem={onActiveCourseIdChange}
        onReorder={(from, to) =>
          setCourses(previous => moveItem(previous, from, to))
        }
        onApplyCrawlerOrder={onApplyGeojsonOrder}
      />
    </div>
  );
}
