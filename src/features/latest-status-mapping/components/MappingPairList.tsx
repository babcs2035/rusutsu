"use client";

import { Equal, RefreshCw, Wand2 } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SortableList } from "@/shared/hooks/useSortableList";
import type { LatestStatusMappingState } from "../hooks/useLatestStatusMapping";

const NO_CRAWLED_NAME = "__none__";

export type MappingPairItem = {
  id: string;
  /** 対応表で使う名前。GeoJSON の name と同じもの */
  name: string;
};

type MappingPairListProps<T extends MappingPairItem> = {
  items: T[];
  sortable: SortableList;
  mapping: LatestStatusMappingState;
  activeItemId: string | null;
  /** 左側の見出し。件数は呼び出し側で入れる */
  leftHeading: string;
  /** 行の 1 段目、左のセル */
  renderLeft: (item: T, index: number, isActive: boolean) => ReactNode;
  /** 行の 2 段目。点の数や操作ボタンなど */
  renderBelow?: (item: T, index: number, isActive: boolean) => ReactNode;
  /** 行の背景を変えたい場合（結合の対象など） */
  rowClassName?: (item: T) => string | undefined;
  emptyMessage: string;
  /** 未対応の名前を押したときに対応させる相手 */
  activeItemName: string | null;
};

/**
 * 編集中の線と、クロール結果を横並びに置く表。
 *
 * 左が地図に描いてある線、右が公式サイトから取ってきた名前。対応が付けば
 * = が緑になり、どの線にも付いていない取得結果は下に「未対応」として残る。
 * 左のセルの中身はコースとリフトで違うので、呼び出し側から差し込む。
 */
export function MappingPairList<T extends MappingPairItem>({
  items,
  sortable,
  mapping,
  activeItemId,
  leftHeading,
  renderLeft,
  renderBelow,
  rowClassName,
  emptyMessage,
  activeItemName,
}: MappingPairListProps<T>) {
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const crawledItems = mapping.workspace?.crawledItems ?? [];
  const hasCrawler = crawledItems.length > 0;

  useEffect(() => {
    if (!activeItemId || sortable.draggingId) return;
    const frame = window.requestAnimationFrame(() => {
      rowRefs.current
        .get(activeItemId)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeItemId, sortable.draggingId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_18px_minmax(0,0.8fr)] items-center gap-1 px-1 text-[10px] font-semibold text-gray-500">
        <span>{leftHeading}</span>
        <span />
        <span>
          {hasCrawler
            ? `クローラー取得結果（${crawledItems.length} 件）`
            : "クローラーなし"}
        </span>
      </div>

      <div
        ref={sortable.containerRef}
        className="relative min-h-[140px] flex-1 overflow-y-auto rounded-md border"
      >
        {items.map((item, index) => {
          const isActive = item.id === activeItemId;
          const crawledName = mapping.crawledNameByGeojsonName.get(
            item.name.trim(),
          );
          const options = [
            ...new Set([
              ...crawledItems.map(crawled => crawled.name),
              ...(crawledName ? [crawledName] : []),
            ]),
          ];
          return (
            <div
              key={item.id}
              ref={element => {
                sortable.itemRef(item.id)(element);
                if (element) rowRefs.current.set(item.id, element);
                else rowRefs.current.delete(item.id);
              }}
              className={cn(
                "relative border-b border-gray-100 px-1 py-1.5 last:border-b-0",
                isActive && "bg-blue-50",
                rowClassName?.(item),
                sortable.draggingId === item.id && "opacity-40",
                sortable.dropIndex === index &&
                  "before:absolute before:top-0 before:right-0 before:left-0 before:h-0.5 before:bg-blue-500",
                sortable.dropIndex === items.length &&
                  index === items.length - 1 &&
                  "after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:bg-blue-500",
              )}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,0.8fr)] items-center gap-1">
                {renderLeft(item, index, isActive)}

                <Equal
                  aria-hidden="true"
                  className={cn(
                    "mx-auto size-3.5",
                    crawledName ? "text-green-700" : "text-gray-300",
                  )}
                />

                {hasCrawler ? (
                  <Select
                    value={crawledName ?? NO_CRAWLED_NAME}
                    onValueChange={value =>
                      mapping.assign(
                        item.name.trim(),
                        value === NO_CRAWLED_NAME ? null : (value ?? null),
                      )
                    }
                  >
                    <SelectTrigger
                      className={cn(
                        "h-8 w-full min-w-0 bg-white text-xs",
                        !crawledName && "border-dashed text-gray-500",
                      )}
                      title={crawledName ?? "未対応"}
                      disabled={item.name.trim() === ""}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CRAWLED_NAME}>未対応</SelectItem>
                      {options.map(name => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="truncate text-[11px] text-gray-400">—</span>
                )}
              </div>

              {renderBelow?.(item, index, isActive)}
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="p-3 text-sm font-semibold text-gray-500">
            {emptyMessage}
          </p>
        )}
      </div>

      {hasCrawler && mapping.unmappedCrawledNames.length > 0 && (
        <div className="shrink-0 rounded-md border border-orange-200 bg-orange-50/60 p-1.5">
          <p className="mb-1 text-[11px] font-bold text-orange-900">
            未対応のクロール結果（{mapping.unmappedCrawledNames.length} 件）
          </p>
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {mapping.unmappedCrawledNames.map(name => (
              <Button
                key={name}
                size="xs"
                variant="outline"
                className="max-w-full bg-white"
                disabled={!activeItemName}
                title={
                  activeItemName
                    ? `「${activeItemName}」に対応させる`
                    : "先に一覧で選んでください"
                }
                onClick={() =>
                  activeItemName && mapping.assign(activeItemName, name)
                }
              >
                <span className="truncate">{name}</span>
              </Button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-orange-900">
            左で選んでから、対応させたい名前を押してください。
          </p>
        </div>
      )}

      {hasCrawler && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            対応 {mapping.crawledNameByGeojsonName.size} / 取得{" "}
            {crawledItems.length}
          </Badge>
          {mapping.saveMessage && (
            <span className="truncate text-[11px] text-green-800">
              {mapping.saveMessage}
            </span>
          )}
          {mapping.error && (
            <span className="min-w-0 flex-1 truncate text-[11px] text-red-700">
              {mapping.error}
            </span>
          )}
          <div className="flex-1" />
          <Button
            size="xs"
            variant="outline"
            title="名前の一致から対応付けをやり直します"
            onClick={mapping.autoAssign}
          >
            <Wand2 className="size-3" />
            自動で対応
          </Button>
          {mapping.isDirty && (
            <Button
              size="xs"
              variant="outline"
              disabled={mapping.isSaving}
              onClick={() => void mapping.save()}
            >
              {mapping.isSaving ? "保存中…" : "対応表を保存"}
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="対応表を再読み込み"
            disabled={mapping.isLoading}
            onClick={mapping.reload}
          >
            <RefreshCw
              className={cn("size-3.5", mapping.isLoading && "animate-spin")}
            />
          </Button>
        </div>
      )}
    </div>
  );
}
