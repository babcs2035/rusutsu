"use client";

import { Circle, Triangle, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { chipClass } from "@/shared/components/FormParts";
import {
  type CorrectionFeature,
  editedValue,
  hasSegments,
  isEdited,
  type Mark,
  type PropEdits,
  toMark,
} from "../model";

export type BulkField = "piste" | "morning" | "night";

const LEGEND: Record<BulkField, Array<{ mark: Mark; text: string }>> = {
  piste: [
    { mark: "○", text: "圧雪" },
    { mark: "△", text: "日によって圧雪" },
    { mark: "×", text: "非圧雪" },
  ],
  morning: [
    { mark: "○", text: "営業あり" },
    { mark: "×", text: "営業なし" },
  ],
  night: [
    { mark: "○", text: "営業あり" },
    { mark: "×", text: "営業なし" },
  ],
};
const KIND_LABEL = { slope: "コース", lift: "リフト" } as const;
// 文字の ○× は書体によって小さく潰れるので、ほかの画面と同じ線の記号で描く
const MARK_ICON = { "○": Circle, "△": Triangle, "×": X } as const;
function MarkIcon({ mark, className }: { mark: Mark; className?: string }) {
  if (!mark) return <>不明</>;
  const Icon = MARK_ICON[mark];
  return (
    <Icon
      role="img"
      aria-label={mark}
      className={cn("size-3.5", className)}
      strokeWidth={3}
    />
  );
}

/**
 * 圧雪・早朝営業・ナイター営業を、コース・リフトの一覧でまとめて直す。
 * 行ごとに記号を選ぶ。上の「すべて」で全部の行を同じ値にできる。
 */
export function BulkScreen({
  field,
  features,
  edits,
  onEdit,
  onSelect,
  onEditAll,
  onReset,
  focusId,
  onAddPosition,
}: {
  field: BulkField;
  features: CorrectionFeature[];
  edits: PropEdits;
  onEdit: (feature: CorrectionFeature, field: string, value: unknown) => void;
  onSelect: (feature: CorrectionFeature) => void;
  onEditAll: (list: CorrectionFeature[], field: string, value: Mark) => void;
  onReset: (feature: CorrectionFeature, field: string) => void;
  /** 選択中の線。地図から選んだときはその行を見える位置に出す */
  focusId: string | null;
  onAddPosition: () => void;
}) {
  // 圧雪はコースだけ。早朝・ナイターはリフトにもある
  const list = features.filter(
    feature => field !== "piste" || feature.kind === "slope",
  );
  const marks = [...LEGEND[field].map(item => item.mark), null];
  const focusRow = useRef<HTMLLIElement | null>(null);
  const selectedFromList = useRef<string | null>(null);
  useEffect(() => {
    if (selectedFromList.current === focusId) {
      selectedFromList.current = null;
      return;
    }
    focusRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusId]);

  if (list.length === 0)
    return (
      <div className="space-y-3 p-3 md:p-4">
        <p className="text-sm text-gray-600">
          コースがまだ登録されていません。先にコースの位置を追加してください。
        </p>
        <Button variant="outline" className="w-full" onClick={onAddPosition}>
          コースの位置を追加
        </Button>
      </div>
    );

  return (
    <div>
      {/* 記号の意味と「すべて」は、一覧をスクロールしても上に残す */}
      <div className="sticky top-0 z-10 space-y-1.5 border-b border-gray-200 bg-white px-3 py-2 md:px-4">
        <p className="flex flex-wrap gap-x-3 text-xs text-gray-600">
          {LEGEND[field].map(item => (
            <span
              key={item.text}
              className="inline-flex items-center gap-1 whitespace-nowrap"
            >
              <MarkIcon mark={item.mark} className="size-3 text-gray-900" />
              {item.text}
            </span>
          ))}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="mr-auto text-xs font-semibold text-gray-700">
            すべてを
          </span>
          {LEGEND[field].map(item => (
            <Button
              type="button"
              key={item.text}
              variant="outline"
              className="h-7 px-2 text-xs font-semibold whitespace-nowrap"
              onClick={() => onEditAll(list, field, item.mark)}
            >
              <MarkIcon mark={item.mark} className="size-3" />
              にする
            </Button>
          ))}
        </div>
      </div>
      {(["slope", "lift"] as const).map(kind => {
        const rows = list.filter(feature => feature.kind === kind);
        if (rows.length === 0) return null;
        return (
          <section key={kind} aria-label={KIND_LABEL[kind]}>
            {field !== "piste" && (
              <h3 className="bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-500 md:px-4">
                {KIND_LABEL[kind]}
              </h3>
            )}
            <ul className="divide-y divide-gray-100">
              {rows.map(feature => {
                const edited = isEdited(edits, feature.id, field);
                const segmented =
                  kind === "slope" && hasSegments(feature, field);
                const value = editedValue(edits, feature, field);
                const current = toMark(feature.properties[field], field);
                return (
                  <li
                    key={feature.id}
                    ref={feature.id === focusId ? focusRow : undefined}
                    className={cn(
                      "flex min-h-10 items-center gap-2 px-3 py-1 md:px-4",
                      edited && "bg-amber-50",
                      feature.id === focusId &&
                        "outline-2 -outline-offset-2 outline-blue-500",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        aria-pressed={feature.id === focusId}
                        className="block w-full text-left text-sm leading-tight font-semibold break-words text-gray-900 focus-visible:outline-2 focus-visible:outline-blue-500"
                        onClick={() => {
                          selectedFromList.current =
                            feature.id === focusId ? null : feature.id;
                          onSelect(feature);
                        }}
                      >
                        {feature.name}
                      </button>
                      {(edited || segmented) && (
                        <p className="text-[11px] leading-tight text-gray-500">
                          {edited ? "現在の登録: " : ""}
                          {segmented ? (
                            "区間別"
                          ) : (
                            <MarkIcon
                              mark={current}
                              className="inline size-3 align-[-1px]"
                            />
                          )}
                          {edited && segmented && (
                            <button
                              type="button"
                              className="ml-1.5 text-blue-700 underline underline-offset-2"
                              onClick={() => {
                                selectedFromList.current =
                                  feature.id === focusId ? null : feature.id;
                                onSelect(feature);
                                onReset(feature, field);
                              }}
                            >
                              戻す
                            </button>
                          )}
                        </p>
                      )}
                    </div>
                    <fieldset className="flex shrink-0 gap-1">
                      <legend className="sr-only">{feature.name}</legend>
                      {marks.map(mark => {
                        const selected =
                          (edited || !segmented) && value === mark;
                        return (
                          <Button
                            type="button"
                            key={mark ?? "unknown"}
                            variant="outline"
                            aria-pressed={selected}
                            className={cn(
                              chipClass(selected),
                              "h-8 px-0",
                              mark ? "w-8 text-sm font-bold" : "w-10",
                            )}
                            onClick={() => {
                              selectedFromList.current =
                                feature.id === focusId ? null : feature.id;
                              onSelect(feature);
                              onEdit(feature, field, mark);
                            }}
                          >
                            <MarkIcon mark={mark} />
                          </Button>
                        );
                      })}
                    </fieldset>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
