"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ResortPickerLegend,
  ResortPickerMap,
} from "@/features/map/ResortPickerMap";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { discardDraft, listDraftSummaries } from "../hooks/useDraftStorage";
import type { DraftSummary, ResortOption, StartSource } from "../types";

type ResortSelectStepProps = {
  resorts: ResortOption[];
  onStart: (resort: ResortOption, source: StartSource) => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

export function ResortSelectStep({ resorts, onStart }: ResortSelectStepProps) {
  const [query, setQuery] = useState("");
  const [pendingResortId, setPendingResortId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Map<string, DraftSummary>>(new Map());

  useEffect(() => {
    setDrafts(
      new Map(listDraftSummaries().map(summary => [summary.resortId, summary])),
    );
  }, []);

  const filteredResorts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (keyword === "") return resorts;
    return resorts.filter(
      resort =>
        resort.nameJa.toLowerCase().includes(keyword) ||
        resort.nameEn.toLowerCase().includes(keyword) ||
        resort.prefecture.toLowerCase().includes(keyword) ||
        resort.id.toLowerCase().includes(keyword),
    );
  }, [resorts, query]);

  const pendingResort =
    resorts.find(resort => resort.id === pendingResortId) ?? null;
  const pendingDraft = pendingResort
    ? (drafts.get(pendingResort.id) ?? null)
    : null;

  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  const isFilterActive = query.trim() !== "";
  const filteredResortIdSet = useMemo(
    () => new Set(filteredResorts.map(resort => resort.id)),
    [filteredResorts],
  );
  const pickerResorts = useMemo(
    () =>
      resorts.map(resort => ({
        id: resort.id,
        labelName: resort.labelName,
        latitude: resort.latitude,
        longitude: resort.longitude,
        numberOfCourses: resort.numberOfCourses,
        hasExistingData: resort.hasSlopeBefore,
      })),
    [resorts],
  );
  const handleSelectResort = useCallback(
    (id: string) => setPendingResortId(id),
    [],
  );

  const handleDiscardDraft = () => {
    if (!pendingResort || !pendingDraft) return;
    discardDraft(pendingResort.id);
    setDrafts(previous => {
      const next = new Map(previous);
      next.delete(pendingResort.id);
      return next;
    });
    setDiscardDialogOpen(false);
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[min(420px,60vw)] lg:w-[420px] min-w-0 lg:min-w-[420px] flex-col border-r border-gray-200 p-4 gap-3 overflow-hidden">
        <h2 className="text-lg font-bold font-[var(--font-heading)]">
          スキー場を選ぶ
        </h2>
        <p className="text-sm text-gray-600">
          リストから選ぶか、右の地図上のマーカーをクリックしてください。
        </p>
        <Input
          className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
          placeholder="スキー場名・都道府県で検索"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <ResortPickerLegend />

        {pendingResort && (
          <Card className="border-2 border-blue-600 rounded-md bg-blue-50">
            <CardContent className="p-3">
              <p className="font-bold font-[var(--font-heading)]">
                {pendingResort.nameJa}
              </p>
              <p className="text-xs text-gray-600 mb-2">
                {pendingResort.prefecture} / {pendingResort.id}
              </p>
              <div className="flex flex-col gap-2">
                {pendingDraft && (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onStart(pendingResort, "draft")}
                    >
                      下書きを復元して編集（
                      {formatDateTime(pendingDraft.updatedAt)} 保存・
                      {pendingDraft.courseCount} コース）
                    </Button>
                    <ConfirmDialog
                      open={discardDialogOpen}
                      onOpenChange={setDiscardDialogOpen}
                      title="下書きの破棄"
                      description={`「${pendingResort.nameJa}」の下書き（${formatDateTime(pendingDraft.updatedAt)} 保存）を破棄します。よろしいですか？`}
                      onConfirm={handleDiscardDraft}
                      confirmLabel="破棄する"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-700 hover:text-red-800 hover:bg-red-50"
                      onClick={() => setDiscardDialogOpen(true)}
                    >
                      下書きを破棄
                    </Button>
                  </>
                )}
                {pendingResort.hasSlopeBefore && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => onStart(pendingResort, "existing")}
                  >
                    既存の slope_before を読み込んで編集
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={
                    pendingResort.hasSlopeBefore || pendingDraft
                      ? "outline"
                      : "default"
                  }
                  onClick={() => onStart(pendingResort, "new")}
                >
                  新規作成
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-md">
          {filteredResorts.map(resort => (
            <div
              key={resort.id}
              role="button"
              tabIndex={0}
              className={cn(
                "flex items-center px-3 py-2 gap-2 cursor-pointer border-b border-gray-100 hover:bg-gray-50 hover:text-gray-900",
                resort.id === pendingResortId && "bg-blue-200",
              )}
              onClick={() => setPendingResortId(resort.id)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPendingResortId(resort.id);
                }
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{resort.nameJa}</p>
                <p className="text-xs text-gray-500">{resort.prefecture}</p>
              </div>
              {drafts.has(resort.id) && (
                <Badge
                  variant="secondary"
                  className="bg-orange-50 text-orange-900 text-xs"
                >
                  下書きあり
                </Badge>
              )}
              {resort.hasSlopeBefore && (
                <Badge
                  variant="secondary"
                  className="bg-blue-50 text-blue-900 text-xs"
                >
                  既存データあり
                </Badge>
              )}
            </div>
          ))}
          {filteredResorts.length === 0 && (
            <p className="p-3 text-sm font-semibold text-gray-500">
              該当するスキー場がありません。
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <ResortPickerMap
          resorts={pickerResorts}
          selectedResortId={pendingResortId}
          onSelectResort={handleSelectResort}
          filteredResortIdSet={filteredResortIdSet}
          isFilterActive={isFilterActive}
        />
      </div>
    </div>
  );
}
