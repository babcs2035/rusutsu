"use client";

import { Portal } from "@radix-ui/react-portal";
import type { ComponentType } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { MAP_TOP_CONTROLS_ATTRIBUTE } from "@/features/map/constants";
import { useScreenState } from "@/features/map/session/useScreenState";
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
import { MapAreaTabs } from "./components/MapAreaTabs";
import { ResortMapSection } from "./components/ResortMapSection";
import { TrailMapPanel } from "./components/TrailMapPanel";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import {
  InfoSection,
  OverviewTab,
  TicketsTab,
  WeatherTab,
} from "./tabs/DetailTabContent";
import { SnsTab } from "./tabs/OverviewTab";
import { createFinalizedCourseGroups } from "./utils/detailMetrics";

type Props = {
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  resortData: NullableSkiResortDetail | null;
  /**
   * 一覧（地図用データ）側の同じスキー場。詳細の取得を待たずに
   * 名前と所在地を出すために使う。URL直打ちでも一覧はSSRで届いている。
   */
  resortSummary?: MapSkiResort | null;
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

const tabSchema = z.enum(["ゲレンデ", "SNS", "料金", "天気"]);
const terrainSchema = z.enum(["コース", "リフト"]);
const areaSchema = z.enum(["地図", "ゲレンデマップ"]);
const booleanSchema = z.boolean();
const originSchema = z.enum(["map", "list"]);

const TABS = ["ゲレンデ", "SNS", "料金", "天気"];
const MAP_AREA_TABS = ["地図", "ゲレンデマップ"] as const;

/**
 * 詳細データの取得待ちに出す中身。
 * 一覧側のデータで名前が分かるので、見出し（名前・所在地・閉じる・比較に追加）は
 * 読み込み後と同じ InfoSection をそのまま出し、本文だけスピナーにする。
 * 別物のレイアウトを挟むと、詳細が届いた瞬間に見出しが動いてしまう。
 */
const DetailLoadingPanel = ({
  summary,
  showHeader,
  isCompareSelected,
  onToggleCompare,
  onClose,
}: {
  summary: MapSkiResort | null;
  /** モバイルは上のコンテキストヘッダーが名前と操作を出すので、パネル側では出さない */
  showHeader: boolean;
  isCompareSelected: boolean;
  onToggleCompare: (id: string, selected: boolean) => void;
  onClose: () => void;
}) => (
  <div
    className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white"
    aria-live="polite"
    aria-busy="true"
  >
    {showHeader && summary && (
      <InfoSection
        resort={{
          id: summary.id,
          nameJa: summary.nameJa,
          nameRuby: summary.nameRuby,
          formerNames: summary.formerNames,
          prefecture: summary.prefecture,
          town: summary.town,
          yukiMagi: Boolean(summary.yukiMagiId),
        }}
        isCompareSelected={isCompareSelected}
        onToggleCompare={onToggleCompare}
        onClose={onClose}
      />
    )}
    <LoadingSpinner className="min-h-0 flex-1 bg-white" />
  </div>
);

/**
 * スキー場の詳細情報を表示するレスポンシブ対応モーダル
 */
export const SkiResortDetailView = ({
  DynamicMap,
  mapResorts,
  resortData,
  resortSummary = null,
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
  const stateKey = `rusutsu:detail:v1:${resortData?.id ?? "loading"}`;
  const [activeTab, setActiveTab] = useScreenState<string>(
    `${stateKey}:tab`,
    tabSchema,
    TABS[0],
  );
  const [terrainTab, setTerrainTab] = useScreenState(
    `${stateKey}:terrain`,
    terrainSchema,
    "コース",
  );
  // 「ゲレンデ」タブの中で、概要ではなくコース/リフトの一覧・詳細を見せているか。
  const [showTerrainDetail, setShowTerrainDetail] = useScreenState(
    `${stateKey}:terrainDetail`,
    booleanSchema,
    false,
  );
  // 地図の部分を、通常の地図で見せるか公式のゲレンデマップ画像で見せるか
  const [mapAreaView, setMapAreaView] = useScreenState(
    `${stateKey}:area`,
    areaSchema,
    "地図",
  );
  const isSidePanel = useBreakpointValue({ base: false, md: true }) ?? false;
  // 選択を解除したときの戻り先を決めるために、どこから選んだかを覚えておく。
  // 一覧から選んだときは元の一覧と初期表示の地図へ、
  // 地図から選んだときは今の地図の見え方のまま戻す。
  const [selectionOrigin, setSelectionOrigin] = useScreenState(
    `${stateKey}:origin`,
    originSchema,
    "map",
  );
  const [detailViewportResetKey, setDetailViewportResetKey] = useState(0);

  const selectFeatureFromMap = useCallback(
    (feature: SelectedMapFeature | null) => {
      if (feature) setSelectionOrigin("map");
      onSelectedFinalizedFeatureChange(feature);
    },
    [onSelectedFinalizedFeatureChange, setSelectionOrigin],
  );
  const selectFeatureFromList = useCallback(
    (feature: SelectedMapFeature | null) => {
      if (feature) setSelectionOrigin("list");
      onSelectedFinalizedFeatureChange(feature);
    },
    [onSelectedFinalizedFeatureChange, setSelectionOrigin],
  );

  // 選択が消えたら「地図から選んだ」に戻す。次にどこから選ばれても、
  // 選んだ側のハンドラが上書きするので取り違えが起きない。
  useEffect(() => {
    if (selectedFinalizedFeature) return;
    setSelectionOrigin("map");
  }, [selectedFinalizedFeature, setSelectionOrigin]);

  const previousSelection = useRef(selectedFinalizedFeature);
  useEffect(() => {
    if (
      JSON.stringify(previousSelection.current) ===
      JSON.stringify(selectedFinalizedFeature)
    )
      return;
    previousSelection.current = selectedFinalizedFeature;
    if (selectedFinalizedFeature?.kind === "course") {
      setActiveTab("ゲレンデ");
      setTerrainTab("コース");
      setShowTerrainDetail(true);
    }
    if (selectedFinalizedFeature?.kind === "lift") {
      setActiveTab("ゲレンデ");
      setTerrainTab("リフト");
      setShowTerrainDetail(true);
    }
  }, [
    selectedFinalizedFeature,
    setActiveTab,
    setTerrainTab,
    setShowTerrainDetail,
  ]);

  useBodyScrollLock();
  const shouldRenderMobilePanel = isSidePanel || mobileContentTab === "info";
  // inline: 親（モバイル詳細シート）内に相対配置 / overlay: 画面下部に固定配置
  const mobilePanelPositionClasses =
    mobilePresentation === "inline"
      ? "relative h-full"
      : "fixed left-0 right-0 bottom-0 top-[calc(env(safe-area-inset-top,0px)+6.75rem)]";

  if (isLoading || !resortData) {
    const loadingContent = (
      <DetailLoadingPanel
        summary={resortSummary}
        showHeader={isSidePanel}
        isCompareSelected={isCompareSelected}
        onToggleCompare={onToggleCompare}
        onClose={onClose}
      />
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
                contentClassName="relative z-10 flex h-full max-h-none w-[min(560px,50vw)] max-w-none flex-col overflow-hidden bg-white border border-gray-200 pointer-events-auto shadow-2xl"
              >
                {loadingContent}
              </AnimatedPanel>
            </div>
          </Portal>
        )}
        {/*
          読み込み中も本体と同じ箱（h-full + overflow-hidden）に入れる。
          AnimatedPanel が transform を持つため、中の fixed はパネルを基準に
          配置される。箱を揃えないと高さ0の領域からはみ出して、
          地図の上に「読み込み中」だけが浮く。
        */}
        {!isSidePanel && shouldRenderMobilePanel && (
          <div
            data-ski-resort-detail-panel="true"
            className={`z-[300] flex h-full flex-col overflow-hidden bg-white border-t border-gray-200 ${mobilePanelPositionClasses}`}
          >
            {loadingContent}
          </div>
        )}
      </>
    );
  }

  const resort = resortData;
  const trailMapLinks = resort.trailMapLinks;
  const hasTrailMap = (trailMapLinks?.mapUrls.length ?? 0) > 0;
  const resortInfo = {
    id: resort.id,
    nameJa: resort.nameJa,
    nameRuby: resort.nameRuby,
    formerNames: resort.formerNames,
    prefecture: resort.prefecture,
    town: resort.town,
    yukiMagi: Boolean(resort.yukiMagi),
  };
  const desktopDetailHeader = (
    <InfoSection
      resort={resortInfo}
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
    setActiveTab("ゲレンデ");
    setTerrainTab(selectedCourseGroup ? "コース" : "リフト");
    setShowTerrainDetail(true);
    setDetailViewportResetKey(key => key + 1);
  };
  const renderFeatureDetail = (options?: { withOpenList?: boolean }) =>
    selectedCourseGroup || selectedLift ? (
      <FinalizedFeatureDetail
        courseGroup={selectedCourseGroup}
        lift={selectedLift}
        resortLabelName={getResortSearchName(
          resort.id,
          resort.nameJa,
          resort.shortName,
        )}
        courseObservedAt={resort.finalizedMapData?.courses?.observedAt}
        liftObservedAt={resort.finalizedMapData?.lifts?.observedAt}
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
                setActiveTab("ゲレンデ");
                setTerrainTab(selectedCourseGroup ? "コース" : "リフト");
                setShowTerrainDetail(true);
                onSelectedFinalizedFeatureChange(null);
                onSelectedElevationProfilePointChange(null);
              }
            : undefined
        }
      />
    ) : null;

  const renderTabPanels = () => (
    <div className="relative">
      {activeTab === "ゲレンデ" && (
        <OverviewTab
          resort={resort}
          showTerrainDetail={showTerrainDetail}
          terrainTab={terrainTab}
          onShowTerrainDetail={tab => {
            setTerrainTab(tab);
            setShowTerrainDetail(true);
          }}
          onCloseTerrainDetail={() => setShowTerrainDetail(false)}
          selectedFinalizedFeature={selectedFinalizedFeature}
          onSelectedFinalizedFeatureChange={selectFeatureFromList}
        />
      )}
      <div
        className={
          activeTab !== "SNS"
            ? "invisible absolute inset-x-0 top-0 pointer-events-none"
            : undefined
        }
        aria-hidden={activeTab !== "SNS"}
        inert={activeTab !== "SNS"}
      >
        <SnsTab resort={resort} />
      </div>
      {activeTab === "料金" && <TicketsTab resort={resort} />}
      {activeTab === "天気" && <WeatherTab resort={resort} />}
    </div>
  );

  const mobileFeatureDetail = renderFeatureDetail();

  // スマホは地図を常に同じ位置に置いたまま、その下だけを詳細に差し替える。
  // 位置が変わると地図が作り直され、選択状態が失われる。
  // デスクトップはパネル全体を詳細に切り替える。
  const detailPanelContent = isSidePanel ? (
    (renderFeatureDetail({ withOpenList: true }) ?? (
      <div
        data-session-scroll={`${stateKey}:desktop:${activeTab}`}
        className="flex-1 overflow-y-auto"
      >
        {desktopDetailHeader}
        <DetailTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="p-3 md:p-4 text-gray-700">{renderTabPanels()}</div>
      </div>
    ))
  ) : (
    // 選択中の機能（コース・リフト）がないときは、案内・地図・タブまで
    // まとめて 1 つのスクロール領域にする（地図もスクロールで隠れる）。
    // 選択中は、地図とその下の詳細パネルという固定レイアウトのまま。
    <div
      data-session-scroll={`${stateKey}:mobile:${activeTab}:${terrainTab}:${showTerrainDetail}`}
      className={
        mobileFeatureDetail
          ? "flex h-full min-h-0 flex-col"
          : "h-full min-h-0 overflow-y-auto overscroll-contain"
      }
    >
      {hideMobileInfoSection ? null : (
        <InfoSection
          resort={resortInfo}
          isCompareSelected={isCompareSelected}
          onToggleCompare={onToggleCompare}
          onClose={onClose}
        />
      )}
      {!mobileFeatureDetail && (
        <DetailTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
      {/* 地図は「ゲレンデ」タブ（とそこから選んだコース・リフトの詳細）だけで使う。
          他のタブでは表示領域を無駄にしないよう出さない。 */}
      {mobileFeatureDetail && (
        <ResortMapSection
          DynamicMap={DynamicMap}
          resortId={resort.id}
          previewHeightClassName="h-[clamp(200px,41dvh,396px)] shrink-0"
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
      )}
      {!mobileFeatureDetail &&
        activeTab === "ゲレンデ" &&
        (hasTrailMap && mapAreaView === "ゲレンデマップ" ? (
          // 静止画なので、タブとは重ならない専用の帯を上に置く
          <div className="flex h-[clamp(200px,41dvh,396px)] shrink-0 flex-col">
            <div className="flex shrink-0 justify-start border-b border-slate-200 bg-white px-2 py-1.5">
              <MapAreaTabs
                tabs={MAP_AREA_TABS}
                activeTab={mapAreaView}
                onTabChange={setMapAreaView}
              />
            </div>
            <div className="min-h-0 flex-1">
              <TrailMapPanel
                links={trailMapLinks}
                onShowMap={() => setMapAreaView("地図")}
                className="h-full"
              />
            </div>
          </div>
        ) : (
          // 地図（航空写真）はボタンの下まで敷いたまま、コース・リフトだけが
          // ボタンの下に潜らないようにする。帯の高さは地図側が余白として読み取る。
          <div className="relative h-[clamp(200px,41dvh,396px)] shrink-0">
            {/* 「拡大」ボタン（top-2 / h-9）と同じ中心線にそろえる */}
            <div
              {...{ [MAP_TOP_CONTROLS_ATTRIBUTE]: "true" }}
              className="pointer-events-none absolute inset-x-0 top-2 z-20 flex h-9 items-center gap-2 px-2"
            >
              {hasTrailMap && (
                <div className="pointer-events-auto">
                  <MapAreaTabs
                    tabs={MAP_AREA_TABS}
                    activeTab={mapAreaView}
                    onTabChange={setMapAreaView}
                  />
                </div>
              )}
              {hasTrailMap && (
                // 国土地理院の規定で出典表示が必要なだけなので、小さく控えめに出す
                <a
                  href="https://maps.gsi.go.jp/development/ichiran.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pointer-events-auto mr-11 ml-auto flex h-5 items-center rounded bg-white/85 px-1.5 text-[10px] leading-none text-gray-600 backdrop-blur-sm hover:bg-white hover:text-gray-900"
                >
                  地理院タイル
                </a>
              )}
            </div>
            <div
              className={
                hasTrailMap
                  ? "h-full [&_.maplibregl-ctrl-bottom-right]:hidden"
                  : "h-full"
              }
            >
              <ResortMapSection
                DynamicMap={DynamicMap}
                resortId={resort.id}
                previewHeightClassName="h-full shrink-0"
                finalizedMapData={resort.finalizedMapData ?? null}
                mapResorts={mapResorts}
                selectedFinalizedFeature={selectedFinalizedFeature}
                selectedElevationProfilePoint={selectedElevationProfilePoint}
                onSelectedFinalizedFeatureChange={selectFeatureFromMap}
                onSelectedElevationProfilePointChange={
                  onSelectedElevationProfilePointChange
                }
                featureDetail={null}
                detailViewportResetKey={detailViewportResetKey}
              />
            </div>
          </div>
        ))}
      {!mobileFeatureDetail && (
        <div className="p-3 text-gray-700">{renderTabPanels()}</div>
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
