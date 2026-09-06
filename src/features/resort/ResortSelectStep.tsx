"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getResortLabelName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import type { AdminSkiResortRecord } from "@/server/ski-resorts/adminContract";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";

const ResortPickerMap = dynamic(
  () =>
    import("@/features/map/ResortPickerMap").then(
      module => module.ResortPickerMap,
    ),
  { ssr: false, loading: () => <LoadingSpinner /> },
);

function PublicationBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        isActive
          ? "bg-emerald-100 text-emerald-800"
          : "bg-gray-200 text-gray-700",
      )}
    >
      {isActive ? "公開中" : "公開停止中"}
    </span>
  );
}

export function ResortSelectStep({
  resorts,
  selectedResortId,
  onSelectResort,
  query,
  onQueryChange,
  onStart,
}: {
  resorts: AdminSkiResortRecord[];
  selectedResortId: string | null;
  onSelectResort: (id: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  onStart: () => void;
}) {
  const filteredResorts = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ja");
    return resorts.filter(resort =>
      `${resort.nameJa} ${resort.nameEn} ${resort.shortName ?? ""} ${resort.id} ${resort.prefecture}`
        .toLocaleLowerCase("ja")
        .includes(keyword),
    );
  }, [query, resorts]);
  const filteredResortIdSet = useMemo(
    () => new Set(filteredResorts.map(resort => resort.id)),
    [filteredResorts],
  );
  const pickerResorts = useMemo(
    () =>
      resorts
        .filter(resort => resort.latitude !== 0 || resort.longitude !== 0)
        .map(resort => ({
          id: resort.id,
          labelName: getResortLabelName(
            resort.id,
            resort.nameJa,
            resort.shortName,
          ),
          latitude: resort.latitude,
          longitude: resort.longitude,
          numberOfCourses: resort.numberOfCourses,
          hasExistingData: true,
        })),
    [resorts],
  );
  const selectedResort = resorts.find(resort => resort.id === selectedResortId);

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="min-h-0 min-w-0 flex-1 max-md:min-h-[25dvh]">
        <ResortPickerMap
          resorts={pickerResorts}
          selectedResortId={selectedResortId}
          onSelectResort={onSelectResort}
          filteredResortIdSet={filteredResortIdSet}
          isFilterActive={query.trim() !== ""}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden border-t border-gray-200 bg-white p-3 max-md:h-[60%] md:w-[min(460px,60vw)] md:border-t-0 md:border-l lg:w-[460px] lg:min-w-[460px]">
        <h2 className="text-lg font-bold font-[var(--font-heading)]">
          スキー場を選ぶ
        </h2>
        <p className="text-sm text-gray-600">
          地図や検索一覧からスキー場を選び、詳細設定を開いて基本情報や公開状態を編集します。
        </p>
        <Input
          type="search"
          className="h-9 w-full bg-white"
          placeholder="スキー場名・都道府県・IDで検索"
          aria-label="スキー場を検索"
          value={query}
          onChange={event => onQueryChange(event.target.value)}
        />
        <p className="text-xs text-gray-500" role="status">
          {filteredResorts.length} 件 / 全 {resorts.length}{" "}
          件（公開停止中も含む）
        </p>
        {selectedResort && (
          <Card className="shrink-0 rounded-md border-2 border-blue-600 bg-blue-50">
            <CardContent className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold font-[var(--font-heading)]">
                  {selectedResort.nameJa}
                </p>
                <PublicationBadge isActive={selectedResort.isActive} />
              </div>
              <p className="break-all text-xs text-gray-600">
                {selectedResort.prefecture} / {selectedResort.id}
              </p>
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={onStart}
              >
                詳細設定を開く
              </Button>
            </CardContent>
          </Card>
        )}
        <section
          className="min-h-0 flex-1 overflow-y-auto rounded-md border border-gray-200"
          aria-label="スキー場一覧"
        >
          {filteredResorts.map(resort => (
            <button
              key={resort.id}
              type="button"
              aria-pressed={resort.id === selectedResortId}
              className={cn(
                "flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600",
                resort.id === selectedResortId && "bg-blue-200",
              )}
              onClick={() => onSelectResort(resort.id)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {resort.nameJa}
                </span>
                <span className="block truncate text-xs text-gray-500">
                  {resort.prefecture} / {resort.id}
                </span>
              </span>
              <PublicationBadge isActive={resort.isActive} />
            </button>
          ))}
          {filteredResorts.length === 0 && (
            <p className="p-3 text-sm text-gray-600">
              {resorts.length === 0
                ? "登録されているスキー場がありません。"
                : "一致するスキー場がありません。検索条件を変更してください。"}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
