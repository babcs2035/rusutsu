"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { DraftSummary, ResortOption, StartSource } from "../types";

type ResortSelectStepProps = {
  resorts: ResortOption[];
  onStart: (resort: ResortOption, source: StartSource) => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

const draftMapKey = (resortId: string, sourceKind: "curated" | "osm") =>
  `${sourceKind}:${resortId}`;

type CrawlerFilter = "all" | "with" | "without";

const CRAWLER_FILTERS: Array<{ id: CrawlerFilter; label: string }> = [
  { id: "all", label: "すべて" },
  { id: "with", label: "取得結果あり" },
  { id: "without", label: "取得結果なし" },
];

export function ResortSelectStep({ resorts, onStart }: ResortSelectStepProps) {
  const [query, setQuery] = useState("");
  const [crawlerFilter, setCrawlerFilter] = useState<CrawlerFilter>("all");
  const [pendingResortId, setPendingResortId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Map<string, DraftSummary>>(new Map());

  useEffect(() => {
    setDrafts(
      new Map(
        listDraftSummaries().map(summary => [
          draftMapKey(summary.resortId, summary.sourceKind),
          summary,
        ]),
      ),
    );
  }, []);

  const filteredResorts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return resorts.filter(resort => {
      if (crawlerFilter === "with" && !resort.hasCrawlerCourses) return false;
      if (crawlerFilter === "without" && resort.hasCrawlerCourses) return false;
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
  const pendingCuratedDraft = pendingResort
    ? (drafts.get(draftMapKey(pendingResort.id, "curated")) ?? null)
    : null;
  const pendingOsmDraft = pendingResort
    ? (drafts.get(draftMapKey(pendingResort.id, "osm")) ?? null)
    : null;

  const [discardSourceKind, setDiscardSourceKind] = useState<
    "curated" | "osm" | null
  >(null);

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
        hasExistingData: resort.hasSlopeBefore || resort.hasSlopeBeforeOsm,
      })),
    [resorts],
  );
  const handleSelectResort = useCallback(
    (id: string) => setPendingResortId(id),
    [],
  );

  const handleDiscardDraft = () => {
    if (!pendingResort || !discardSourceKind) return;
    discardDraft(pendingResort.id, discardSourceKind);
    setDrafts(previous => {
      const next = new Map(previous);
      next.delete(draftMapKey(pendingResort.id, discardSourceKind));
      return next;
    });
    setDiscardSourceKind(null);
  };

  const pendingDiscardDraft =
    discardSourceKind === "osm" ? pendingOsmDraft : pendingCuratedDraft;

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
        <h2 className="font-bold font-[var(--font-heading)] text-base">
          スキー場を選ぶ
        </h2>
        <p className="text-xs text-gray-600">
          リストから選ぶか、右の地図のマーカーをクリックしてください。
        </p>
        <Input
          className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
          placeholder="スキー場名・都道府県で検索"
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
          kinds={["confirmed", "osm", "crawler", "noCrawler"]}
        />
        <ResortPickerLegend />

        {pendingResort && (
          <Card className="border-2 border-blue-600 rounded-md bg-blue-50">
            <CardContent className="p-3">
              <p className="font-bold font-[var(--font-heading)]">
                {pendingResort.nameJa}
              </p>
              <p className="text-xs text-gray-600">
                {pendingResort.prefecture} / {pendingResort.id}
              </p>
              <div className="mt-1 mb-2 flex flex-wrap gap-1">
                {pendingResort.hasSlopeBefore && (
                  <ResortStatusBadge kind="confirmed" />
                )}
                {pendingResort.hasSlopeBeforeOsm && (
                  <ResortStatusBadge kind="osm" />
                )}
                <ResortStatusBadge
                  kind={
                    pendingResort.hasCrawlerCourses ? "crawler" : "noCrawler"
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                {pendingCuratedDraft && (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onStart(pendingResort, "draft-curated")}
                    >
                      確認済みデータの下書きを復元（
                      {formatDateTime(pendingCuratedDraft.updatedAt)} 保存・
                      {pendingCuratedDraft.courseCount} コース）
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-700 hover:text-red-800 hover:bg-red-50"
                      onClick={() => setDiscardSourceKind("curated")}
                    >
                      確認済みデータの下書きを破棄
                    </Button>
                  </>
                )}
                {pendingOsmDraft && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStart(pendingResort, "draft-osm")}
                    >
                      OSMデータの下書きを復元（
                      {formatDateTime(pendingOsmDraft.updatedAt)} 保存・
                      {pendingOsmDraft.courseCount} コース）
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-700 hover:text-red-800 hover:bg-red-50"
                      onClick={() => setDiscardSourceKind("osm")}
                    >
                      OSMデータの下書きを破棄
                    </Button>
                  </>
                )}
                <ConfirmDialog
                  open={discardSourceKind !== null}
                  onOpenChange={open => {
                    if (!open) setDiscardSourceKind(null);
                  }}
                  title="下書きの破棄"
                  description={`「${pendingResort.nameJa}」の${discardSourceKind === "osm" ? "OSMデータ" : "確認済みデータ"}の下書き${pendingDiscardDraft ? `（${formatDateTime(pendingDiscardDraft.updatedAt)} 保存）` : ""}を破棄します。よろしいですか？`}
                  onConfirm={handleDiscardDraft}
                  confirmLabel="破棄する"
                />
                {pendingResort.hasSlopeBefore && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => onStart(pendingResort, "curated")}
                  >
                    確認済みの slope_before を読み込んで編集
                  </Button>
                )}
                {pendingResort.hasSlopeBeforeOsm && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStart(pendingResort, "osm")}
                  >
                    OpenStreetMapデータを読み込んで所属確認
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={
                    pendingResort.hasSlopeBefore ||
                    pendingResort.hasSlopeBeforeOsm ||
                    pendingCuratedDraft ||
                    pendingOsmDraft
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
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {(drafts.has(draftMapKey(resort.id, "curated")) ||
                  drafts.has(draftMapKey(resort.id, "osm"))) && (
                  <ResortStatusBadge kind="draft" />
                )}
                {resort.hasSlopeBefore && (
                  <ResortStatusBadge kind="confirmed" />
                )}
                {resort.hasSlopeBeforeOsm && <ResortStatusBadge kind="osm" />}
                <ResortStatusBadge
                  kind={resort.hasCrawlerCourses ? "crawler" : "noCrawler"}
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
