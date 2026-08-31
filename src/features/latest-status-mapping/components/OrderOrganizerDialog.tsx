"use client";

import { GripVertical, ListOrdered, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useSortableList } from "@/shared/hooks/useSortableList";
import { loadLatestStatusMapping } from "../actions";
import type {
  ApplyGeojsonOrderResult,
  LatestStatusMappingKind,
  LatestStatusMappingWorkspace,
} from "../types";
import { buildGeojsonOrderByCrawledItems } from "../utils/rows";

export type OrganizerItem = {
  id: string;
  name: string;
  /** 一覧の 2 行目に出す補足（点の数・難易度など） */
  detail?: string;
};

type OrderOrganizerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resortId: string;
  resortName: string;
  kind: LatestStatusMappingKind;
  items: OrganizerItem[];
  onReorder: (from: number, to: number) => void;
  onSelectItem?: (id: string) => void;
  selectedItemId?: string | null;
  onApplyCrawlerOrder?: (
    geojsonNames: string[],
  ) => Promise<ApplyGeojsonOrderResult>;
  onEditMapping?: () => void;
};

const KIND_LABELS: Record<
  LatestStatusMappingKind,
  { item: string; crawled: string }
> = {
  courses: { item: "コース", crawled: "クローラーが取得したコース" },
  lifts: { item: "リフト", crawled: "クローラーが取得したリフト" },
};

/**
 * 並び替えとクロール結果の突き合わせを、画面いっぱいで行う画面。
 *
 * 左の細いパネルの中では、行を数段ぶん動かすだけでもスクロールが要る。
 * ここでは縦も横も広く取り、「クロール結果の順」と「今の順」を
 * 隣り合わせで見ながら並べ替えられるようにする。
 */
export function OrderOrganizerDialog({
  open,
  onOpenChange,
  resortId,
  resortName,
  kind,
  items,
  onReorder,
  onSelectItem,
  selectedItemId = null,
  onApplyCrawlerOrder,
  onEditMapping,
}: OrderOrganizerDialogProps) {
  const labels = KIND_LABELS[kind];
  const [workspace, setWorkspace] =
    useState<LatestStatusMappingWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isApplyingOrder, setIsApplyingOrder] = useState(false);
  const [orderMessage, setOrderMessage] =
    useState<ApplyGeojsonOrderResult | null>(null);

  const itemNames = useMemo(
    () => items.map(item => item.name.trim()).filter(Boolean),
    [items],
  );
  const itemNamesKey = useMemo(
    () => JSON.stringify([...itemNames].sort()),
    [itemNames],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setWorkspace(
        await loadLatestStatusMapping(resortId, kind, [...new Set(itemNames)]),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "クロール結果を読み込めませんでした。",
      );
    } finally {
      setIsLoading(false);
    }
    // itemNamesKey は itemNames の中身が変わったときだけ読み直すための鍵
  }, [itemNames, kind, resortId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 開いたときと名前の集合が変わったときだけ読み直す
  useEffect(() => {
    if (!open) return;
    void load();
  }, [itemNamesKey, open]);

  const geojsonNameToCrawled = useMemo(() => {
    const result = new Map<string, string>();
    for (const row of workspace?.rows ?? []) {
      if (row.crawledName && row.geojsonName) {
        result.set(row.geojsonName, row.crawledName);
      }
    }
    return result;
  }, [workspace]);

  const crawledNameToGeojson = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const row of workspace?.rows ?? []) {
      if (!row.crawledName || !row.geojsonName) continue;
      result.set(row.crawledName, [
        ...(result.get(row.crawledName) ?? []),
        row.geojsonName,
      ]);
    }
    return result;
  }, [workspace]);

  const crawlerOrderedNames = useMemo(
    () =>
      workspace
        ? buildGeojsonOrderByCrawledItems(
            workspace.crawledItems.map(item => item.name),
            workspace.rows,
            workspace.geojsonNames,
          )
        : [],
    [workspace],
  );

  const sortable = useSortableList({
    ids: items.map(item => item.id),
    onReorder,
  });

  const matchedCount = items.filter(item =>
    geojsonNameToCrawled.has(item.name.trim()),
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[94vw] max-w-[1180px] flex-col gap-3 sm:max-w-[1180px]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {labels.item}の並び替え・クローラー対応
          </DialogTitle>
          <DialogDescription className="text-xs">
            {resortName}：左のクロール結果を見ながら、右の一覧を
            <span className="font-bold">つまんで上下にドラッグ</span>
            して並べ替えます。ここで決めた順番が保存後の GeoJSON
            の順になります。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">
            {labels.item} {items.length} 件
          </Badge>
          <Badge variant="secondary">クロール対応 {matchedCount} 件</Badge>
          {workspace?.latestFile && (
            <span className="truncate text-gray-500">
              {workspace.latestFile}
            </span>
          )}
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            disabled={isLoading}
            onClick={() => void load()}
          >
            <RefreshCw
              className={cn("size-3.5", isLoading && "animate-spin")}
            />
            再読込
          </Button>
          {onEditMapping && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onEditMapping();
              }}
            >
              対応付けを編集
            </Button>
          )}
          {onApplyCrawlerOrder && (
            <Button
              size="sm"
              variant="outline"
              disabled={crawlerOrderedNames.length === 0 || isApplyingOrder}
              title={
                crawlerOrderedNames.length === 0
                  ? "対応済みの取得結果がありません"
                  : undefined
              }
              onClick={async () => {
                if (isApplyingOrder) return;
                setIsApplyingOrder(true);
                setOrderMessage(null);
                try {
                  setOrderMessage(
                    await onApplyCrawlerOrder(crawlerOrderedNames),
                  );
                } catch (applyError) {
                  setOrderMessage({
                    ok: false,
                    message: `並べ替えに失敗しました: ${
                      applyError instanceof Error
                        ? applyError.message
                        : String(applyError)
                    }`,
                  });
                } finally {
                  setIsApplyingOrder(false);
                }
              }}
            >
              <ListOrdered className="size-3.5" />
              {isApplyingOrder ? "並べ替え中…" : "クローラー取得順に並べる"}
            </Button>
          )}
        </div>

        {error && <p className="text-xs text-red-700">{error}</p>}
        {orderMessage && (
          <p
            className={cn(
              "text-xs",
              orderMessage.ok ? "text-green-800" : "text-red-700",
            )}
          >
            {orderMessage.message}
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <section className="flex min-h-0 flex-col rounded-md border bg-gray-50">
            <header className="border-b bg-white px-3 py-2">
              <p className="text-xs font-bold text-gray-700">
                {labels.crawled}
              </p>
              <p className="text-[11px] text-gray-500">
                公式サイトでの掲載順です。この順に合わせると比べやすくなります。
              </p>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {isLoading && !workspace && (
                <div className="flex items-center gap-2 p-3 text-xs text-gray-600">
                  <Spinner /> 読み込み中…
                </div>
              )}
              {workspace?.crawledItems.length === 0 && (
                <p className="p-3 text-xs text-orange-900">
                  取得できた{labels.item}情報がありません。
                </p>
              )}
              <ol className="flex flex-col gap-1">
                {workspace?.crawledItems.map((crawled, index) => {
                  const targets = crawledNameToGeojson.get(crawled.name) ?? [];
                  return (
                    <li
                      key={crawled.name}
                      className={cn(
                        "flex items-start gap-2 rounded-md border bg-white px-2 py-1.5",
                        targets.length === 0 && "border-dashed opacity-70",
                      )}
                    >
                      <span className="w-6 shrink-0 pt-0.5 text-right text-[11px] text-gray-400">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">
                          {crawled.name}
                        </p>
                        <p
                          className={cn(
                            "truncate text-[11px]",
                            targets.length > 0
                              ? "text-green-800"
                              : "text-orange-900",
                          )}
                        >
                          {targets.length > 0
                            ? `→ ${targets.join(" / ")}`
                            : "→ 対応なし"}
                        </p>
                      </div>
                      {crawled.status && (
                        <Badge
                          variant="secondary"
                          className="h-4 shrink-0 px-1 text-[10px]"
                        >
                          {crawled.status}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-md border">
            <header className="border-b bg-white px-3 py-2">
              <p className="text-xs font-bold text-gray-700">
                現在の{labels.item}の順番（ドラッグで並び替え）
              </p>
              <p className="text-[11px] text-gray-500">
                行の左端の⣿をつまんで動かします。キーボードでは⣿を選んで ↑↓
                でも動かせます。
              </p>
            </header>
            <div
              ref={sortable.containerRef}
              className="relative min-h-0 flex-1 overflow-y-auto p-2"
            >
              <ol className="flex flex-col gap-1">
                {items.map((item, index) => {
                  const crawledName = geojsonNameToCrawled.get(
                    item.name.trim(),
                  );
                  const isDragging = sortable.draggingId === item.id;
                  return (
                    <li
                      key={item.id}
                      ref={sortable.itemRef(item.id)}
                      className={cn(
                        "relative flex items-center gap-2 rounded-md border bg-white px-2 py-1.5",
                        item.id === selectedItemId &&
                          "border-blue-400 bg-blue-50",
                        isDragging && "opacity-40",
                        sortable.dropIndex === index &&
                          "before:absolute before:-top-1 before:right-0 before:left-0 before:h-0.5 before:rounded before:bg-blue-500",
                        sortable.dropIndex === items.length &&
                          index === items.length - 1 &&
                          "after:absolute after:right-0 after:-bottom-1 after:left-0 after:h-0.5 after:rounded after:bg-blue-500",
                      )}
                    >
                      <button
                        type="button"
                        aria-label={`${item.name || `${index + 1}番目`}を並び替え`}
                        className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        {...sortable.handleProps(item.id)}
                      >
                        <GripVertical className="size-4" />
                      </button>
                      <span className="w-6 shrink-0 text-right text-[11px] text-gray-400">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => onSelectItem?.(item.id)}
                      >
                        <p className="truncate text-xs font-semibold">
                          {item.name || "（名前未入力）"}
                        </p>
                        <p className="truncate text-[11px] text-gray-500">
                          {crawledName
                            ? `クロール名: ${crawledName}`
                            : "クロール対応なし"}
                          {item.detail ? ` ・ ${item.detail}` : ""}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {items.length === 0 && (
                <p className="p-3 text-xs text-gray-500">
                  並べ替える{labels.item}がありません。
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => onOpenChange(false)}>
            編集に戻る
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
