"use client";

import { cn } from "@/lib/utils";

type Props<TTab extends string> = {
  tabs: readonly TTab[];
  activeTab: TTab;
  onTabChange: (tab: TTab) => void;
  className?: string;
  /** タブが多い場合に均等割りをやめて横スクロールさせる */
  fill?: boolean;
  /** 詳細画面など縦の余白が惜しい場所では高さを詰める（h-9 / md:h-10） */
  compact?: boolean;
  /** 少数のタブをパネル幅に収め、文字サイズもタブ列の幅で決める */
  fit?: boolean;
};

/**
 * 下線で選択状態を示すタブ。
 *
 * base-ui の Tabs は data-active を付けるため、data-[state=active]（Radix 系）を
 * 前提にしたクラスは当たらない。選択状態は見た目の核なので、
 * ここでは素の button と aria-selected で組み立てて取り違えを避ける。
 */
export const UnderlineTabs = <TTab extends string>({
  tabs,
  activeTab,
  onTabChange,
  className,
  fill = true,
  compact = false,
  fit = false,
}: Props<TTab>) => (
  <div
    role="tablist"
    className={cn(
      "scroll-touch flex w-full overflow-x-auto border-b border-gray-200 bg-white",
      fit && "@container/tabs",
      className,
    )}
  >
    {tabs.map(tab => {
      const isActive = tab === activeTab;

      return (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onTabChange(tab)}
          className={cn(
            // スマホでも 6 タブが 1 画面に収まるよう、狭い側は px と文字を詰める
            "relative shrink-0 whitespace-nowrap border-b-2 px-1.5 text-[13px] transition-colors",
            !fit && "md:px-4",
            compact ? "h-9 md:h-10" : "h-11 md:h-12",
            fit ? "@min-[28rem]/tabs:text-base" : "md:text-base",
            fill ? "min-w-0 flex-1" : "min-w-0",
            fill && !fit && "md:min-w-[6rem]",
            isActive
              ? "border-blue-600 font-bold text-blue-600"
              : "border-transparent font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900",
          )}
        >
          {tab}
        </button>
      );
    })}
  </div>
);
