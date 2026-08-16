"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TILE_LAYERS } from "@/features/slope/constants";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { discardDraft, listDraftSummaries } from "../hooks/useDraftStorage";
import type { DraftSummary, ResortOption } from "../types";

export type StartSource = "draft" | "existing" | "new";

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

  const gsiPale = TILE_LAYERS.gsiPale;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[min(420px,60vw)] lg:w-[420px] min-w-0 lg:min-w-[420px] flex-col border-r border-gray-200 p-4 gap-3 overflow-hidden">
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

        {pendingResort && (
          <Card className="rounded-md border-2 border-blue-600 bg-blue-50">
            <CardContent className="p-3">
              {pendingResort.isKnownResort ? (
                <>
                  <p className="font-bold font-[var(--font-heading)]">
                    {pendingResort.nameJa}
                  </p>
                  <p className="text-xs text-gray-600 mb-2">
                    {pendingResort.prefecture} / {pendingResort.id}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold font-mono">{pendingResort.id}</p>
                  <p className="text-xs text-gray-600 mb-2">
                    DB のスキー場一覧には無い ID です（lift_before
                    のみ存在する意図的な仮 ID の可能性があります）
                  </p>
                </>
              )}
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
              {!resort.isKnownResort && (
                <Badge variant="secondary" className="text-xs">
                  未登録ID
                </Badge>
              )}
              {resort.confirmedAt && (
                <TooltipProvider delay={0}>
                  <ShadcnTooltip>
                    <TooltipTrigger>
                      <Badge
                        variant="secondary"
                        className="text-xs text-green-900"
                      >
                        ✓ 確認済み
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      確認済み: {formatDateTime(resort.confirmedAt)}
                    </TooltipContent>
                  </ShadcnTooltip>
                </TooltipProvider>
              )}
              {drafts.has(resort.id) && (
                <Badge variant="secondary" className="text-xs text-orange-900">
                  下書きあり
                </Badge>
              )}
              {resort.hasLiftBefore && (
                <Badge variant="secondary" className="text-xs text-blue-600">
                  リフトデータあり
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
        <MapContainer
          center={[38.25, 138.0]}
          zoom={6}
          className="w-full h-full"
        >
          <TileLayer
            url={gsiPale.url}
            attribution={gsiPale.attribution}
            maxZoom={gsiPale.maxZoom}
          />
          {resorts.map(resort => (
            <CircleMarker
              key={resort.id}
              center={[resort.latitude, resort.longitude]}
              radius={resort.id === pendingResortId ? 9 : 6}
              pathOptions={{
                color: "#fff",
                weight: 1.5,
                fillColor:
                  resort.id === pendingResortId
                    ? "#dd6b20"
                    : resort.hasLiftBefore
                      ? "#3182ce"
                      : "#718096",
                fillOpacity: 0.9,
              }}
              eventHandlers={{
                click: () => setPendingResortId(resort.id),
              }}
            >
              <Tooltip>{resort.nameJa || resort.id}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
