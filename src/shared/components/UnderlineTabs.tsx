"use client";

import { cn } from "@/lib/utils";

type Props<TTab extends string> = {
  tabs: readonly TTab[];
  activeTab: TTab;
  onTabChange: (tab: TTab) => void;
  className?: string;
  /** タブが多い場合に均等割りをやめて横スクロールさせる */
  fill?: boolean;
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
}: Props<TTab>) => (
  <div
    role="tablist"
    className={cn(
      "scroll-touch flex w-full overflow-x-auto border-b border-gray-200 bg-white",
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
            "relative h-11 shrink-0 whitespace-nowrap border-b-2 px-1.5 text-[13px] transition-colors md:h-12 md:px-4 md:text-base",
            fill ? "min-w-0 flex-1 md:min-w-[6rem]" : "min-w-0",
            isActive
              ? "border-blue-600 font-bold text-blue-600"
              : "border-transparent font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900",
          )}
        >
          {tab}
        </button>
      );
    })}
  </div>
);
