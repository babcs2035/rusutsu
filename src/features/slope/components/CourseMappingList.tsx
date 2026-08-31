"use client";

import { GripVertical, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MappingPairList } from "@/features/latest-status-mapping/components/MappingPairList";
import type { LatestStatusMappingState } from "@/features/latest-status-mapping/hooks/useLatestStatusMapping";
import { cn } from "@/lib/utils";
import type { SortableList } from "@/shared/hooks/useSortableList";
import type { EditorCourse } from "../types";

type CourseMappingListProps = {
  courses: EditorCourse[];
  sortable: SortableList;
  mapping: LatestStatusMappingState;
  activeCourseId: string | null;
  onSelectCourse: (courseId: string) => void;
  onRenameCourse: (courseId: string, name: string) => void;
  onToggleUnnamed: (courseId: string) => void;
  onDeleteCourse: (courseId: string) => void;
  isDrawing: boolean;
  onDrawingChange: (isDrawing: boolean) => void;
  onUndoLastVertex: () => void;
  isSplitMode: boolean;
  onSplitModeChange: (isSplitMode: boolean) => void;
  onMergeSplitGroup: (groupId: string) => void;
  disabled: boolean;
};

/**
 * コース線の一覧と、クロール結果との対応を横並びで見る表。
 *
 * 並べ替え・名前の編集・分割まで、この表の上で完結させて
 * 画面を行き来せずに済ませる。右側の対応付けは共通部品に任せる。
 */
export function CourseMappingList({
  courses,
  sortable,
  mapping,
  activeCourseId,
  onSelectCourse,
  onRenameCourse,
  onToggleUnnamed,
  onDeleteCourse,
  isDrawing,
  onDrawingChange,
  onUndoLastVertex,
  isSplitMode,
  onSplitModeChange,
  onMergeSplitGroup,
  disabled,
}: CourseMappingListProps) {
  const activeCourse = courses.find(course => course.id === activeCourseId);

  return (
    <MappingPairList
      items={courses}
      sortable={sortable}
      mapping={mapping}
      activeItemId={activeCourseId}
      activeItemName={
        activeCourse && activeCourse.name.trim() !== ""
          ? activeCourse.name.trim()
          : null
      }
      leftHeading={`地図のコース（${courses.length} 本）`}
      emptyMessage="「新しいコースを追加」を押して、地図上で始点から終点へ順に点を打ってください。"
      renderLeft={(course, index, isActive) => (
        <div className="flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={`${course.name || `${index + 1}番目のコース`}を並び替え`}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
            disabled={disabled}
            {...sortable.handleProps(course.id)}
          >
            <GripVertical className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`${index + 1}番目のコースを選ぶ`}
            className={cn(
              "w-5 shrink-0 rounded text-right text-[11px] text-gray-500 hover:text-gray-900",
              isActive && "font-bold text-blue-700",
            )}
            onClick={() => onSelectCourse(course.id)}
          >
            {index + 1}
          </button>
          <Input
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-white px-2 text-sm shadow-sm"
            placeholder="コース名"
            value={course.name}
            disabled={course.unnamed}
            onFocus={() => onSelectCourse(course.id)}
            onChange={event => onRenameCourse(course.id, event.target.value)}
          />
        </div>
      )}
      renderBelow={(course, index, isActive) => (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 pl-6">
          <span className="text-[11px] text-gray-500">
            {course.coordinates.length} 点
          </span>
          {course.coordinates.length < 2 && (
            <span className="text-[11px] font-bold text-red-700">
              2 点以上必要
            </span>
          )}
          {course.unnamed && (
            <span className="text-[11px] text-orange-900">無名</span>
          )}
          {course.splitGroupId && (
            <span className="text-[11px] text-purple-900">分割中</span>
          )}
          <TooltipProvider delay={0}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="xs"
                    variant={course.unnamed ? "default" : "outline"}
                    disabled={disabled}
                    onClick={() => onToggleUnnamed(course.id)}
                  >
                    名前なし
                  </Button>
                }
              />
              <TooltipContent side="top" className="max-w-[240px] text-xs">
                コース名が不明な場合に選びます（保存時に「無名_1」のような名前が付きます）
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {isActive && !disabled && (
            <>
              <Button
                size="xs"
                variant={isDrawing ? "orange" : "outline"}
                onClick={() => onDrawingChange(!isDrawing)}
              >
                {isDrawing ? "描画終了" : "点を追加"}
              </Button>
              {course.coordinates.length > 0 && (
                <Button size="xs" variant="outline" onClick={onUndoLastVertex}>
                  最後の点を取消
                </Button>
              )}
              <Button
                size="xs"
                variant={isSplitMode ? "default" : "outline"}
                className={
                  isSplitMode
                    ? "bg-purple-600 text-white hover:bg-purple-700"
                    : "border-purple-300 text-purple-900"
                }
                disabled={course.coordinates.length < 3}
                title={
                  course.coordinates.length < 3
                    ? "点が 3 つ以上ないと分割できません"
                    : undefined
                }
                onClick={() => onSplitModeChange(!isSplitMode)}
              >
                <Scissors className="size-3" />
                {isSplitMode ? "分割を中止" : "分割"}
              </Button>
              {course.splitGroupId && (
                <Button
                  size="xs"
                  variant="outline"
                  className="border-purple-300 text-purple-900"
                  onClick={() =>
                    course.splitGroupId &&
                    onMergeSplitGroup(course.splitGroupId)
                  }
                >
                  分割を戻す
                </Button>
              )}
            </>
          )}
          <div className="flex-1" />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`${course.name || `${index + 1}番目のコース`}を削除`}
            className="shrink-0 text-red-700 hover:bg-red-50 hover:text-red-800"
            disabled={disabled}
            onClick={() => onDeleteCourse(course.id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
    />
  );
}
