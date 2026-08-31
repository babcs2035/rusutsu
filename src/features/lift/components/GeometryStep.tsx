"use client";

import { ArrowLeft, ListOrdered, Maximize2, Plus, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { OrderOrganizerDialog } from "@/features/latest-status-mapping/components/OrderOrganizerDialog";
import { useLatestStatusMapping } from "@/features/latest-status-mapping/hooks/useLatestStatusMapping";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { PanelSection } from "@/shared/components/PanelSection";
import { moveItem, useSortableList } from "@/shared/hooks/useSortableList";
import type { EditorLift, LngLat, ResortOption } from "../types";
import {
  createEmptyLift,
  distanceM,
  formatDistanceM,
  hasLineChange,
  hasMidstationChange,
  liftDisplayName,
} from "../utils/liftOps";
import { LiftMappingList } from "./LiftMappingList";

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
  showLabels: boolean;
  onShowLabelsChange: (showLabels: boolean) => void;
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
  showLabels,
  onShowLabelsChange,
}: GeometryStepProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);
  const selectedLift = lifts.find(lift => lift.id === selectedLiftId) ?? null;

  const geojsonNames = useMemo(
    () => lifts.map(lift => lift.name.trim()).filter(Boolean),
    [lifts],
  );
  const mapping = useLatestStatusMapping({
    resortId: resort.id,
    kind: "lifts",
    geojsonNames,
  });

  const sortable = useSortableList({
    ids: lifts.map(lift => lift.id),
    onReorder: (from, to) =>
      // 削除予定のリフトも配列には残っているので、表示している並びだけを入れ替える
      setLifts(previous => {
        const visibleIds = lifts.map(lift => lift.id);
        const reorderedIds = moveItem(visibleIds, from, to);
        let cursor = 0;
        const byId = new Map(previous.map(lift => [lift.id, lift]));
        return previous.map(lift =>
          visibleIds.includes(lift.id)
            ? (byId.get(reorderedIds[cursor++]) ?? lift)
            : lift,
        );
      }),
  });

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

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 border-l border-gray-200 bg-white p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h2
            className={cn(
              "truncate font-bold text-base",
              resort.nameJa ? "font-[var(--font-heading)]" : "font-mono",
            )}
          >
            {resort.nameJa || resort.id}
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
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" />
          所属確認へ
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="default"
          className="min-w-[130px] flex-1"
          onClick={handleAddLift}
        >
          <Plus className="size-3.5" />
          リフトを追加
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={lifts.length < 2}
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
          onClick={onFitBounds}
          disabled={lifts.every(lift => lift.coordinates.length === 0)}
        >
          <Maximize2 className="size-3.5" />
          全体表示
        </Button>
      </div>

      <PanelSection
        title="地図の操作を見る"
        storageKey="rusutsu-lift-help-open"
        defaultOpen={false}
      >
        <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-gray-700">
          <li>
            <span className="font-bold">リフトを選ぶ:</span>{" "}
            地図の線か左の一覧をクリック。線は少し離れていても反応します。
          </li>
          <li>
            <span className="font-bold">点を足す:</span>{" "}
            選んでいる赤い線の上をクリックすると、その場所に点が入ります。
          </li>
          <li>
            <span className="font-bold">点を動かす・消す:</span>{" "}
            赤い点をドラッグで移動、右クリックまたは Delete で削除。
          </li>
          <li>
            <span className="font-bold">中間駅:</span>{" "}
            緑の点。「中間駅を追加」を押してから線の途中をクリックして置きます。
          </li>
          <li>
            <span className="font-bold">破線:</span> 編集前の位置です。
          </li>
        </ul>
      </PanelSection>

      <ConfirmDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="位置変更の解除"
        description={`「${selectedLift ? liftDisplayName(selectedLift) : ""}」の位置・中間駅の変更を取り消して、読み込み時の状態へ戻します。よろしいですか？`}
        onConfirm={handleResetSelectedConfirm}
        confirmLabel="取り消す"
      />
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={selectedLift?.isNew ? "新規リフトの削除" : "リフトの削除"}
        description={
          selectedLift?.isNew
            ? `新規リフト「${liftDisplayName(selectedLift)}」を削除します。よろしいですか？`
            : `「${selectedLift ? liftDisplayName(selectedLift) : ""}」を削除予定にします。保存すると lift_before から削除されます。よろしいですか？`
        }
        onConfirm={handleDeleteLiftConfirm}
        confirmLabel="削除する"
      />

      {deletedLifts.length > 0 && (
        <Alert className="max-h-[140px] shrink-0 overflow-y-auto border-red-300 bg-red-50 p-2">
          <AlertTitle className="text-xs font-bold text-red-700">
            削除予定（{deletedLifts.length} 件）
          </AlertTitle>
          <AlertDescription>
            {deletedLifts.map(lift => (
              <div
                key={lift.id}
                className="flex items-center gap-2 border-t border-red-100 py-1"
              >
                <p className="min-w-0 flex-1 truncate text-xs">
                  {liftDisplayName(lift)}
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => handleRestoreLift(lift.id)}
                >
                  元に戻す
                </Button>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <LiftMappingList
        lifts={lifts}
        sortable={sortable}
        mapping={mapping}
        selectedLiftId={selectedLiftId}
        onSelectLift={handleSelectLift}
        onDeleteLift={liftId => {
          onSelectLift(liftId);
          setDeleteDialogOpen(true);
        }}
        onResetLift={liftId => {
          onSelectLift(liftId);
          setResetDialogOpen(true);
        }}
        isDrawing={isDrawing}
        onDrawingChange={onDrawingChange}
        isMidstationMode={isMidstationMode}
        onMidstationModeChange={onMidstationModeChange}
        onDeleteMidstation={handleDeleteMidstation}
        describeChange={describeChange}
      />

      <Button variant="default" className="shrink-0" onClick={onProceed}>
        次へ（リフト詳細情報の入力）
      </Button>

      <OrderOrganizerDialog
        open={isOrganizerOpen}
        onOpenChange={setIsOrganizerOpen}
        resortId={resort.id}
        resortName={resort.nameJa || resort.id}
        kind="lifts"
        items={lifts.map((lift, index) => ({
          id: lift.id,
          name: liftDisplayName(lift, index),
          detail: `${lift.coordinates.length} 点`,
        }))}
        selectedItemId={selectedLiftId}
        onSelectItem={handleSelectLift}
        onReorder={(from, to) =>
          setLifts(previous => {
            const visibleIds = lifts.map(lift => lift.id);
            const reorderedIds = moveItem(visibleIds, from, to);
            let cursor = 0;
            const byId = new Map(previous.map(lift => [lift.id, lift]));
            return previous.map(lift =>
              visibleIds.includes(lift.id)
                ? (byId.get(reorderedIds[cursor++]) ?? lift)
                : lift,
            );
          })
        }
      />
    </div>
  );
}
