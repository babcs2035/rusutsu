"use client";

import { ListOrdered } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { OrderOrganizerDialog } from "@/features/latest-status-mapping/components/OrderOrganizerDialog";
import type { LatestStatusMappingState } from "@/features/latest-status-mapping/hooks/useLatestStatusMapping";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { PanelSection } from "@/shared/components/PanelSection";
import { moveItem } from "@/shared/hooks/useSortableList";
import { buildDefaultSearchWord } from "@/shared/utils/searchWord";
import {
  BUSINESS_HOURS_MARK_OPTIONS,
  DETAIL_LABELS,
  MAKER_OPTIONS,
  MARK_OPTIONS,
  REQUIRED_DETAIL_KEYS,
  SPEED_OPTIONS,
  TYPE_OPTIONS,
} from "../constants";
import type {
  EditorLift,
  LiftDetail,
  LiftDetailEntry,
  ResortOption,
} from "../types";
import { mergeDetailEntry, unmergeDetailEntry } from "../utils/detailMerge";
import { liftDisplayName } from "../utils/liftOps";

import {
  reorderLiftsByCrawlerOrder,
  reorderVisibleLifts,
} from "../utils/liftOrder";

type DetailStepProps = {
  mapping: LatestStatusMappingState;
  resort: ResortOption;
  resorts: ResortOption[];
  lifts: EditorLift[];
  setLifts: (updater: (lifts: EditorLift[]) => EditorLift[]) => void;
  details: LiftDetailEntry[];
  savedAt: string | null;
  selectedLiftId: string | null;
  onSelectLift: (liftId: string | null) => void;
  onProceed: () => void;
  onBack: () => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

const selectClassName =
  "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm";

const MarkSelect = ({
  value,
  onChange,
  options = MARK_OPTIONS,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: readonly string[];
}) => {
  const label = (opt: string) =>
    opt === ""
      ? "未設定"
      : opt === "○"
        ? "○（あり）"
        : opt === "×"
          ? "×（なし）"
          : "?（不明）";

  return (
    <Select value={value} onValueChange={v => v !== null && onChange(v)}>
      <SelectTrigger className={selectClassName}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option || "empty"} value={option}>
            {label(option)}
          </SelectItem>
        ))}
        {value !== "" && !options.includes(value) && (
          <SelectItem value={value}>{value}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
};

export function DetailStep({
  mapping,
  resort,
  resorts,
  lifts,
  setLifts,
  details,
  savedAt,
  selectedLiftId,
  onSelectLift,
  onProceed,
  onBack,
}: DetailStepProps) {
  const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);
  const [bulkOnlyEmpty, setBulkOnlyEmpty] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [manualEntryIndex, setManualEntryIndex] = useState<string>("");
  const [showProceedWarning, setShowProceedWarning] = useState(false);
  const [draggedLiftId, setDraggedLiftId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    liftId: string;
    position: "before" | "after";
  } | null>(null);
  const [unmergeDialogOpen, setUnmergeDialogOpen] = useState(false);

  const selectedLift = lifts.find(lift => lift.id === selectedLiftId) ?? null;
  const resortSearchNameById = useMemo(
    () => new Map(resorts.map(option => [option.id, option.searchName])),
    [resorts],
  );

  const incompleteLifts = useMemo(
    () =>
      lifts
        .map((lift, index) => ({
          lift,
          index,
          emptyKeys: REQUIRED_DETAIL_KEYS.filter(
            key => lift.detail[key].trim() === "",
          ),
        }))
        .filter(item => item.emptyKeys.length > 0),
    [lifts],
  );

  // すでにどこかのリフトへ結合済みの lift_detail エントリは候補から外す
  const availableEntries = useMemo(() => {
    const consumed = new Set(
      lifts
        .map(lift => lift.detailMatch?.entryIndex)
        .filter((index): index is number => index !== undefined),
    );
    return details
      .map((entry, index) => ({ entry, index }))
      .filter(item => !consumed.has(item.index));
  }, [details, lifts]);

  const updateSelectedLift = (
    updater: (lift: EditorLift) => EditorLift,
  ): void => {
    if (!selectedLiftId) return;
    setLifts(previous =>
      previous.map(lift => (lift.id === selectedLiftId ? updater(lift) : lift)),
    );
  };

  const updateDetail = (patch: Partial<LiftDetail>) => {
    updateSelectedLift(lift => ({
      ...lift,
      detail: { ...lift.detail, ...patch },
    }));
  };

  const applyToAll = (key: "morning" | "night", value: string) => {
    const targetIds = new Set(
      lifts
        .filter(
          lift =>
            (!bulkOnlyEmpty || lift.detail[key] === "") &&
            lift.detail[key] !== value,
        )
        .map(lift => lift.id),
    );
    setLifts(previous =>
      previous.map(lift =>
        targetIds.has(lift.id)
          ? { ...lift, detail: { ...lift.detail, [key]: value } }
          : lift,
      ),
    );
    setBulkMessage(
      targetIds.size === 0
        ? `${DETAIL_LABELS[key]}を変更するリフトはありませんでした。`
        : `${DETAIL_LABELS[key]}を ${targetIds.size} 本のリフトへ「${value === "" ? "未設定" : value}」で入れました。`,
    );
  };

  const handleManualMerge = () => {
    if (manualEntryIndex === "" || manualEntryIndex === "__empty__") return;
    const index = Number(manualEntryIndex);
    const item = availableEntries.find(candidate => candidate.index === index);
    if (!item || !selectedLift) return;
    updateSelectedLift(lift =>
      mergeDetailEntry(lift, item.entry, item.index, "manual"),
    );
    setManualEntryIndex("");
  };

  const handleUnmerge = () => {
    if (!selectedLift?.detailMatch) return;
    updateSelectedLift(unmergeDetailEntry);
    setUnmergeDialogOpen(false);
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

      const insertionIndex =
        position === "after" ? targetIndex + 1 : targetIndex;
      reordered.splice(insertionIndex, 0, draggedLift);
      return reordered;
    });
  };

  const clearDragState = (): void => {
    setDraggedLiftId(null);
    setDropTarget(null);
  };

  const handleProceed = (): void => {
    if (incompleteLifts.length === 0) {
      onProceed();
      return;
    }
    setShowProceedWarning(true);
    onSelectLift(incompleteLifts[0].lift.id);
  };

  return (
    <div className="flex w-full min-w-0 shrink-0 flex-col gap-2 border-l border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div>
          <h2
            className={cn(
              "text-base font-bold",
              resort.nameJa && "font-[var(--font-heading)]",
              !resort.nameJa && "font-mono",
            )}
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
          位置補正へ戻る
        </Button>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="shrink-0 self-start"
        disabled={lifts.length < 2}
        onClick={() => setIsOrganizerOpen(true)}
      >
        <ListOrdered className="size-3.5" />
        並び替え画面
      </Button>

      <ScrollArea className="flex min-h-[80px] max-h-[180px] flex-col border border-gray-200">
        {lifts.map((lift, index) => (
          <div
            key={lift.id}
            role="button"
            tabIndex={0}
            className={cn(
              "flex cursor-grab items-center gap-2 border-b border-gray-100 px-3 py-2 hover:bg-gray-50 hover:text-gray-900 active:cursor-grabbing",
              lift.id === selectedLiftId && "bg-blue-50",
              lift.id === draggedLiftId && "opacity-45",
              dropTarget?.liftId === lift.id &&
                (dropTarget.position === "before"
                  ? "border-t-2 border-blue-600"
                  : "border-b-2 border-blue-600"),
            )}
            draggable
            onDragStart={event => {
              setDraggedLiftId(lift.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", lift.id);
            }}
            onDragOver={event => {
              if (draggedLiftId === null || draggedLiftId === lift.id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              const bounds = event.currentTarget.getBoundingClientRect();
              const position =
                event.clientY < bounds.top + bounds.height / 2
                  ? "before"
                  : "after";
              setDropTarget({ liftId: lift.id, position });
            }}
            onDrop={event => {
              event.preventDefault();
              const sourceLiftId =
                draggedLiftId || event.dataTransfer.getData("text/plain");
              const bounds = event.currentTarget.getBoundingClientRect();
              const position =
                event.clientY < bounds.top + bounds.height / 2
                  ? "before"
                  : "after";
              reorderLift(sourceLiftId, lift.id, position);
              clearDragState();
            }}
            onDragEnd={clearDragState}
            onClick={() => onSelectLift(lift.id)}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectLift(lift.id);
              }
            }}
          >
            <span
              aria-hidden="true"
              className="select-none text-lg leading-none text-gray-400"
            >
              ⠿
            </span>
            <p className="truncate text-sm flex-1">
              {index + 1}. {liftDisplayName(lift, index)}
            </p>
            {lift.detailMatch && (
              <Badge
                variant="secondary"
                className="bg-green-50 text-green-900 text-xs"
              >
                {lift.detailMatch.method === "name"
                  ? "詳細結合（名前一致）"
                  : "詳細結合（手動）"}
              </Badge>
            )}
          </div>
        ))}
      </ScrollArea>
      <p className="text-[0.6875rem] text-gray-500 -mt-2">
        リフトをドラッグして並び替えられます。変更した順番が、保存後の GeoJSON
        のリフト順になります。
      </p>
      <PanelSection
        title="早朝・ナイターをまとめて設定"
        storageKey="rusutsu-lift-bulk-open"
        defaultOpen={false}
        summary={`${lifts.length} 本`}
      >
        <p className="mb-1.5 text-[11px] leading-relaxed text-gray-700">
          全リフトへ同じ値を一度に入れます。設定したあとで、1
          本ずつ変更できます。
        </p>
        <div className="flex flex-col gap-1.5">
          {(["morning", "night"] as const).map(key => (
            <div key={key} className="flex items-center gap-1">
              <span className="w-20 shrink-0 text-[11px] font-bold text-gray-600">
                {DETAIL_LABELS[key]}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {BUSINESS_HOURS_MARK_OPTIONS.map(value => (
                  <Button
                    key={value || "empty"}
                    size="xs"
                    variant="outline"
                    className="min-w-9"
                    disabled={lifts.length === 0}
                    title={`${DETAIL_LABELS[key]}を全リフト「${value || "未設定"}」にします`}
                    onClick={() => applyToAll(key, value)}
                  >
                    {value || "未設定"}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-600">
          <Checkbox
            checked={bulkOnlyEmpty}
            onCheckedChange={checked => setBulkOnlyEmpty(checked === true)}
          />
          未入力のリフトだけに入れる（入力済みは変えない）
        </label>
        {bulkMessage && (
          <p role="status" className="mt-1 text-[11px] text-green-800">
            {bulkMessage}
          </p>
        )}
      </PanelSection>
      <OrderOrganizerDialog
        open={isOrganizerOpen}
        onOpenChange={setIsOrganizerOpen}
        mapping={mapping}
        resortName={resort.nameJa || resort.id}
        kind="lifts"
        items={lifts.map(lift => ({ id: lift.id, name: lift.name }))}
        selectedItemId={selectedLiftId}
        onSelectItem={onSelectLift}
        onReorder={(from, to) =>
          setLifts(previous =>
            reorderVisibleLifts(
              previous,
              moveItem(
                lifts.map(lift => lift.id),
                from,
                to,
              ),
            ),
          )
        }
        onApplyCrawlerOrder={async orderedNames => {
          setLifts(previous =>
            reorderLiftsByCrawlerOrder(
              previous,
              lifts.map(lift => lift.id),
              orderedNames,
            ),
          );
          return {
            ok: true,
            message:
              "クローラー取得順に並べました。確認画面から保存してください。",
          };
        }}
      />
      {selectedLift ? (
        <>
          <div
            className={cn(
              "flex-shrink-0 rounded-md border p-2 text-xs",
              selectedLift.detailMatch
                ? "border-green-200 bg-green-50 text-green-900"
                : "border-gray-200 bg-gray-50 text-gray-700",
            )}
          >
            {selectedLift.detailMatch ? (
              <>
                <p className="font-medium text-green-900">
                  lift_detail「{selectedLift.detailMatch.detailName}」を
                  {selectedLift.detailMatch.method === "name"
                    ? "名前一致で自動結合済み"
                    : "手動で結合済み"}
                </p>
                <p className="mt-1">
                  取り込んだ項目:{" "}
                  {Object.keys(selectedLift.detailMatch.mergedFields)
                    .map(key => DETAIL_LABELS[key as keyof LiftDetail] ?? key)
                    .join(", ") || "なし"}
                </p>
                <ConfirmDialog
                  open={unmergeDialogOpen}
                  onOpenChange={setUnmergeDialogOpen}
                  title="結合の解除"
                  description="lift_detail との結合を解除し、詳細情報を読み込み時点の内容へ戻します。よろしいですか？"
                  onConfirm={handleUnmerge}
                  confirmLabel="解除する"
                />
                <Button
                  className="mt-2 border-red-600 text-red-700 hover:bg-red-50 hover:text-red-800"
                  size="xs"
                  variant="outline"
                  onClick={() => setUnmergeDialogOpen(true)}
                >
                  結合を解除
                </Button>
              </>
            ) : (
              <>
                <p className="font-bold">
                  lift_detail は未結合です
                  {availableEntries.length > 0 &&
                    "（名前が一致しないため自動結合していません。必要なら手動で選択してください）"}
                </p>
                {availableEntries.length > 0 ? (
                  <div className="mt-2 flex gap-2">
                    <Select
                      value={manualEntryIndex}
                      onValueChange={v => v && setManualEntryIndex(v)}
                    >
                      <SelectTrigger className={cn(selectClassName, "text-xs")}>
                        <SelectValue placeholder="結合するエントリを選択…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__empty__">
                          結合するエントリを選択…
                        </SelectItem>
                        {availableEntries.map(item => (
                          <SelectItem
                            key={item.index}
                            value={String(item.index)}
                          >
                            {typeof item.entry.name === "string" &&
                            item.entry.name !== ""
                              ? item.entry.name
                              : `（名前なし: ${item.index + 1} 番目）`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="xs"
                      variant="green"
                      disabled={manualEntryIndex === ""}
                      onClick={handleManualMerge}
                    >
                      結合
                    </Button>
                  </div>
                ) : (
                  <p className="mt-1">
                    結合できる lift_detail エントリはありません。
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex-shrink-0 rounded-md border border-gray-200 p-3">
            <div className="flex flex-col gap-2">
              <div>
                <Label>リフト名</Label>
                <Input
                  className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                  value={selectedLift.name}
                  onChange={event =>
                    updateSelectedLift(lift => {
                      const nextName = event.target.value;
                      return {
                        ...lift,
                        name: nextName,
                        detail: {
                          ...lift.detail,
                          searchWord: buildDefaultSearchWord(
                            resortSearchNameById.get(lift.skiId) ?? lift.skiId,
                            nextName,
                          ),
                        },
                      };
                    })
                  }
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.type}</Label>
                  <Select
                    value={selectedLift.detail.type}
                    onValueChange={value =>
                      value !== null && updateDetail({ type: value })
                    }
                  >
                    <SelectTrigger className={selectClassName}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map(option => (
                        <SelectItem key={option || "empty"} value={option}>
                          {option === "" ? "未設定" : option}
                        </SelectItem>
                      ))}
                      {selectedLift.detail.type !== "" &&
                        !TYPE_OPTIONS.includes(
                          selectedLift.detail.type as never,
                        ) && (
                          <SelectItem value={selectedLift.detail.type}>
                            {selectedLift.detail.type}
                          </SelectItem>
                        )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.speed}</Label>
                  <Select
                    value={selectedLift.detail.speed}
                    onValueChange={value =>
                      value !== null && updateDetail({ speed: value })
                    }
                  >
                    <SelectTrigger className={selectClassName}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SPEED_OPTIONS.map(option => (
                        <SelectItem key={option || "empty"} value={option}>
                          {option === "" ? "未設定" : option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.capacity}</Label>
                  <Input
                    className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                    type="number"
                    onWheel={event => event.currentTarget.blur()}
                    value={selectedLift.detail.capacity}
                    onChange={event =>
                      updateDetail({ capacity: event.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.distance}</Label>
                  <Input
                    className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                    type="number"
                    onWheel={event => event.currentTarget.blur()}
                    value={selectedLift.detail.distance}
                    onChange={event =>
                      updateDetail({ distance: event.target.value })
                    }
                  />
                </div>
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.vertical}</Label>
                  <Input
                    className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                    type="number"
                    onWheel={event => event.currentTarget.blur()}
                    value={selectedLift.detail.vertical}
                    onChange={event =>
                      updateDetail({ vertical: event.target.value })
                    }
                  />
                </div>
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.towers}</Label>
                  <Input
                    className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                    type="number"
                    onWheel={event => event.currentTarget.blur()}
                    value={selectedLift.detail.towers}
                    onChange={event =>
                      updateDetail({ towers: event.target.value })
                    }
                  />
                </div>
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.year}</Label>
                  <Input
                    className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                    value={selectedLift.detail.year}
                    onChange={event =>
                      updateDetail({ year: event.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.top}</Label>
                  <Input
                    className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                    value={selectedLift.detail.top}
                    onChange={event =>
                      updateDetail({ top: event.target.value })
                    }
                  />
                </div>
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.bottom}</Label>
                  <Input
                    className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                    value={selectedLift.detail.bottom}
                    onChange={event =>
                      updateDetail({ bottom: event.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.hood}</Label>
                  <MarkSelect
                    value={selectedLift.detail.hood}
                    onChange={value => updateDetail({ hood: value })}
                  />
                </div>
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.footrest}</Label>
                  <MarkSelect
                    value={selectedLift.detail.footrest}
                    onChange={value => updateDetail({ footrest: value })}
                  />
                </div>
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.oilShield}</Label>
                  <MarkSelect
                    value={selectedLift.detail.oilShield}
                    onChange={value => updateDetail({ oilShield: value })}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.morning}</Label>
                  <MarkSelect
                    value={selectedLift.detail.morning}
                    onChange={value => updateDetail({ morning: value })}
                    options={BUSINESS_HOURS_MARK_OPTIONS}
                  />
                </div>
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.night}</Label>
                  <MarkSelect
                    value={selectedLift.detail.night}
                    onChange={value => updateDetail({ night: value })}
                    options={BUSINESS_HOURS_MARK_OPTIONS}
                  />
                </div>
                <div className="flex-1">
                  <Label>{DETAIL_LABELS.maker}</Label>
                  <Select
                    value={selectedLift.detail.maker}
                    onValueChange={value =>
                      value !== null && updateDetail({ maker: value })
                    }
                  >
                    <SelectTrigger className={selectClassName}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAKER_OPTIONS.map(option => (
                        <SelectItem key={option || "empty"} value={option}>
                          {option === "" ? "未設定" : option}
                        </SelectItem>
                      ))}
                      {selectedLift.detail.maker !== "" &&
                        !MAKER_OPTIONS.includes(
                          selectedLift.detail.maker as never,
                        ) && (
                          <SelectItem value={selectedLift.detail.maker}>
                            {selectedLift.detail.maker}
                          </SelectItem>
                        )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{DETAIL_LABELS.searchWord}</Label>
                <Input
                  className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                  value={selectedLift.detail.searchWord}
                  onChange={event =>
                    updateDetail({ searchWord: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>{DETAIL_LABELS.link}</Label>
                <Input
                  className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                  value={selectedLift.detail.link}
                  onChange={event => updateDetail({ link: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="lift-note">{DETAIL_LABELS.note}（note）</Label>
                <Textarea
                  id="lift-note"
                  rows={3}
                  value={selectedLift.detail.note}
                  onChange={event => updateDetail({ note: event.target.value })}
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-500">
          上の一覧からリフトを選ぶと詳細を編集できます。
        </p>
      )}
      {showProceedWarning && incompleteLifts.length > 0 && (
        <Alert className="flex-shrink-0 border-orange-300 bg-orange-50">
          <AlertTitle className="text-sm font-bold text-orange-900">
            未入力の詳細情報があります
          </AlertTitle>
          <AlertDescription className="mt-1 text-xs text-orange-900">
            次の項目を修正するか、未入力のまま次へ進んでください。
          </AlertDescription>
          <ScrollArea className="mt-2 flex max-h-[140px] flex-col gap-1">
            {incompleteLifts.map(({ lift, index, emptyKeys }) => (
              <Button
                key={lift.id}
                size="xs"
                variant="ghost"
                className="justify-start text-orange-900 hover:bg-orange-100 hover:text-orange-700"
                onClick={() => onSelectLift(lift.id)}
              >
                {index + 1}. {liftDisplayName(lift, index)}:{" "}
                {emptyKeys.map(key => DETAIL_LABELS[key]).join("、")}
              </Button>
            ))}
          </ScrollArea>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowProceedWarning(false);
                onSelectLift(incompleteLifts[0].lift.id);
              }}
            >
              入力を修正する
            </Button>
            <Button size="sm" variant="orange" onClick={onProceed}>
              未入力のまま進む
            </Button>
          </div>
        </Alert>
      )}
      {(!showProceedWarning || incompleteLifts.length === 0) && (
        <Button
          variant="default"
          className="flex-shrink-0"
          onClick={handleProceed}
        >
          次へ（全体情報リンク）
        </Button>
      )}
    </div>
  );
}
