"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import type { EditorLift, LngLat, ResortOption } from "../types";
import {
  createEmptyLift,
  distanceM,
  formatDistanceM,
  hasGeometryChange,
  hasLineChange,
  hasMidstationChange,
  liftDisplayName,
} from "../utils/liftOps";

type GeometryStepProps = {
  resort: ResortOption;
  lifts: EditorLift[];
  deletedLifts: EditorLift[];
  setLifts: (updater: (lifts: EditorLift[]) => EditorLift[]) => void;
  savedAt: string | null;
  selectedLiftId: string | null;
  onSelectLift: (liftId: string | null) => void;
  isDrawing: boolean;
  onDrawingChange: (isDrawing: boolean) => void;
  isMidstationMode: boolean;
  onMidstationModeChange: (isMidstationMode: boolean) => void;
  onFitBounds: () => void;
  onProceed: () => void;
  onBack: () => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

const describeChange = (lift: EditorLift): string | null => {
  const parts: string[] = [];
  if (hasLineChange(lift)) {
    const before = lift.original.coordinates;
    const after = lift.coordinates;
    if (lift.isNew) {
      parts.push("新規");
    } else if (before.length !== after.length) {
      parts.push(`頂点数 ${before.length} → ${after.length}`);
    } else {
      const distances = before.map((pair, index) =>
        distanceM(pair, after[index]),
      );
      const movedCount = distances.filter(distance => distance > 0).length;
      parts.push(
        `${movedCount} 点を移動（最大 ${formatDistanceM(Math.max(...distances))}）`,
      );
    }
  }
  if (hasMidstationChange(lift)) {
    if (lift.midstation === null) parts.push("中間駅削除");
    else if (lift.original.midstation === null) parts.push("中間駅追加");
    else parts.push("中間駅移動");
  }
  return parts.length > 0 ? parts.join(" / ") : null;
};

export function GeometryStep({
  resort,
  lifts,
  deletedLifts,
  setLifts,
  savedAt,
  selectedLiftId,
  onSelectLift,
  isDrawing,
  onDrawingChange,
  isMidstationMode,
  onMidstationModeChange,
  onFitBounds,
  onProceed,
  onBack,
}: GeometryStepProps) {
  const [draggedLiftId, setDraggedLiftId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    liftId: string;
    position: "before" | "after";
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const selectedLift = lifts.find(lift => lift.id === selectedLiftId) ?? null;

  // Escape キーで描画・中間駅モードを終了する
  useEffect(() => {
    if (!isDrawing && !isMidstationMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDrawingChange(false);
        onMidstationModeChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawing, isMidstationMode, onDrawingChange, onMidstationModeChange]);

  const updateSelectedLift = (
    updater: (lift: EditorLift) => EditorLift,
  ): void => {
    if (!selectedLiftId) return;
    setLifts(previous =>
      previous.map(lift => (lift.id === selectedLiftId ? updater(lift) : lift)),
    );
  };

  const handleSelectLift = (liftId: string | null) => {
    onSelectLift(liftId);
    onDrawingChange(false);
    onMidstationModeChange(false);
  };

  const handleAddLift = () => {
    const lift = createEmptyLift(resort.id);
    setLifts(previous => [...previous, lift]);
    onSelectLift(lift.id);
    onMidstationModeChange(false);
    onDrawingChange(true);
  };

  const handleDeleteLiftConfirm = () => {
    if (!selectedLift) return;
    const selectedIndex = lifts.findIndex(lift => lift.id === selectedLift.id);
    const nextSelectedId =
      lifts[selectedIndex + 1]?.id ?? lifts[selectedIndex - 1]?.id ?? null;

    setLifts(previous =>
      selectedLift.isNew
        ? previous.filter(lift => lift.id !== selectedLift.id)
        : previous.map(lift =>
            lift.id === selectedLift.id ? { ...lift, isDeleted: true } : lift,
          ),
    );
    onSelectLift(nextSelectedId);
    onDrawingChange(false);
    onMidstationModeChange(false);
    setDeleteDialogOpen(false);
  };

  const handleRestoreLift = (liftId: string) => {
    setLifts(previous =>
      previous.map(lift =>
        lift.id === liftId ? { ...lift, isDeleted: false } : lift,
      ),
    );
  };

  const handleResetSelectedConfirm = () => {
    if (!selectedLift) return;
    updateSelectedLift(lift => ({
      ...lift,
      coordinates: lift.original.coordinates.map(pair => [...pair] as LngLat),
      midstation: lift.original.midstation
        ? ([...lift.original.midstation] as LngLat)
        : null,
    }));
    setResetDialogOpen(false);
  };

  const handleDeleteMidstation = () => {
    if (!selectedLift?.midstation) return;
    updateSelectedLift(lift => ({ ...lift, midstation: null }));
    onMidstationModeChange(false);
  };

  const reorderLift = (
    sourceLiftId: string,
    targetLiftId: string,
    position: "before" | "after",
  ): void => {
    if (sourceLiftId === targetLiftId) return;
    setLifts(previous => {
      const sourceIndex = previous.findIndex(lift => lift.id === sourceLiftId);
      if (sourceIndex < 0) return previous;

      const reordered = [...previous];
      const [draggedLift] = reordered.splice(sourceIndex, 1);
      const targetIndex = reordered.findIndex(lift => lift.id === targetLiftId);
      if (targetIndex < 0) return previous;

      reordered.splice(
        position === "after" ? targetIndex + 1 : targetIndex,
        0,
        draggedLift,
      );
      return reordered;
    });
  };

  const clearDragState = (): void => {
    setDraggedLiftId(null);
    setDropTarget(null);
  };

  return (
    <div className="flex h-full min-h-0 w-[min(480px,60vw)] lg:w-[480px] min-w-0 lg:min-w-[480px] flex-col border-r border-gray-200 p-4 gap-3 overflow-hidden">
      <div className="flex justify-between items-center">
        <div>
          <h2
            className={`text-base font-bold ${resort.nameJa ? "font-[var(--font-heading)]" : "font-mono"}`}
          >
            {resort.nameJa || resort.id}
          </h2>
          <p className="text-xs text-gray-500">
            {savedAt
              ? `最終保存: ${formatDateTime(savedAt)}（下書き自動保存）`
              : "未保存"}
          </p>
        </div>
        <Button size="xs" variant="outline" onClick={onBack}>
          所属確認へ戻る
        </Button>
      </div>

      <Card className="flex-shrink-0">
        <CardContent className="p-2">
          <p className="mb-1 font-medium text-xs text-gray-600">地図の操作</p>
          <p className="text-xs text-gray-600">
            ・一覧または地図上の線をクリックしてリフトを選択
          </p>
          <p className="text-xs text-gray-600">
            ・赤い点（始点・終点・中間点）: ドラッグで移動
          </p>
          <p className="text-xs text-gray-600">
            ・青い点: クリックで中間に点を追加
          </p>
          <p className="text-xs text-gray-600">・赤い点を右クリックで削除</p>
          <p className="text-xs text-gray-600">
            ・緑の点は中間駅（ドラッグで移動）
          </p>
          <p className="text-xs text-gray-600">・破線は編集前の位置</p>
          <p className="text-xs text-gray-600">
            ・「リフトを追加」中は地図クリックで点を打つ（Esc で終了）
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-shrink-0 flex-wrap">
        <Button size="sm" variant="default" onClick={handleAddLift}>
          ＋ リフトを追加
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onFitBounds}
          disabled={lifts.every(lift => lift.coordinates.length === 0)}
        >
          全体表示
        </Button>
      </div>

      {selectedLift && (
        <div className="flex gap-2 flex-shrink-0 flex-wrap">
          {selectedLift.isNew && (
            <Button
              size="xs"
              variant={isDrawing ? "orange" : "outline"}
              className={isDrawing ? "" : "text-orange-500"}
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
            className={isMidstationMode ? "" : "text-green-500"}
            onClick={() => {
              onDrawingChange(false);
              onMidstationModeChange(!isMidstationMode);
            }}
          >
            {isMidstationMode
              ? "中間駅の配置を終了"
              : selectedLift.midstation
                ? "中間駅を置き直す（地図をクリック）"
                : "中間駅を追加（地図をクリック）"}
          </Button>
          {selectedLift.midstation && (
            <Button
              size="xs"
              variant="outline"
              className="text-red-500"
              onClick={handleDeleteMidstation}
            >
              中間駅を削除
            </Button>
          )}
          {hasGeometryChange(selectedLift) && !selectedLift.isNew && (
            <ConfirmDialog
              open={resetDialogOpen}
              onOpenChange={setResetDialogOpen}
              title="位置変更の解除"
              description={`「${liftDisplayName(selectedLift)}」の位置・中間駅の変更を取り消して、読み込み時の状態へ戻します。よろしいですか？`}
              onConfirm={handleResetSelectedConfirm}
              confirmLabel="取り消す"
            />
          )}
          <ConfirmDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            title={selectedLift.isNew ? "新規リフトの削除" : "リフトの削除"}
            description={
              selectedLift.isNew
                ? `新規リフト「${liftDisplayName(selectedLift)}」を削除します。よろしいですか？`
                : `「${liftDisplayName(selectedLift)}」を削除予定にします。保存すると lift_before から削除されます。よろしいですか？`
            }
            onConfirm={handleDeleteLiftConfirm}
            confirmLabel="削除する"
          />
          {hasGeometryChange(selectedLift) && !selectedLift.isNew && (
            <Button
              size="xs"
              variant="outline"
              className="text-red-500"
              onClick={() => setResetDialogOpen(true)}
            >
              位置変更を取り消す
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            className="text-red-700 hover:text-red-800 hover:bg-red-50"
            onClick={() => setDeleteDialogOpen(true)}
          >
            {selectedLift.isNew ? "この新規リフトを削除" : "このリフトを削除"}
          </Button>
        </div>
      )}

      {deletedLifts.length > 0 && (
        <Alert className="border-red-300 bg-red-50 flex-shrink-0">
          <AlertTitle className="px-3 py-2 text-xs font-bold text-red-700">
            削除予定（{deletedLifts.length} 件）
          </AlertTitle>
          <AlertDescription className="max-h-[120px] overflow-y-auto">
            {deletedLifts.map(lift => (
              <div
                key={lift.id}
                className="flex px-3 py-2 gap-2 items-center border-t border-red-100"
              >
                <p className="text-sm flex-1 truncate">
                  {liftDisplayName(lift)}
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  className="text-red-500"
                  onClick={() => handleRestoreLift(lift.id)}
                >
                  元に戻す
                </Button>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <ScrollArea className="flex-1 min-h-[200px] border border-gray-200 rounded-md">
        {lifts.map((lift, index) => {
          const isActive = lift.id === selectedLiftId;
          const change = describeChange(lift);
          return (
            <div
              key={lift.id}
              role="button"
              tabIndex={0}
              className={cn(
                "p-2 border-b border-gray-100 cursor-pointer",
                isActive && "bg-blue-50",
                lift.id === draggedLiftId && "opacity-45",
              )}
              style={{
                boxShadow:
                  dropTarget?.liftId === lift.id
                    ? dropTarget.position === "before"
                      ? "inset 0 3px 0 rgb(59 130 246)"
                      : "inset 0 -3px 0 rgb(59 130 246)"
                    : undefined,
              }}
              onDragOver={event => {
                if (draggedLiftId === null || draggedLiftId === lift.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const bounds = event.currentTarget.getBoundingClientRect();
                setDropTarget({
                  liftId: lift.id,
                  position:
                    event.clientY < bounds.top + bounds.height / 2
                      ? "before"
                      : "after",
                });
              }}
              onDrop={event => {
                event.preventDefault();
                const sourceLiftId =
                  draggedLiftId || event.dataTransfer.getData("text/plain");
                const bounds = event.currentTarget.getBoundingClientRect();
                reorderLift(
                  sourceLiftId,
                  lift.id,
                  event.clientY < bounds.top + bounds.height / 2
                    ? "before"
                    : "after",
                );
                clearDragState();
              }}
              onClick={() => handleSelectLift(lift.id)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectLift(lift.id);
                }
              }}
            >
              <div className="flex gap-2 items-center">
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${liftDisplayName(lift, index)}を並び替え`}
                  className="text-gray-400 text-lg leading-none cursor-grab select-none"
                  draggable
                  onDragStart={event => {
                    setDraggedLiftId(lift.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", lift.id);
                  }}
                  onDragEnd={clearDragState}
                  onClick={event => event.stopPropagation()}
                  onKeyDown={event => event.stopPropagation()}
                >
                  ⠿
                </span>
                <p className="text-xs text-gray-500 w-6">{index + 1}</p>
                <p className="text-sm font-medium flex-1 truncate">
                  {liftDisplayName(lift, index)}
                </p>
                <p className="text-xs text-gray-500">
                  {lift.coordinates.length} 点
                </p>
                {lift.midstation && (
                  <p className="text-xs text-green-900">中間駅</p>
                )}
                {change && (
                  <Badge
                    variant="secondary"
                    className="bg-orange-100 text-orange-900 text-xs whitespace-nowrap"
                  >
                    {change}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
        {lifts.length === 0 && (
          <p className="p-3 text-sm font-semibold text-gray-500">
            「＋
            リフトを追加」を押して、地図上で始点から終点へ順に点を打ってください。
          </p>
        )}
      </ScrollArea>
      {lifts.length > 1 && (
        <p className="text-xs text-gray-500 -mt-0.5">
          ⠿をドラッグして並び替えられます。変更した順番が保存後の GeoJSON
          のリフト順になります。
        </p>
      )}
      <Button variant="default" className="flex-shrink-0" onClick={onProceed}>
        次へ（リフト詳細情報の入力）
      </Button>
    </div>
  );
}
