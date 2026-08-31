"use client";

import { GripVertical, MapPin, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MappingPairList } from "@/features/latest-status-mapping/components/MappingPairList";
import type { LatestStatusMappingState } from "@/features/latest-status-mapping/hooks/useLatestStatusMapping";
import { cn } from "@/lib/utils";
import type { SortableList } from "@/shared/hooks/useSortableList";
import type { EditorLift } from "../types";
import { hasGeometryChange, liftDisplayName } from "../utils/liftOps";

type LiftMappingListProps = {
  lifts: EditorLift[];
  sortable: SortableList;
  mapping: LatestStatusMappingState;
  selectedLiftId: string | null;
  onSelectLift: (liftId: string) => void;
  onDeleteLift: (liftId: string) => void;
  onResetLift: (liftId: string) => void;
  isDrawing: boolean;
  onDrawingChange: (isDrawing: boolean) => void;
  isMidstationMode: boolean;
  onMidstationModeChange: (isMidstationMode: boolean) => void;
  onDeleteMidstation: () => void;
  /** 行の右下に出す変更内容の説明 */
  describeChange: (lift: EditorLift) => string | null;
};

/**
 * リフトの一覧と、クロール結果との対応を横並びで見る表。
 *
 * コース側と同じ形にそろえてある。リフト名は詳細情報の工程で編集するので、
 * ここでは表示だけにして、位置と中間駅の操作を行に置く。
 */
export function LiftMappingList({
  lifts,
  sortable,
  mapping,
  selectedLiftId,
  onSelectLift,
  onDeleteLift,
  onResetLift,
  isDrawing,
  onDrawingChange,
  isMidstationMode,
  onMidstationModeChange,
  onDeleteMidstation,
  describeChange,
}: LiftMappingListProps) {
  const selectedLift = lifts.find(lift => lift.id === selectedLiftId);

  return (
    <MappingPairList
      items={lifts}
      sortable={sortable}
      mapping={mapping}
      activeItemId={selectedLiftId}
      activeItemName={
        selectedLift && selectedLift.name.trim() !== ""
          ? selectedLift.name.trim()
          : null
      }
      leftHeading={`地図のリフト（${lifts.length} 本）`}
      emptyMessage="「リフトを追加」を押して、地図上で始点から終点へ順に点を打ってください。"
      renderLeft={(lift, index, isActive) => (
        <div className="flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={`${liftDisplayName(lift, index)}を並び替え`}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            {...sortable.handleProps(lift.id)}
          >
            <GripVertical className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`${index + 1}番目のリフトを選ぶ`}
            className={cn(
              "w-5 shrink-0 rounded text-right text-[11px] text-gray-500 hover:text-gray-900",
              isActive && "font-bold text-blue-700",
            )}
            onClick={() => onSelectLift(lift.id)}
          >
            {index + 1}
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm font-medium"
            title={liftDisplayName(lift, index)}
            onClick={() => onSelectLift(lift.id)}
          >
            {liftDisplayName(lift, index)}
          </button>
        </div>
      )}
      renderBelow={(lift, _index, isActive) => {
        const change = describeChange(lift);
        return (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 pl-6">
            <span className="text-[11px] text-gray-500">
              {lift.coordinates.length} 点
            </span>
            {lift.midstation && (
              <span className="text-[11px] text-green-900">中間駅</span>
            )}
            {change && (
              <Badge
                variant="secondary"
                className="max-w-[45%] truncate bg-orange-100 text-[10px] text-orange-900"
                title={change}
              >
                {change}
              </Badge>
            )}
            {isActive && (
              <>
                {lift.isNew && (
                  <Button
                    size="xs"
                    variant={isDrawing ? "orange" : "outline"}
                    onClick={() => {
                      onMidstationModeChange(false);
                      onDrawingChange(!isDrawing);
                    }}
                  >
                    {isDrawing ? "描画終了" : "点を追加"}
                  </Button>
                )}
                <Button
                  size="xs"
                  variant={isMidstationMode ? "green" : "outline"}
                  onClick={() => {
                    onDrawingChange(false);
                    onMidstationModeChange(!isMidstationMode);
                  }}
                >
                  <MapPin className="size-3" />
                  {isMidstationMode
                    ? "配置を終了"
                    : lift.midstation
                      ? "中間駅を置き直す"
                      : "中間駅を追加"}
                </Button>
                {lift.midstation && (
                  <Button
                    size="xs"
                    variant="outline"
                    className="text-red-700"
                    onClick={onDeleteMidstation}
                  >
                    中間駅を削除
                  </Button>
                )}
                {hasGeometryChange(lift) && !lift.isNew && (
                  <Button
                    size="xs"
                    variant="outline"
                    className="text-orange-900"
                    onClick={() => onResetLift(lift.id)}
                  >
                    <RotateCcw className="size-3" />
                    位置変更を取消
                  </Button>
                )}
              </>
            )}
            <div className="flex-1" />
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`${liftDisplayName(lift)}を削除`}
              className="shrink-0 text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={() => onDeleteLift(lift.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        );
      }}
    />
  );
}
