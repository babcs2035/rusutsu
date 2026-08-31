"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { buildDefaultSearchWord } from "@/shared/utils/searchWord";
import type { EditorLift, ResortOption } from "../types";
import { distanceM, formatDistanceM, liftDisplayName } from "../utils/liftOps";

type AssignStepProps = {
  resort: ResortOption;
  resorts: ResortOption[];
  lifts: EditorLift[];
  setLifts: (updater: (lifts: EditorLift[]) => EditorLift[]) => void;
  savedAt: string | null;
  selectedLiftId: string | null;
  onSelectLift: (liftId: string | null) => void;
  onProceed: () => void;
  onBackToSelect: () => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

// 所属候補として距離の近い順に表示するスキー場数
const NEARBY_OPTION_COUNT = 20;

const resortLabel = (option: ResortOption | undefined, id: string): string =>
  option?.nameJa ? `${id}（${option.nameJa}）` : id;

export function AssignStep({
  resort,
  resorts,
  lifts,
  setLifts,
  savedAt,
  selectedLiftId,
  onSelectLift,
  onProceed,
  onBackToSelect,
}: AssignStepProps) {
  const resortById = useMemo(
    () => new Map(resorts.map(option => [option.id, option])),
    [resorts],
  );

  // リフトごとに近いスキー場を候補として並べる（現在値・元の値は必ず含める）
  const optionsByLiftId = useMemo(() => {
    const map = new Map<
      string,
      Array<{ id: string; label: string; distance: number }>
    >();
    for (const lift of lifts) {
      const origin = lift.coordinates[0];
      if (!origin) {
        map.set(lift.id, []);
        continue;
      }
      const sorted = resorts
        .map(option => ({
          id: option.id,
          nameJa: option.nameJa,
          distance: distanceM(origin, [option.longitude, option.latitude]),
        }))
        .sort((a, b) => a.distance - b.distance);
      const nearby = sorted.slice(0, NEARBY_OPTION_COUNT);
      for (const requiredId of [lift.skiId, lift.original.skiId]) {
        if (!nearby.some(option => option.id === requiredId)) {
          const found = sorted.find(option => option.id === requiredId);
          if (found) nearby.push(found);
        }
      }
      map.set(
        lift.id,
        nearby.map(option => ({
          id: option.id,
          label: option.nameJa
            ? `${option.id}（${option.nameJa}, ${formatDistanceM(option.distance)}）`
            : `${option.id}（${formatDistanceM(option.distance)}）`,
          distance: option.distance,
        })),
      );
    }
    return map;
  }, [lifts, resorts]);

  const changedCount = lifts.filter(
    lift => lift.skiId !== lift.original.skiId,
  ).length;

  const updateLiftSkiId = (liftId: string, skiId: string) => {
    setLifts(previous =>
      previous.map(lift => {
        if (lift.id !== liftId) return lift;
        const currentResortName =
          resortById.get(lift.skiId)?.searchName ?? lift.skiId;
        const nextResortName = resortById.get(skiId)?.searchName ?? skiId;
        const currentDefault = buildDefaultSearchWord(
          currentResortName,
          lift.name,
        );
        const searchWord =
          lift.detail.searchWord.trim() === "" ||
          lift.detail.searchWord === currentDefault
            ? buildDefaultSearchWord(nextResortName, lift.name)
            : lift.detail.searchWord;
        return {
          ...lift,
          skiId,
          detail: { ...lift.detail, searchWord },
        };
      }),
    );
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3 overflow-hidden border-l border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between">
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
        <Button size="sm" variant="outline" onClick={onBackToSelect}>
          スキー場選択へ戻る
        </Button>
      </div>

      <Card className="flex-shrink-0">
        <CardContent className="p-2">
          <p className="text-xs text-gray-600">
            各リフトの所属スキー場IDを確認し、誤っていれば近隣のスキー場へ変更してください。
          </p>
          <p className="text-xs text-gray-600">
            別のスキー場へ変更したリフトは、保存時にそのスキー場の lift_before
            へ移動します。
          </p>
          {changedCount > 0 && (
            <p className="mt-1 font-bold text-orange-900">
              所属変更: {changedCount} 件
            </p>
          )}
        </CardContent>
      </Card>

      <div className="min-h-[200px] flex-1 overflow-y-auto rounded-md border border-gray-200">
        {lifts.map((lift, index) => {
          const isActive = lift.id === selectedLiftId;
          const isChanged = lift.skiId !== lift.original.skiId;
          const options = optionsByLiftId.get(lift.id) ?? [];
          return (
            <div
              key={lift.id}
              role="button"
              tabIndex={0}
              className={cn(
                "cursor-pointer border-b border-gray-100 p-2 transition-colors",
                isActive && "bg-blue-50",
              )}
              onClick={() => onSelectLift(lift.id)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectLift(lift.id);
                }
              }}
            >
              <div className="flex items-center gap-2">
                <span className="w-6 text-xs text-gray-500">{index + 1}</span>
                <span className="flex-1 truncate text-sm font-medium">
                  {liftDisplayName(lift, index)}
                </span>
                {isChanged && (
                  <Badge
                    variant="secondary"
                    className="bg-orange-100 text-orange-900 text-xs whitespace-nowrap"
                  >
                    変更
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-col gap-1 pl-8">
                <Select
                  value={lift.skiId}
                  onValueChange={v => v && updateLiftSkiId(lift.id, v)}
                >
                  <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isChanged && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-orange-900">
                      {resortLabel(
                        resortById.get(lift.original.skiId),
                        lift.original.skiId,
                      )}{" "}
                      → {resortLabel(resortById.get(lift.skiId), lift.skiId)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={event => {
                        event.stopPropagation();
                        updateLiftSkiId(lift.id, lift.original.skiId);
                      }}
                    >
                      元に戻す
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {lifts.length === 0 && (
          <p className="p-3 text-sm font-semibold text-gray-500">
            このスキー場の lift_before にリフトがありません。
          </p>
        )}
      </div>

      <Button
        variant="default"
        className="flex-shrink-0"
        onClick={onProceed}
        disabled={lifts.length === 0}
      >
        次へ（リフト位置の補正）
      </Button>
    </div>
  );
}
