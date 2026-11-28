"use client";

import { Check, List, Map as MapIcon, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const FLOATING_BUTTON_CLASS =
  "pointer-events-auto flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-bold shadow-[0_4px_14px_rgba(15,23,42,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50";

/** 左下に出す「N件を比較 ×」。1件以上選んだときだけ出す */
export const CompareTray = ({
  count,
  onOpen,
  onClear,
}: {
  count: number;
  onOpen: () => void;
  onClear: () => void;
}) => {
  if (count <= 0) return null;
  return (
    <div
      // 件数が変わるたびに付け直して、現れたこと・増えたことに気づけるようにする
      key={count}
      className={cn(
        FLOATING_BUTTON_CLASS,
        "gap-0 overflow-hidden rounded-lg bg-blue-600 text-white motion-safe:animate-[compare-tray-pop_0.4s_ease-out]",
      )}
    >
      <button
        type="button"
        className="h-full pr-2.5 pl-3.5 hover:bg-blue-700"
        onClick={onOpen}
      >
        <span className="tabular-nums">{count}</span>件を比較
      </button>
      <button
        type="button"
        aria-label="比較の選択をクリア"
        className="flex h-full w-9 items-center justify-center border-l border-white/40 hover:bg-blue-700"
        onClick={onClear}
      >
        <X className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
};

/** 右下に出す、スマホの「リスト／地図」切り替え */
export const ViewToggleButton = ({
  view,
  resultCount,
  light = false,
  onChange,
}: {
  view: "info" | "map";
  resultCount: number;
  /** 航空写真の上では白にする */
  light?: boolean;
  onChange: (view: "info" | "map") => void;
}) => (
  <button
    type="button"
    aria-label={view === "map" ? "リストを表示" : "地図を表示"}
    className={cn(
      FLOATING_BUTTON_CLASS,
      "rounded-full px-4",
      light
        ? "bg-white text-gray-950 hover:bg-gray-100"
        : "bg-gray-950 text-white hover:bg-gray-800",
    )}
    onClick={() => onChange(view === "map" ? "info" : "map")}
  >
    {view === "map" ? (
      <>
        <List className="size-4" strokeWidth={2.5} />
        リスト
        <span className="text-xs font-medium tabular-nums opacity-80">
          {resultCount.toLocaleString("ja-JP")}件
        </span>
      </>
    ) : (
      <>
        <MapIcon className="size-4" strokeWidth={2.5} />
        地図
      </>
    )}
  </button>
);

/** 右下に出す、詳細の「＋比較」 */
export const CompareAddButton = ({
  isSelected,
  resortName,
  onToggle,
}: {
  isSelected: boolean;
  resortName: string;
  onToggle: () => void;
}) => (
  <button
    type="button"
    aria-pressed={isSelected}
    aria-label={`${resortName}を${isSelected ? "比較から外す" : "比較に追加"}`}
    className={cn(
      FLOATING_BUTTON_CLASS,
      // 押す前がいちばん目立つ青の塗り。押した後は白抜きにして、左下の「N件を比較」を主役にする
      "rounded-full border-2 border-blue-600 px-5 text-[15px]",
      isSelected
        ? "bg-white text-blue-700 hover:bg-blue-50"
        : "bg-blue-600 text-white hover:bg-blue-700",
    )}
    onClick={onToggle}
  >
    {isSelected ? (
      <Check className="size-4" strokeWidth={3} />
    ) : (
      <Plus className="size-4" strokeWidth={3} />
    )}
    {isSelected ? "比較中" : "比較"}
  </button>
);

/**
 * 画面の下に浮かせる操作の行。左が「N件を比較」、右がその画面の操作
 * （ホームは「リスト／地図」、詳細は「＋比較」）。
 * 高さは一覧・詳細の下の余白（4.5rem）と合わせる。
 */
export const FloatingActions = ({
  left,
  right,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) => (
  <div
    data-floating-actions="true"
    className={cn(
      "pointer-events-none flex items-end justify-between gap-2 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]",
      className,
    )}
  >
    <div className="flex min-w-0">{left}</div>
    <div className="flex min-w-0">{right}</div>
  </div>
);
