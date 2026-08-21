"use client";

import { Portal } from "@radix-ui/react-portal";
import { Maximize2, X } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  ElevationProfileMapPoint,
  JapanResortMapProps,
  SelectedMapFeature,
} from "@/features/map/types";
import { useBreakpointValue } from "@/hooks/use-breakpoint-value";
import { AnimatedPanel } from "@/shared/components/AnimatedPanel";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type {
  MapSkiResort,
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";
import { DetailTabs } from "./components/DetailTabs";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import {
  CoursesTab,
  ImageCarousel,
  InfoSection,
  LiftsTab,
  OverviewTab,
  TicketsTab,
  WeatherTab,
} from "./tabs/DetailTabContent";

type Props = {
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  resortData: NullableSkiResortDetail | null;
  isLoading: boolean;
  isCompareSelected: boolean;
  onToggleCompare: (id: string, selected: boolean) => void;
  selectedFinalizedFeature: SelectedMapFeature | null;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
  onClose: () => void;
  mobileContentTab?: "info" | "map";
  mobilePresentation?: "overlay" | "inline";
  hideMobileInfoSection?: boolean;
};

const TABS = ["概要", "コース", "リフト", "チケット", "気候"];
type DetailMapMode = "finalized" | "location";

const MobileResortMapPreview = ({
  DynamicMap,
  resort,
  mapResorts,
  selectedFinalizedFeature,
  selectedElevationProfilePoint,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
}: {
  DynamicMap: ComponentType<JapanResortMapProps>;
  resort: SkiResortDetail;
  mapResorts: MapSkiResort[];
  selectedFinalizedFeature: SelectedMapFeature | null;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
}) => {
  const hasFinalizedMap =
    (resort.finalizedMapData?.courses?.features.length ?? 0) > 0 ||
    (resort.finalizedMapData?.lifts?.features.length ?? 0) > 0;
  const [mapMode, setMapMode] = useState<DetailMapMode>(
    hasFinalizedMap ? "finalized" : "location",
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedResortIdSet = useMemo(() => new Set([resort.id]), [resort.id]);
  const emptyCompareIdSet = useMemo(() => new Set<string>(), []);

  useEffect(() => {
    setMapMode(hasFinalizedMap ? "finalized" : "location");
  }, [hasFinalizedMap]);

  const modeOptions = hasFinalizedMap
    ? ([
        { value: "finalized", label: "コースマップ" },
        { value: "location", label: "周辺位置" },
      ] as const)
    : ([{ value: "location", label: "周辺位置" }] as const);
  const mapFinalizedData =
    mapMode === "finalized" ? (resort.finalizedMapData ?? null) : null;
  const detailViewportMode = mapMode === "finalized" ? "finalized" : "resort";

  const renderMap = (presentation: "preview" | "expanded") => (
    <DynamicMap
      resorts={mapResorts}
      filteredResortIdSet={selectedResortIdSet}
      isFilterActive={false}
      selectedResortId={resort.id}
      selectedCompareIdSet={emptyCompareIdSet}
      interactionMode="detail"
      finalizedMapData={mapFinalizedData}
      mapPresentation={presentation}
      detailViewportMode={detailViewportMode}
      selectedFinalizedFeature={selectedFinalizedFeature}
      selectedElevationProfilePoint={selectedElevationProfilePoint}
      selectedViewportBottomPaddingRatio={0}
      mapControlBottomPaddingRatio={0}
      onBoundsChange={() => undefined}
      onSelectResort={() => undefined}
      onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
      onSelectedElevationProfilePointChange={
        onSelectedElevationProfilePointChange
      }
    />
  );

  const modeTabs = (
    <div className="flex gap-1 rounded-lg bg-gray-100 p-1 border border-gray-200 shadow-sm">
      {modeOptions.map(option => {
        const isActive = mapMode === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant={isActive ? "default" : "outline"}
            className="h-7 min-w-0 px-3 rounded-md text-xs font-medium transition-colors"
            onClick={() => setMapMode(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="relative h-[210px] w-full shrink-0 overflow-hidden border-y border-gray-200 bg-gray-100">
        {renderMap("preview")}
        <div className="absolute top-2 left-2 right-2 z-30 flex items-start justify-between gap-2 pointer-events-none">
          <div className="pointer-events-auto">{modeTabs}</div>
          <Button
            type="button"
            aria-label="地図を拡大"
            onClick={() => setIsExpanded(true)}
            className="h-8 w-8 min-w-8 p-0 rounded-md bg-white text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50 hover:text-gray-900 pointer-events-auto focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
          >
            <Maximize2 size={15} strokeWidth={2.5} />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <Portal>
          <div className="fixed inset-0 z-[300] bg-white">
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] pb-2 bg-white/94 border-b border-gray-100 backdrop-blur-md">
              <div className="min-w-0">
                <p className="text-gray-900 text-base font-bold leading-tight overflow-hidden text-ellipsis whitespace-nowrap font-[var(--font-heading)]">
                  {resort.nameJa}
                </p>
                <p className="mt-0.5 text-blue-600 text-xs font-semibold leading-none">
                  {mapMode === "finalized" ? "コースマップ" : "周辺位置"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {modeTabs}
                <Button
                  type="button"
                  aria-label="地図を閉じる"
                  onClick={() => setIsExpanded(false)}
                  className="h-8 w-8 min-w-8 p-0 rounded-full bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
                >
                  <X size={15} strokeWidth={2.5} />
                </Button>
              </div>
            </div>
            <div
              className="h-full w-full"
              style={{
                paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.75rem)",
              }}
            >
              {renderMap("expanded")}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
};

/**
 * スキー場の詳細情報を表示するレスポンシブ対応モーダル
 */
export const SkiResortDetailView = ({
  DynamicMap,
  mapResorts,
  resortData,
  isLoading,
  isCompareSelected,
  onToggleCompare,
  selectedFinalizedFeature,
  selectedElevationProfilePoint,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
  onClose,
  mobileContentTab = "info",
  mobilePresentation = "overlay",
  hideMobileInfoSection = false,
}: Props) => {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const isSidePanel = useBreakpointValue({ base: false, md: true }) ?? false;

  useEffect(() => {
    if (selectedFinalizedFeature?.kind === "course") {
      setActiveTab("コース");
    }
    if (selectedFinalizedFeature?.kind === "lift") {
      setActiveTab("リフト");
    }
  }, [selectedFinalizedFeature]);

  useBodyScrollLock();
  const shouldRenderMobilePanel = isSidePanel || mobileContentTab === "info";
  // inline: 親（モバイル詳細シート）内に相対配置 / overlay: 画面下部に固定配置
  const mobilePanelPositionClasses =
    mobilePresentation === "inline"
      ? "relative h-full"
      : "fixed left-0 right-0 bottom-0 top-[calc(env(safe-area-inset-top,0px)+6.75rem)]";

  if (isLoading || !resortData) {
    return (
      <>
        {isSidePanel && (
          <Portal>
            <div className="fixed inset-0 z-[60] hidden md:flex md:justify-end pointer-events-none">
              <div
                className="absolute inset-0 bg-transparent pointer-events-none"
                aria-hidden="true"
              />
              <AnimatedPanel
                data-ski-resort-detail-panel="true"
                visible={isSidePanel}
                contentClassName="relative z-10 flex h-full max-h-none w-[min(720px,70vw)] max-w-none flex-col items-center justify-center overflow-hidden bg-white border border-gray-200 pointer-events-auto shadow-2xl"
              >
                <LoadingSpinner text="読み込み中..." />
              </AnimatedPanel>
            </div>
          </Portal>
        )}
        {!isSidePanel && shouldRenderMobilePanel && (
          <div
            data-ski-resort-detail-panel="true"
            className={`z-[300] flex items-center justify-center bg-white ${mobilePanelPositionClasses}`}
          >
            <LoadingSpinner text="読み込み中..." />
          </div>
        )}
      </>
    );
  }

  const resort = resortData;
  const images = [
    ...(resort.outlineImages || []),
    ...(resort.courseImages || []),
  ];
  const resortInfo = {
    id: resort.id,
    nameJa: resort.nameJa,
    nameRuby: resort.nameRuby,
    formerNames: resort.formerNames,
    prefecture: resort.prefecture,
    town: resort.town,
    descriptionShort: resort.descriptionShort,
    yukiMagi: resort.yukiMagi,
  };
  const mobileDetailHeader = (
    <>
      {!hideMobileInfoSection && (
        <InfoSection
          resort={resortInfo}
          finalizedOperationSummary={resort.finalizedOperationSummary}
          isCompareSelected={isCompareSelected}
          onToggleCompare={onToggleCompare}
          onClose={onClose}
        />
      )}
      <MobileResortMapPreview
        DynamicMap={DynamicMap}
        resort={resort}
        mapResorts={mapResorts}
        selectedFinalizedFeature={selectedFinalizedFeature}
        selectedElevationProfilePoint={selectedElevationProfilePoint}
        onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
        onSelectedElevationProfilePointChange={
          onSelectedElevationProfilePointChange
        }
      />
    </>
  );
  const desktopDetailHeader = (
    <>
      <InfoSection
        resort={resortInfo}
        finalizedOperationSummary={resort.finalizedOperationSummary}
        isCompareSelected={isCompareSelected}
        onToggleCompare={onToggleCompare}
        onClose={onClose}
      />
      <ImageCarousel images={images} alt={resort.nameJa} />
    </>
  );
  const detailPanelContent = (
    <>
      <div className="flex-1 overflow-y-auto">
        {isSidePanel ? desktopDetailHeader : mobileDetailHeader}
        <DetailTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="p-4 md:p-8 text-gray-700">
          {activeTab === "概要" && <OverviewTab resort={resort} />}
          {activeTab === "コース" && (
            <CoursesTab
              resort={resort}
              finalizedMapData={resortData?.finalizedMapData ?? null}
              selectedFinalizedFeature={selectedFinalizedFeature}
              selectedElevationProfilePoint={selectedElevationProfilePoint}
              onSelectedFinalizedFeatureChange={
                onSelectedFinalizedFeatureChange
              }
              onSelectedElevationProfilePointChange={
                onSelectedElevationProfilePointChange
              }
            />
          )}
          {activeTab === "リフト" && (
            <LiftsTab
              resort={resort}
              finalizedMapData={resortData?.finalizedMapData ?? null}
              selectedFinalizedFeature={selectedFinalizedFeature}
              onSelectedFinalizedFeatureChange={
                onSelectedFinalizedFeatureChange
              }
            />
          )}
          {activeTab === "チケット" && <TicketsTab resort={resort} />}
          {activeTab === "気候" && <WeatherTab resort={resort} />}
        </div>
      </div>
    </>
  );

  return (
    <>
      {isSidePanel && (
        <Portal>
          <div className="fixed inset-0 z-[60] hidden md:flex md:justify-end pointer-events-none">
            <div
              className="absolute inset-0 bg-transparent pointer-events-none"
              aria-hidden="true"
            />
            <AnimatedPanel
              data-ski-resort-detail-panel="true"
              visible={isSidePanel}
              contentClassName="relative z-10 flex h-full max-h-none w-[min(720px,70vw)] max-w-none flex-col overflow-hidden bg-white border border-gray-200 pointer-events-auto shadow-2xl"
            >
              {detailPanelContent}
            </AnimatedPanel>
          </div>
        </Portal>
      )}
      {!isSidePanel && shouldRenderMobilePanel && (
        <div
          data-ski-resort-detail-panel="true"
          className={`z-[300] flex h-full flex-col overflow-hidden bg-white border-t border-gray-200 ${mobilePanelPositionClasses}`}
        >
          <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
            {detailPanelContent}
          </div>
        </div>
      )}
    </>
  );
};
