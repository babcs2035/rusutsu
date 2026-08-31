"use client";

import { Portal } from "@radix-ui/react-portal";
import type { ComponentType } from "react";
import { useCallback, useEffect, useState } from "react";
import type {
  ElevationProfileMapPoint,
  JapanResortMapProps,
  SelectedMapFeature,
} from "@/features/map/types";
import { useBreakpointValue } from "@/hooks/use-breakpoint-value";
import { getResortSearchName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import { AnimatedPanel } from "@/shared/components/AnimatedPanel";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type { MapSkiResort, NullableSkiResortDetail } from "@/types/skiResorts";
import { DetailTabs } from "./components/DetailTabs";
import { FinalizedFeatureDetail } from "./components/FinalizedFeatureDetail";
import { ResortMapSection } from "./components/ResortMapSection";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import {
  CoursesTab,
  InfoSection,
  LiftsTab,
  OverviewTab,
  TicketsTab,
  WeatherTab,
} from "./tabs/DetailTabContent";
import { createFinalizedCourseGroups } from "./utils/detailMetrics";

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
  /**
   * デスクトップで左の地図を全画面にしているか。
   * そのときは説明パネルを畳んで地図を見せ、コースを選んだときだけ
   * 右側に小さく重ねて出す。
   */
  isDesktopMapExpanded?: boolean;
};

const TABS = ["概要", "コース", "リフト", "チケット", "気候"];

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
  isDesktopMapExpanded = false,
}: Props) => {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const isSidePanel = useBreakpointValue({ base: false, md: true }) ?? false;
  // 選択を解除したときの戻り先を決めるために、どこから選んだかを覚えておく。
  // 一覧から選んだときは元の一覧と初期表示の地図へ、
  // 地図から選んだときは今の地図の見え方のまま戻す。
  const [selectionOrigin, setSelectionOrigin] = useState<"map" | "list">("map");
  const [detailViewportResetKey, setDetailViewportResetKey] = useState(0);

  const selectFeatureFromMap = useCallback(
    (feature: SelectedMapFeature | null) => {
      if (feature) setSelectionOrigin("map");
      onSelectedFinalizedFeatureChange(feature);
    },
    [onSelectedFinalizedFeatureChange],
  );
  const selectFeatureFromList = useCallback(
    (feature: SelectedMapFeature | null) => {
      if (feature) setSelectionOrigin("list");
      onSelectedFinalizedFeatureChange(feature);
    },
    [onSelectedFinalizedFeatureChange],
  );

  // 選択が消えたら「地図から選んだ」に戻す。次にどこから選ばれても、
  // 選んだ側のハンドラが上書きするので取り違えが起きない。
  useEffect(() => {
    if (selectedFinalizedFeature) return;
    setSelectionOrigin("map");
  }, [selectedFinalizedFeature]);

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
                contentClassName="relative z-10 flex h-full max-h-none w-[min(560px,50vw)] max-w-none flex-col items-center justify-center overflow-hidden bg-white border border-gray-200 pointer-events-auto shadow-2xl"
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
  const desktopDetailHeader = (
    <InfoSection
      resort={resortInfo}
      finalizedOperationSummary={resort.finalizedOperationSummary}
      isCompareSelected={isCompareSelected}
      onToggleCompare={onToggleCompare}
      onClose={onClose}
    />
  );
  const finalizedCourseGroups = createFinalizedCourseGroups(
    resort.finalizedMapData?.courses?.features ?? [],
  );
  const selectedCourseGroup =
    selectedFinalizedFeature?.kind === "course"
      ? (finalizedCourseGroups.find(
          group => group.id === selectedFinalizedFeature.id,
        ) ?? null)
      : null;
  const selectedLift =
    selectedFinalizedFeature?.kind === "lift"
      ? (resort.finalizedMapData?.lifts?.features.find(
          lift => lift.id === selectedFinalizedFeature.id,
        ) ?? null)
      : null;
  const closeFeatureDetail = () => {
    const shouldReturnToList = selectionOrigin === "list";
    onSelectedFinalizedFeatureChange(null);
    onSelectedElevationProfilePointChange(null);
    if (!shouldReturnToList) return;

    // 一覧から選んだ場合は、一覧と初期表示（スキー場全体）の地図へ戻す
    setActiveTab(selectedCourseGroup ? "コース" : "リフト");
    setDetailViewportResetKey(key => key + 1);
  };
  const renderFeatureDetail = (options?: { withOpenList?: boolean }) =>
    selectedCourseGroup || selectedLift ? (
      <FinalizedFeatureDetail
        courseGroup={selectedCourseGroup}
        lift={selectedLift}
        resortLabelName={getResortSearchName(resort.id, resort.nameJa)}
        courseSourceUrls={resort.finalizedMapData?.courses?.sourceUrls ?? []}
        courseVerificationStatus={
          resort.finalizedMapData?.courses?.verificationStatus
        }
        liftSourceUrls={resort.finalizedMapData?.lifts?.sourceUrls ?? []}
        selectedElevationProfilePoint={selectedElevationProfilePoint}
        onSelectedElevationProfilePointChange={
          onSelectedElevationProfilePointChange
        }
        onClose={closeFeatureDetail}
        onOpenList={
          options?.withOpenList
            ? () => {
                setActiveTab(selectedCourseGroup ? "コース" : "リフト");
                onSelectedFinalizedFeatureChange(null);
                onSelectedElevationProfilePointChange(null);
              }
            : undefined
        }
      />
    ) : null;

  const renderTabPanels = () => (
    <>
      {activeTab === "概要" && <OverviewTab resort={resort} />}
      {activeTab === "コース" && (
        <CoursesTab
          resort={resort}
          finalizedMapData={resortData?.finalizedMapData ?? null}
          selectedFinalizedFeature={selectedFinalizedFeature}
          onSelectedFinalizedFeatureChange={selectFeatureFromList}
        />
      )}
      {activeTab === "リフト" && (
        <LiftsTab
          resort={resort}
          finalizedMapData={resortData?.finalizedMapData ?? null}
          selectedFinalizedFeature={selectedFinalizedFeature}
          onSelectedFinalizedFeatureChange={selectFeatureFromList}
        />
      )}
      {activeTab === "チケット" && <TicketsTab resort={resort} />}
      {activeTab === "気候" && <WeatherTab resort={resort} />}
    </>
  );

  const mobileFeatureDetail = renderFeatureDetail();

  // スマホは地図を常に同じ位置に置いたまま、その下だけを詳細に差し替える。
  // 位置が変わると地図が作り直され、選択状態が失われる。
  // デスクトップはパネル全体を詳細に切り替える。
  const detailPanelContent = isSidePanel ? (
    (renderFeatureDetail({ withOpenList: true }) ?? (
      <div className="flex-1 overflow-y-auto">
        {desktopDetailHeader}
        <DetailTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="p-4 md:p-8 text-gray-700">{renderTabPanels()}</div>
      </div>
    ))
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      {hideMobileInfoSection ? null : (
        <InfoSection
          resort={resortInfo}
          finalizedOperationSummary={resort.finalizedOperationSummary}
          isCompareSelected={isCompareSelected}
          onToggleCompare={onToggleCompare}
          onClose={onClose}
        />
      )}
      <ResortMapSection
        DynamicMap={DynamicMap}
        resortId={resort.id}
        finalizedMapData={resort.finalizedMapData ?? null}
        mapResorts={mapResorts}
        selectedFinalizedFeature={selectedFinalizedFeature}
        selectedElevationProfilePoint={selectedElevationProfilePoint}
        onSelectedFinalizedFeatureChange={selectFeatureFromMap}
        onSelectedElevationProfilePointChange={
          onSelectedElevationProfilePointChange
        }
        featureDetail={mobileFeatureDetail}
        detailViewportResetKey={detailViewportResetKey}
      />
      {!mobileFeatureDetail && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DetailTabs
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
          <div className="p-4 text-gray-700">{renderTabPanels()}</div>
        </div>
      )}
    </div>
  );

  // 全画面地図では一覧が見えていないので、「一覧へ」の導線は出さない
  const desktopFeatureDetail = renderFeatureDetail({
    withOpenList: !isDesktopMapExpanded,
  });
  // 全画面地図では、選択中のコースだけを右に重ねる。
  // 何も選んでいなければパネルごと畳んで地図を邪魔しない。
  const shouldRenderDesktopPanel =
    isSidePanel && (!isDesktopMapExpanded || Boolean(desktopFeatureDetail));

  return (
    <>
      {shouldRenderDesktopPanel && (
        <Portal>
          <div
            className={cn(
              "fixed inset-0 hidden md:flex md:justify-end pointer-events-none",
              isDesktopMapExpanded ? "z-[420] p-3" : "z-[60]",
            )}
          >
            <div
              className="absolute inset-0 bg-transparent pointer-events-none"
              aria-hidden="true"
            />
            <AnimatedPanel
              data-ski-resort-detail-panel="true"
              visible={isSidePanel}
              contentClassName={cn(
                "relative z-10 flex h-full max-h-none max-w-none flex-col overflow-hidden bg-white border border-gray-200 pointer-events-auto shadow-2xl",
                isDesktopMapExpanded
                  ? "w-[min(460px,40vw)] rounded-xl"
                  : "w-[min(560px,50vw)]",
              )}
            >
              {isDesktopMapExpanded ? desktopFeatureDetail : detailPanelContent}
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
