"use client";

import { Portal } from "@radix-ui/react-portal";
import { X } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import type { JapanResortMapProps } from "@/features/map/types";
import { useBreakpointValue } from "@/hooks/use-breakpoint-value";
import { cn } from "@/lib/utils";
import { AnimatedPanel } from "@/shared/components/AnimatedPanel";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { UnderlineTabs } from "@/shared/components/UnderlineTabs";
import type { MapSkiResort } from "@/types/skiResorts";
import { CompareAccessTab } from "./compare/CompareAccessTab";
import { CompareLiftTicketTab } from "./compare/CompareLiftTicketTab";
import { CompareOverviewTab } from "./compare/CompareOverviewTab";
import { CompareReviewsTab } from "./compare/CompareReviewsTab";
import { CompareSlopeMapTab } from "./compare/CompareSlopeMapBoard";
import { CompareWeatherTab } from "./compare/CompareWeatherTab";
import type { Resort } from "./compare/types";

type Props = {
  resorts: Resort[];
  isLoading: boolean;
  onClose: () => void;
  presentation?: "sheet" | "inline";
  canScrollContent?: boolean;
  initialLiftTicketInput: LiftTicketSearchInput;
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  onSelectResort: (id: string) => void;
  /**
   * ゲレンデタブをこのパネルに出すか。
   * デスクトップではゲレンデを左側の地図エリアに出すので false。
   */
  showSlopeTab?: boolean;
};

const TABS = [
  "概要",
  "ゲレンデ",
  "料金",
  "レビュー",
  "天候",
  "アクセス",
] as const;
const TABS_WITHOUT_SLOPE = TABS.filter(tab => tab !== "ゲレンデ");

type CompareTab = (typeof TABS)[number];

export const SkiResortCompareView = ({
  resorts,
  isLoading,
  onClose,
  presentation = "sheet",
  canScrollContent,
  initialLiftTicketInput,
  DynamicMap,
  mapResorts,
  onSelectResort,
  showSlopeTab = true,
}: Props) => {
  const [activeTab, setActiveTab] = useState<CompareTab>("概要");
  const isSidePanel = useBreakpointValue({ base: false, md: true }) ?? false;
  const isSheetContentScrollable = canScrollContent ?? isSidePanel;
  const tabs: readonly CompareTab[] = showSlopeTab ? TABS : TABS_WITHOUT_SLOPE;
  const currentTab = tabs.includes(activeTab) ? activeTab : "概要";

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  // ゲレンデタブのスマホ表示は 1 画面 1 枚のカルーセルなので、
  // 外側でスクロールさせず高さいっぱいに使う
  // 地図で埋めるタブは、外側でスクロールさせず高さいっぱいに使う
  const isFullHeightTab =
    currentTab === "アクセス" || (currentTab === "ゲレンデ" && !isSidePanel);

  const renderTabContent = () => {
    if (isLoading) {
      return (
        <div className="flex min-h-64 items-center justify-center">
          <LoadingSpinner text="比較データを読み込み中..." />
        </div>
      );
    }

    switch (currentTab) {
      case "概要":
        return (
          <CompareOverviewTab
            resorts={resorts}
            onSelectResort={onSelectResort}
          />
        );
      case "ゲレンデ":
        return (
          <CompareSlopeMapTab
            resorts={resorts}
            DynamicMap={DynamicMap}
            mapResorts={mapResorts}
          />
        );
      case "料金":
        return (
          <CompareLiftTicketTab
            resorts={resorts}
            initialInput={initialLiftTicketInput}
          />
        );
      case "レビュー":
        return <CompareReviewsTab resorts={resorts} />;
      case "天候":
        return (
          <CompareWeatherTab resorts={resorts} isSidePanel={isSidePanel} />
        );
      case "アクセス":
        return (
          <CompareAccessTab
            resorts={resorts}
            DynamicMap={DynamicMap}
            mapResorts={mapResorts}
            onSelectResort={onSelectResort}
          />
        );
      default:
        return null;
    }
  };

  const comparePanelContent = (
    // ヘッダーとタブバーは固定し，タブの中身のみスクロールさせる
    // （全体スクロールだとタブバーが画面外に出てタブ切替しにくくなる）
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 pt-2.5 pb-2 md:px-6 md:pt-4 md:pb-3">
        <h2 className="text-base font-bold text-gray-900 font-[var(--font-heading)] md:text-xl">
          比較 {resorts.length}件
        </h2>
        <Button
          variant="ghost"
          onClick={onClose}
          className="flex h-9 w-9 min-w-9 items-center justify-center rounded-full border border-gray-200 p-0 text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10 md:h-10 md:w-10 md:min-w-10"
          aria-label="比較画面を閉じる"
        >
          <X size={18} strokeWidth={2.5} />
        </Button>
      </div>

      <UnderlineTabs
        tabs={tabs}
        activeTab={currentTab}
        onTabChange={setActiveTab}
        className="shrink-0"
      />

      <div
        className={cn(
          "min-h-0 flex-1",
          isFullHeightTab
            ? "overflow-hidden p-2"
            : cn(
                "p-3 md:p-6",
                isSheetContentScrollable
                  ? "overflow-y-auto"
                  : "overflow-y-hidden",
              ),
        )}
      >
        {renderTabContent()}
      </div>
    </div>
  );

  if (presentation === "inline") {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white">
        {comparePanelContent}
      </div>
    );
  }

  // モバイルの比較表示は presentation="inline"（MobileResultsSheet）で描画されるため，
  // このコンポーネントの sheet 表示はデスクトップ側パネルのみ．
  // 詳細画面と同じく右side パネルにして，左の地図はそのまま動かせるようにする．
  return (
    isSidePanel && (
      <Portal>
        <div className="fixed inset-0 z-[100] hidden md:flex md:justify-end pointer-events-none">
          <AnimatedPanel
            data-ski-resort-compare-panel="true"
            visible={isSidePanel}
            contentClassName="relative z-10 flex h-full max-h-none w-[var(--compare-panel-width)] max-w-none flex-col overflow-hidden bg-white border border-gray-200 shadow-2xl pointer-events-auto"
          >
            {comparePanelContent}
          </AnimatedPanel>
        </div>
      </Portal>
    )
  );
};
