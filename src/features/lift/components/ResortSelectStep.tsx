"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResortPickerLegend,
  ResortPickerMap,
} from "@/features/map/ResortPickerMap";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import {
  ResortStatusBadge,
  ResortStatusLegend,
} from "@/shared/components/ResortStatusBadges";
import { discardDraft, listDraftSummaries } from "../hooks/useDraftStorage";
import type { DraftSummary, ResortOption } from "../types";

export type StartSource = "draft" | "existing" | "new";

type CrawlerFilter = "all" | "with" | "without";

const CRAWLER_FILTERS: Array<{ id: CrawlerFilter; label: string }> = [
  { id: "all", label: "すべて" },
  { id: "with", label: "クローラーあり" },
  { id: "without", label: "クローラーなし" },
];

type ResortSelectStepProps = {
  resorts: ResortOption[];
  onStart: (resort: ResortOption, source: StartSource) => void;
  onToggleConfirmed: (resort: ResortOption, confirmed: boolean) => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

export function ResortSelectStep({
  resorts,
  onStart,
  onToggleConfirmed,
}: ResortSelectStepProps) {
  const [query, setQuery] = useState("");
  const [crawlerFilter, setCrawlerFilter] = useState<CrawlerFilter>("all");
  const [pendingResortId, setPendingResortId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Map<string, DraftSummary>>(new Map());

  useEffect(() => {
    setDrafts(
      new Map(listDraftSummaries().map(summary => [summary.resortId, summary])),
    );
  }, []);

  const filteredResorts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return resorts.filter(resort => {
      if (crawlerFilter === "with" && !resort.hasCrawlerLifts) return false;
      if (crawlerFilter === "without" && resort.hasCrawlerLifts) return false;
      if (keyword === "") return true;
      return (
        resort.nameJa.toLowerCase().includes(keyword) ||
        resort.nameEn.toLowerCase().includes(keyword) ||
        resort.prefecture.toLowerCase().includes(keyword) ||
        resort.id.toLowerCase().includes(keyword)
      );
    });
  }, [crawlerFilter, resorts, query]);

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
      resorts
        // centroid を出せなかった仮 ID は座標が 0,0 になる。地図には出さない
        .filter(resort => resort.latitude !== 0 || resort.longitude !== 0)
        .map(resort => ({
          id: resort.id,
          labelName: resort.labelName,
          latitude: resort.latitude,
          longitude: resort.longitude,
          numberOfCourses: resort.numberOfCourses,
          hasExistingData: resort.hasLiftBefore,
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
      <div className="flex-1 min-w-0">
        <ResortPickerMap
          resorts={pickerResorts}
          selectedResortId={pendingResortId}
          onSelectResort={handleSelectResort}
          filteredResortIdSet={filteredResortIdSet}
          isFilterActive={isFilterActive}
        />
      </div>
      <div className="flex w-[min(460px,60vw)] min-w-0 flex-col gap-2 overflow-hidden border-l border-gray-200 bg-white p-3 lg:w-[460px] lg:min-w-[460px]">
        <h2 className="text-lg font-bold font-[var(--font-heading)]">
          スキー場を選ぶ
        </h2>
        <p className="text-sm text-gray-600">
          lift_before
          のあるスキー場を選ぶと、リフトの所属・位置・詳細を編集できます。
        </p>
        <Input
          className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
          placeholder="スキー場名・都道府県・IDで検索"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-1">
          {CRAWLER_FILTERS.map(filter => (
            <Button
              key={filter.id}
              size="xs"
              variant={crawlerFilter === filter.id ? "default" : "outline"}
              onClick={() => setCrawlerFilter(filter.id)}
            >
              {filter.label}
            </Button>
          ))}
          <span className="text-[11px] text-gray-500">
            {filteredResorts.length} 件
          </span>
        </div>
        <ResortStatusLegend
          kinds={["confirmed", "liftData", "crawler", "noCrawler"]}
        />
        <ResortPickerLegend />

        {pendingResort && (
          <Card className="rounded-md border-2 border-blue-600 bg-blue-50">
            <CardContent className="p-3">
              {pendingResort.isKnownResort ? (
                <>
                  <p className="font-bold font-[var(--font-heading)]">
                    {pendingResort.nameJa}
                  </p>
                  <p className="text-xs text-gray-600">
                    {pendingResort.prefecture} / {pendingResort.id}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold font-mono">{pendingResort.id}</p>
                  <p className="text-xs text-gray-600">
                    DB のスキー場一覧には無い ID です（lift_before
                    のみ存在する意図的な仮 ID の可能性があります）
                  </p>
                </>
              )}
              <div className="mt-1 mb-2 flex flex-wrap gap-1">
                {pendingResort.hasLiftBefore && (
                  <ResortStatusBadge kind="liftData" />
                )}
                {pendingResort.confirmedAt && (
                  <ResortStatusBadge kind="confirmed" />
                )}
                <ResortStatusBadge
                  kind={pendingResort.hasCrawlerLifts ? "crawler" : "noCrawler"}
                />
              </div>
              <div className="flex flex-col gap-2">
                {pendingDraft && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      onClick={() => onStart(pendingResort, "draft")}
                    >
                      下書きを復元して編集（
                      {formatDateTime(pendingDraft.updatedAt)} 保存・
                      {pendingDraft.liftCount} リフト）
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
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDiscardDialogOpen(true)}
                    >
                      下書きを破棄
                    </Button>
                  </>
                )}
                {pendingResort.hasLiftBefore ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() => onStart(pendingResort, "existing")}
                  >
                    lift_before を読み込んで編集
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() => onStart(pendingResort, "new")}
                  >
                    新規作成（リフトを地図上に描く）
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={
                    pendingResort.confirmedAt
                      ? "text-orange-900 hover:text-orange-700 hover:bg-orange-100"
                      : "text-green-900 hover:text-green-700 hover:bg-green-100"
                  }
                  onClick={() =>
                    onToggleConfirmed(
                      pendingResort,
                      pendingResort.confirmedAt === null,
                    )
                  }
                >
                  {pendingResort.confirmedAt
                    ? `確認済みを解除（${formatDateTime(pendingResort.confirmedAt)}）`
                    : "✓ 確認済みにする"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex-1 overflow-y-auto rounded-md border border-gray-200">
          {filteredResorts.map(resort => (
            <div
              key={resort.id}
              role="button"
              tabIndex={0}
              className={cn(
                "flex cursor-pointer items-center gap-2 border-b border-gray-100 px-3 py-2 hover:bg-gray-50 hover:text-gray-900",
                resort.id === pendingResortId && "bg-blue-200",
              )}
              onClick={() => setPendingResortId(resort.id)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPendingResortId(resort.id);
                }
              }}
            >
              <div className="flex-1 min-w-0">
                {resort.isKnownResort ? (
                  <>
                    <p className="truncate text-sm font-medium">
                      {resort.nameJa}
                    </p>
                    <p className="text-xs text-gray-500">
                      {resort.prefecture} / {resort.id}
                    </p>
                  </>
                ) : (
                  <p className="truncate text-sm font-medium font-mono">
                    {resort.id}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {!resort.isKnownResort && (
                  <ResortStatusBadge kind="unknownId" />
                )}
                {resort.confirmedAt && (
                  <TooltipProvider delay={0}>
                    <ShadcnTooltip>
                      <TooltipTrigger>
                        <ResortStatusBadge kind="confirmed" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        確認済み: {formatDateTime(resort.confirmedAt)}
                      </TooltipContent>
                    </ShadcnTooltip>
                  </TooltipProvider>
                )}
                {drafts.has(resort.id) && <ResortStatusBadge kind="draft" />}
                {resort.hasLiftBefore && <ResortStatusBadge kind="liftData" />}
                <ResortStatusBadge
                  kind={resort.hasCrawlerLifts ? "crawler" : "noCrawler"}
                />
              </div>
            </div>
          ))}
          {filteredResorts.length === 0 && (
            <p className="p-3 text-sm font-semibold text-gray-500">
              該当するスキー場がありません。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
