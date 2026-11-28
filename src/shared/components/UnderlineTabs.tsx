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
  /** 少数のタブをパネル幅に収めるため，左右の余白を詰める． */
  fit?: boolean;
  /**
   * タブ行を最も近いスクロール容器の上部に固定する．
   * sticky は TabsList ではなく Tabs ルート（スクロール容器の直接の子）に
   * 付与する必要がある：sticky 要素は親要素の枠内しか動けず，TabsList の親
   * （Tabs ルート）はタブ行と同じ高さしかないため，TabsList 側に付与すると
   * 固定されずスクロールで流れ去ってしまう．
   */
  sticky?: boolean;
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
  sticky = false,
}: Props<TTab>) => (
  <Tabs
    value={activeTab}
    onValueChange={value => {
      const nextTab = tabs.find(tab => tab === value);
      if (nextTab !== undefined) onTabChange(nextTab);
    }}
    className={cn(
      "w-full min-w-0",
      // sticky の付与位置の理由は Props の sticky 項目のコメントを参照
      sticky && "sticky top-0 z-20 will-change-transform",
    )}
  >
    <TabsList
      variant="line"
      className={cn(
        // 中央揃えのまま溢れると列の先頭がスクロール可能範囲の外に出る．
        "scroll-touch flex w-full min-w-0 flex-1 justify-start gap-0 overflow-x-auto rounded-none border-b border-border bg-background p-0",
        fit && "@container/tabs",
        className,
      )}
    >
      {tabs.map(tab => (
        <TabsTrigger
          key={tab}
          value={tab}
          className={cn(
            "relative h-auto shrink-0 whitespace-nowrap rounded-none border-0 border-b-2 border-transparent px-1.5 py-0 text-xs transition-colors after:hidden",
            !fit && "md:px-4",
            compact ? "h-9 md:h-10" : "h-11 md:h-12",
            fit && "@max-[21rem]/tabs:px-0.5",
            fill ? "min-w-0 flex-1" : "min-w-0 flex-none",
            fill && !fit && "md:min-w-[6rem]",
            "font-medium text-muted-foreground hover:bg-muted hover:text-foreground data-active:border-primary data-active:font-semibold data-active:text-primary",
          )}
        >
          {tab}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);
