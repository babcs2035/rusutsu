"use client";

import { Portal } from "@radix-ui/react-portal";
import { X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { FinalizedMapToolbar } from "@/features/map/components/FinalizedMapToolbar";
import {
  MapCourseStatusControl,
  MapCourseStatusOptions,
} from "@/features/map/components/MapCourseStatusControl";
import type {
  CourseColorMode,
  JapanResortMapProps,
  MapTileVariant,
} from "@/features/map/types";
import {
  DEFAULT_MAP_DISPLAY_SETTINGS,
  hasCourseOperatingData,
} from "@/features/map/utils/mapDisplaySettings";
import { useBreakpointValue } from "@/hooks/use-breakpoint-value";
import { cn } from "@/lib/utils";
import { AnimatedPanel } from "@/shared/components/AnimatedPanel";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { UnderlineTabs } from "@/shared/components/UnderlineTabs";
import type { MapSkiResort } from "@/types/skiResorts";
import { CompareAccessTab } from "./compare/CompareAccessTab";
import { CompareDataTab } from "./compare/CompareDataTab";
import {
  CompareLiftTicketConditionsButton,
  CompareLiftTicketConditionsDialog,
} from "./compare/CompareLiftTicketConditions";
import { CompareLiftTicketTab } from "./compare/CompareLiftTicketTab";
import { CompareOverviewTab } from "./compare/CompareOverviewTab";
import { CompareReviewsTab } from "./compare/CompareReviewsTab";
import type { CompareSlopeSelection } from "./compare/CompareSlopeMapBoard";
import {
  CompareSlopeFeatureDetail,
  CompareSlopeMapBoard,
  CompareSlopeMapTab,
} from "./compare/CompareSlopeMapBoard";
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
  /** ゲレンデ・データで見えているスキー場。地図データを先に取るために知らせる */
  onMapResortsNeeded?: (ids: string[]) => void;
};

const TABS = [
  "概要",
  "ゲレンデ",
  "データ",
  "料金",
  "レビュー",
  "天気",
  "アクセス",
] as const;

type CompareTab = (typeof TABS)[number];

/**
 * スキー場比較。
 *
 * PC・スマホとも同じタブ構成で、1 行目にタブ・タブ固有の操作・件数・閉じるを
 * まとめる（見出しだけの行は作らない）。タブ固有の操作（ゲレンデの色分けや
 * 料金の条件）は、行に収まる幅ではタブの右に、狭いときはタブの下の段に出す。
 * PC では画面全体を使い、ゲレンデで選んだコース・リフトの詳細は
 * スキー場詳細と同じ幅のパネルを右端に重ねて出す。
 */
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
  onMapResortsNeeded,
}: Props) => {
  const [activeTab, setActiveTab] = useState<CompareTab>("概要");
  const isSidePanel = useBreakpointValue({ base: false, md: true }) ?? false;
  const isSheetContentScrollable = canScrollContent ?? isSidePanel;

  // 料金の条件。概要の料金行と料金タブで同じものを使う
  const [liftTicketInput, setLiftTicketInput] = useState(
    initialLiftTicketInput,
  );
  const [isConditionsOpen, setConditionsOpen] = useState(false);

  // ゲレンデの表示設定。比較中のスキー場すべてに同じものを効かせる
  const [courseColorMode, setCourseColorMode] =
    useState<CourseColorMode>("slope");
  const [mapDisplaySettings, setMapDisplaySettings] = useState(
    DEFAULT_MAP_DISPLAY_SETTINGS,
  );
  const [showOpenOnly, setShowOpenOnly] = useState(false);
  const [mapTileVariant, setMapTileVariant] = useState<MapTileVariant>("photo");
  // PC で選んだコース・リフト。詳細は右端に 1 枚だけ出すので比較全体で 1 つ
  const [slopeSelection, setSlopeSelection] =
    useState<CompareSlopeSelection | null>(null);
  useEffect(() => {
    if (activeTab !== "ゲレンデ") setSlopeSelection(null);
  }, [activeTab]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const hasCourses = resorts.some(
    resort => (resort.finalizedMapData?.courses?.features.length ?? 0) > 0,
  );
  const hasLifts = resorts.some(
    resort => (resort.finalizedMapData?.lifts?.features.length ?? 0) > 0,
  );

  // 「営業中のみ」はゲレンデとデータで同じ設定を使う（詳細画面の地図とチャートと同じ）
  const hasOperatingData = resorts.some(resort =>
    hasCourseOperatingData(resort.finalizedMapData ?? null),
  );
  const courseStatusFilter =
    hasOperatingData && showOpenOnly && mapDisplaySettings.showCourses
      ? mapDisplaySettings.courseStatuses
      : null;

  // 地図で埋めるタブは外側でスクロールさせず高さいっぱいに使う
  const isFullHeightTab = activeTab === "アクセス" || activeTab === "ゲレンデ";

  const toolbar: ReactNode = (() => {
    if (isLoading) return null;
    switch (activeTab) {
      case "ゲレンデ":
        return (
          <FinalizedMapToolbar
            presentation={isSidePanel ? "row" : "bar"}
            mode={courseColorMode}
            onModeChange={setCourseColorMode}
            hasCourses={hasCourses}
            hasLifts={hasLifts}
            mapDisplaySettings={mapDisplaySettings}
            onMapDisplaySettingsChange={setMapDisplaySettings}
            showOpenOnly={showOpenOnly}
            onShowOpenOnlyChange={setShowOpenOnly}
            mapTileVariant={mapTileVariant}
            onMapTileVariantChange={setMapTileVariant}
            openOnlyControl={{ enabled: hasOperatingData }}
          />
        );
      case "概要":
      case "料金":
        return (
          <CompareLiftTicketConditionsButton
            input={liftTicketInput}
            onClick={() => setConditionsOpen(true)}
            className="w-full @[80rem]/compare-header:w-auto @[80rem]/compare-header:max-w-md"
          />
        );
      default:
        return null;
    }
  })();

  const renderTabContent = () => {
    if (isLoading) {
      return (
        <div className="flex h-full min-h-64 items-center justify-center">
          <LoadingSpinner text="比較データを読み込み中..." />
        </div>
      );
    }

    switch (activeTab) {
      case "概要":
        return (
          <CompareOverviewTab
            resorts={resorts}
            onSelectResort={onSelectResort}
            liftTicketInput={liftTicketInput}
          />
        );
      case "ゲレンデ":
        return isSidePanel ? (
          <CompareSlopeMapBoard
            resorts={resorts}
            DynamicMap={DynamicMap}
            mapResorts={mapResorts}
            courseColorMode={courseColorMode}
            onCourseColorModeChange={setCourseColorMode}
            mapDisplaySettings={mapDisplaySettings}
            onMapDisplaySettingsChange={setMapDisplaySettings}
            showOpenOnly={showOpenOnly}
            onShowOpenOnlyChange={setShowOpenOnly}
            mapTileVariant={mapTileVariant}
            onMapTileVariantChange={setMapTileVariant}
            selection={slopeSelection}
            onSelectionChange={setSlopeSelection}
            onMapResortsNeeded={onMapResortsNeeded}
            className="h-full px-6 pt-4 pb-10"
          />
        ) : (
          <CompareSlopeMapTab
            resorts={resorts}
            DynamicMap={DynamicMap}
            mapResorts={mapResorts}
            onMapResortsNeeded={onMapResortsNeeded}
            courseColorMode={courseColorMode}
            onCourseColorModeChange={setCourseColorMode}
            mapDisplaySettings={mapDisplaySettings}
            onMapDisplaySettingsChange={setMapDisplaySettings}
            showOpenOnly={showOpenOnly}
            onShowOpenOnlyChange={setShowOpenOnly}
            mapTileVariant={mapTileVariant}
            onMapTileVariantChange={setMapTileVariant}
          />
        );
      case "データ":
        return (
          <CompareDataTab
            resorts={resorts}
            statusFilter={courseStatusFilter}
            // 詳細のコースタブと同じ「営業中のみ」と、絞り込み中の ○△ の選択
            courseStatusControl={
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <MapCourseStatusControl
                  inline
                  bare
                  enabled={hasOperatingData}
                  checked={showOpenOnly}
                  settings={mapDisplaySettings}
                  onCheckedChange={setShowOpenOnly}
                  onSettingsChange={setMapDisplaySettings}
                />
                {courseStatusFilter && (
                  <MapCourseStatusOptions
                    className="w-auto justify-start gap-2"
                    settings={mapDisplaySettings}
                    onChange={setMapDisplaySettings}
                  />
                )}
              </div>
            }
            onMapResortsNeeded={onMapResortsNeeded}
          />
        );
      case "料金":
        return (
          <CompareLiftTicketTab resorts={resorts} input={liftTicketInput} />
        );
      case "レビュー":
        return <CompareReviewsTab resorts={resorts} />;
      case "天気":
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

  const selectedSlopeResort = slopeSelection
    ? (resorts.find(resort => resort.id === slopeSelection.resortId) ?? null)
    : null;

  const comparePanelContent = (
    // タブ行は固定し、タブの中身だけスクロールさせる
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="@container/compare-header shrink-0 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 pr-2 pl-1.5 md:gap-3 md:pr-3 md:pl-2">
          <UnderlineTabs
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            className="min-w-0 flex-1 border-b-0 md:w-auto md:flex-none"
            compact
            fill={false}
          />
          {toolbar && (
            <div className="hidden min-w-0 flex-1 items-center justify-end @[80rem]/compare-header:flex">
              {toolbar}
            </div>
          )}
          <span className="ml-auto hidden shrink-0 text-xs tabular-nums text-gray-500 md:block">
            {resorts.length}件
          </span>
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex h-7 w-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 p-0 text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10 md:h-8 md:w-8 md:min-w-8"
            aria-label="比較画面を閉じる"
          >
            <X size={18} strokeWidth={2.5} />
          </Button>
        </div>
        {toolbar && (
          <div className="flex items-center border-t border-gray-100 px-2 py-1.5 @[80rem]/compare-header:hidden md:px-3">
            {toolbar}
          </div>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            "min-h-0 flex-1",
            isFullHeightTab
              ? cn(
                  "overflow-hidden",
                  isSidePanel ? (activeTab === "ゲレンデ" ? "" : "p-4") : "p-2",
                )
              : cn(
                  "p-2 md:p-3",
                  isSheetContentScrollable
                    ? "overflow-y-auto"
                    : "overflow-y-hidden",
                ),
          )}
        >
          {renderTabContent()}
        </div>

        {isSidePanel && slopeSelection && selectedSlopeResort && (
          <div className="absolute inset-y-0 right-0 z-20 flex w-[var(--desktop-detail-panel-width)] flex-col overflow-hidden border-l border-gray-200 bg-white shadow-xl">
            <CompareSlopeFeatureDetail
              resort={selectedSlopeResort}
              selection={slopeSelection}
              onSelectionChange={setSlopeSelection}
            />
          </div>
        )}
      </div>

      <CompareLiftTicketConditionsDialog
        open={isConditionsOpen}
        onOpenChange={setConditionsOpen}
        value={liftTicketInput}
        onChange={setLiftTicketInput}
      />
    </div>
  );

  if (presentation === "inline") {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white">
        {comparePanelContent}
      </div>
    );
  }

  // モバイルの比較表示は presentation="inline"（MobileResultsSheet）で描画されるため、
  // この sheet 表示はデスクトップだけ。背景の地図は壊さず、その上に画面全体で重ねる
  return (
    isSidePanel && (
      <Portal>
        <div className="fixed inset-0 z-[100] hidden md:block">
          <AnimatedPanel
            data-ski-resort-compare-panel="true"
            visible={isSidePanel}
            animation="fade"
            rootClassName="h-full"
            contentClassName="flex h-full w-full flex-col overflow-hidden bg-white"
          >
            {comparePanelContent}
          </AnimatedPanel>
        </div>
      </Portal>
    )
  );
};
