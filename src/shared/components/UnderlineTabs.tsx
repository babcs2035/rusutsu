"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
 * 既存 Tabs の操作性を使い，下線で選択状態を示すタブ。
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
  <Tabs
    value={activeTab}
    onValueChange={value => {
      const nextTab = tabs.find(tab => tab === value);
      if (nextTab !== undefined) onTabChange(nextTab);
    }}
    className="w-full min-w-0"
  >
    <TabsList
      variant="line"
      className={cn(
        "scroll-touch flex w-full min-w-0 flex-1 gap-0 overflow-x-auto rounded-none border-b border-gray-200 bg-white p-0",
        fit && "@container/tabs",
        className,
      )}
    >
      {tabs.map(tab => (
        <TabsTrigger
          key={tab}
          value={tab}
          className={cn(
            // スマホでも 6 タブが 1 画面に収まるよう、狭い側は px と文字を詰める
            "relative h-auto shrink-0 whitespace-nowrap rounded-none border-0 border-b-2 border-transparent px-1.5 py-0 text-[13px] transition-colors after:hidden",
            !fit && "md:px-4",
            compact ? "h-9 md:h-10" : "h-11 md:h-12",
            // 6タブを幅320pxでも収めるため、ごく狭い枠では余白と文字を1段詰める
            fit
              ? "@max-[21rem]/tabs:px-0.5 @max-[21rem]/tabs:text-xs @min-[28rem]/tabs:text-sm"
              : "md:text-sm",
            fill ? "min-w-0 flex-1" : "min-w-0 flex-none",
            fill && !fit && "md:min-w-[6rem]",
            "font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 data-active:border-blue-600 data-active:font-bold data-active:text-blue-600",
          )}
        >
          {tab}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);
