"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FinalizedMapToolbar } from "@/features/map/components/FinalizedMapToolbar";
import type {
  CourseColorMode,
  ElevationProfileMapPoint,
  JapanResortMapProps,
  MapTileVariant,
  SelectedMapFeature,
} from "@/features/map/types";
import { FinalizedFeatureDetail } from "@/features/resort-detail/components/FinalizedFeatureDetail";
import type { FeatureDetailPlacement } from "@/features/resort-detail/components/ResortMapSection";
import { ResortMapSection } from "@/features/resort-detail/components/ResortMapSection";
import { createFinalizedCourseGroups } from "@/features/resort-detail/utils/detailMetrics";
import { getResortSearchName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import type { MapSkiResort } from "@/types/skiResorts";
import type { Resort } from "./types";

type FeatureSelection = {
  feature: SelectedMapFeature | null;
  elevationPoint: ElevationProfileMapPoint | null;
};

const EMPTY_SELECTION: FeatureSelection = {
  feature: null,
  elevationPoint: null,
};

/**
 * 比較（デスクトップ）で選んでいるコース・リフト。
 * 詳細は右のパネルに 1 枚だけ出すので、選択もスキー場をまたいで 1 つに絞る。
 */
export type CompareSlopeSelection = {
  resortId: string;
  feature: SelectedMapFeature;
  elevationPoint: ElevationProfileMapPoint | null;
};

type OperationCountSummary = Resort["finalizedOperationSummary"]["courses"];

/** 見出し（営業状況・標高差）。値より一段弱く出す */
const StatGroupLabel = ({ children }: { children: ReactNode }) => (
  <span className="shrink-0 text-[11px] font-semibold text-gray-400">
    {children}
  </span>
);

/**
 * 「開いている数 / 全体」。
 * 開いている数が取れていないところは「0 だから閉まっている」と
 * 読み違えられないよう、数字ではなく「不明」と書く。
 */
const OperationCount = ({
  label,
  summary,
  fallbackTotal,
}: {
  label: string;
  summary: OperationCountSummary;
  fallbackTotal: number | null | undefined;
}) => {
  const total = summary?.total || fallbackTotal || null;
  const isKnown = Boolean(summary && summary.total > 0);

  return (
    <span className="inline-flex shrink-0 items-baseline gap-1">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-sm font-bold text-blue-600 tabular-nums">
        {isKnown ? summary?.open : "不明"}
        {total !== null && (
          <>
            <span className="mx-px text-blue-300">/</span>
            {total}
          </>
        )}
      </span>
    </span>
  );
};

const useSlopeMapSelection = () => {
  const [selectionByResortId, setSelectionByResortId] = useState<
    Record<string, FeatureSelection>
  >({});

  const setSelection = useCallback(
    (resortId: string, next: Partial<FeatureSelection>) => {
      setSelectionByResortId(prev => ({
        ...prev,
        [resortId]: { ...(prev[resortId] ?? EMPTY_SELECTION), ...next },
      }));
    },
    [],
  );

  return { selectionByResortId, setSelection };
};

const EmptyMessage = () => (
  <p className="py-10 text-center text-sm font-semibold text-gray-500">
    比較するスキー場がありません。
  </p>
);

/**
 * 比較のゲレンデ表示（スマホ）。
 *
 * 1 画面 1 スキー場のカルーセル。地図はプレビュー（操作不可）にして
 * カード全体の左右スワイプを優先し、拡大ボタンからだけ操作できる全画面に入る。
 * MapLibre は WebGL コンテキストを持つので、表示中の 1 枚だけをマウントする。
 * 表示の切替は上に固定した帯にまとめ、比較中のスキー場すべてに効かせる。
 * 狭いので凡例はここには出さず、全画面の地図側に任せる。
 */
export const CompareSlopeMapTab = ({
  resorts,
  DynamicMap,
  mapResorts,
}: {
  resorts: Resort[];
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
}) => {
  const { selectionByResortId, setSelection } = useSlopeMapSelection();
  const [activeIndex, setActiveIndex] = useState(0);
  const [courseColorMode, setCourseColorMode] =
    useState<CourseColorMode>("slope");
  const [showOpenOnly, setShowOpenOnly] = useState(false);
  const [mapTileVariant, setMapTileVariant] = useState<MapTileVariant>("photo");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasCourses = resorts.some(
    resort => (resort.finalizedMapData?.courses?.features.length ?? 0) > 0,
  );
  const hasLifts = resorts.some(
    resort => (resort.finalizedMapData?.lifts?.features.length ?? 0) > 0,
  );

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element || element.clientWidth === 0) return;

    const index = Math.round(element.scrollLeft / element.clientWidth);
    setActiveIndex(previous => (previous === index ? previous : index));
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const element = scrollRef.current;
    if (!element) return;

    element.scrollTo({ left: index * element.clientWidth, behavior: "smooth" });
  }, []);

  if (resorts.length === 0) return <EmptyMessage />;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="scroll-touch shrink-0 overflow-x-auto border-b border-gray-200 bg-white pb-1.5">
        <FinalizedMapToolbar
          presentation="bar"
          showLegend={false}
          mode={courseColorMode}
          onModeChange={setCourseColorMode}
          hasCourses={hasCourses}
          hasLifts={hasLifts}
          showOpenOnly={showOpenOnly}
          onShowOpenOnlyChange={setShowOpenOnly}
          mapTileVariant={mapTileVariant}
          onMapTileVariantChange={setMapTileVariant}
        />
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scroll-touch flex min-h-0 w-full flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      >
        {resorts.map((resort, index) => (
          <div
            key={resort.id}
            className="h-full w-full min-w-full snap-center px-0.5"
          >
            {index === activeIndex ? (
              <ResortSlopeMapCard
                resort={resort}
                DynamicMap={DynamicMap}
                mapResorts={mapResorts}
                selection={selectionByResortId[resort.id] ?? EMPTY_SELECTION}
                onSelectionChange={next => setSelection(resort.id, next)}
                className="h-full"
                showInlineMapToolbar={false}
                courseColorMode={courseColorMode}
                onCourseColorModeChange={setCourseColorMode}
                showOpenOnly={showOpenOnly}
                onShowOpenOnlyChange={setShowOpenOnly}
                mapTileVariant={mapTileVariant}
                onMapTileVariantChange={setMapTileVariant}
              />
            ) : (
              <SlopeMapCardShell resort={resort} className="h-full">
                <div className="min-h-0 flex-1 border-t border-gray-200 bg-gray-100" />
              </SlopeMapCardShell>
            )}
          </div>
        ))}
      </div>

      {resorts.length > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-3 py-2">
          <Button
            type="button"
            variant="ghost"
            aria-label="前のスキー場"
            disabled={activeIndex === 0}
            onClick={() => scrollToIndex(activeIndex - 1)}
            className="h-8 w-8 min-w-8 rounded-full p-0 text-gray-500"
          >
            <ChevronLeft size={18} />
          </Button>
          <div className="flex items-center gap-1.5">
            {resorts.map((resort, index) => (
              <span
                key={resort.id}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === activeIndex
                    ? "w-4 bg-blue-600"
                    : "w-1.5 bg-gray-300",
                )}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            aria-label="次のスキー場"
            disabled={activeIndex === resorts.length - 1}
            onClick={() => scrollToIndex(activeIndex + 1)}
            className="h-8 w-8 min-w-8 rounded-full p-0 text-gray-500"
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      )}
    </div>
  );
};

/**
 * 比較のゲレンデ表示（デスクトップ）。左側の地図エリアを丸ごと使う。
 *
 * 幅が広ければ 2 列、狭ければ 1 列で縦に積む。
 * 地図で埋め尽くすと、ホイールもドラッグも地図に吸われて縦スクロールできなく
 * なるため、余白・カード見出し・右端のスクロールバー領域を必ず残す。
 * 色分け・地図種別・営業中のみは上の帯（CompareMapHeaderBar）が持ち、
 * ここでは全カードへ同じ値を配る。
 */
export const CompareSlopeMapBoard = ({
  resorts,
  DynamicMap,
  mapResorts,
  courseColorMode,
  onCourseColorModeChange,
  showOpenOnly,
  onShowOpenOnlyChange,
  mapTileVariant,
  onMapTileVariantChange,
  selection,
  onSelectionChange,
  className,
  style,
}: {
  resorts: Resort[];
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  courseColorMode: CourseColorMode;
  onCourseColorModeChange: (mode: CourseColorMode) => void;
  showOpenOnly: boolean;
  onShowOpenOnlyChange: (showOpenOnly: boolean) => void;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  selection: CompareSlopeSelection | null;
  onSelectionChange: (selection: CompareSlopeSelection | null) => void;
  className?: string;
  style?: CSSProperties;
}) => {
  return (
    <div
      style={style}
      className={cn(
        "compare-board-scroll @container overflow-y-auto overscroll-contain bg-gray-50",
        className,
      )}
    >
      {resorts.length === 0 ? (
        <EmptyMessage />
      ) : (
        <div className="grid grid-cols-1 gap-8 @[52rem]:grid-cols-2">
          {resorts.map(resort => (
            <ResortSlopeMapCard
              key={resort.id}
              resort={resort}
              DynamicMap={DynamicMap}
              mapResorts={mapResorts}
              selection={
                selection?.resortId === resort.id ? selection : EMPTY_SELECTION
              }
              onSelectionChange={next =>
                onSelectionChange(
                  applyCompareSelection(selection, resort.id, next),
                )
              }
              className="h-[46vh] min-h-[340px] shadow-sm"
              allowPreviewInteraction
              // 詳細は右の比較パネルに重ねて出すので、カードには出さない
              featureDetailPlacement="external"
              // 表示設定は上の帯にまとめてあるので、カードごとには出さない
              showInlineMapToolbar={false}
              courseColorMode={courseColorMode}
              onCourseColorModeChange={onCourseColorModeChange}
              showOpenOnly={showOpenOnly}
              onShowOpenOnlyChange={onShowOpenOnlyChange}
              mapTileVariant={mapTileVariant}
              onMapTileVariantChange={onMapTileVariantChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * カード 1 枚からの選択変更を、比較全体で 1 つの選択にまとめる。
 * 別のスキー場を選んだらそちらへ移り、解除したら選択なしに戻す。
 */
const applyCompareSelection = (
  current: CompareSlopeSelection | null,
  resortId: string,
  next: Partial<FeatureSelection>,
): CompareSlopeSelection | null => {
  if (next.feature !== undefined) {
    return next.feature
      ? { resortId, feature: next.feature, elevationPoint: null }
      : null;
  }
  if (!current || current.resortId !== resortId) return current;
  return { ...current, elevationPoint: next.elevationPoint ?? null };
};

/**
 * 比較（デスクトップ）で選んでいるコース・リフトの詳細。
 * 地図の上ではなく、右の比較パネルに重ねて出す。
 */
export const CompareSlopeFeatureDetail = ({
  resort,
  selection,
  onSelectionChange,
}: {
  resort: Resort;
  selection: CompareSlopeSelection;
  onSelectionChange: (selection: CompareSlopeSelection | null) => void;
}) => {
  const courseGroups = useMemo(
    () =>
      createFinalizedCourseGroups(
        resort.finalizedMapData?.courses?.features ?? [],
      ),
    [resort.finalizedMapData],
  );
  const selectedCourseGroup =
    selection.feature.kind === "course"
      ? (courseGroups.find(group => group.id === selection.feature.id) ?? null)
      : null;
  const selectedLift =
    selection.feature.kind === "lift"
      ? (resort.finalizedMapData?.lifts?.features.find(
          lift => lift.id === selection.feature.id,
        ) ?? null)
      : null;
  if (!selectedCourseGroup && !selectedLift) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 truncate border-b border-gray-100 px-4 pt-3 pb-2 text-xs font-semibold text-gray-500 md:px-6">
        {resort.nameJa}
      </p>
      <div className="min-h-0 flex-1">
        <FinalizedFeatureDetail
          courseGroup={selectedCourseGroup}
          lift={selectedLift}
          resortLabelName={getResortSearchName(resort.id, resort.nameJa)}
          courseSourceUrls={resort.finalizedMapData?.courses?.sourceUrls ?? []}
          courseVerificationStatus={
            resort.finalizedMapData?.courses?.verificationStatus
          }
          liftSourceUrls={resort.finalizedMapData?.lifts?.sourceUrls ?? []}
          selectedElevationProfilePoint={selection.elevationPoint}
          onSelectedElevationProfilePointChange={point =>
            onSelectionChange({ ...selection, elevationPoint: point })
          }
          onClose={() => onSelectionChange(null)}
        />
      </div>
    </div>
  );
};

const SlopeMapCardShell = ({
  resort,
  children,
  className,
}: {
  resort: Resort;
  children?: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white",
      className,
    )}
  >
    <div className="@container shrink-0 px-3 py-2">
      {/* 名前は省略しない。どのスキー場の地図かが分からなくなるため */}
      <p className="text-sm leading-tight font-bold break-words text-gray-900 font-[var(--font-heading)]">
        {resort.nameJa}
      </p>
      {/*
        「営業状況（コース・リフト）」と「標高差」の 2 つのまとまり。
        数字を読ませたいので、見出しは小さく、値は大きく色を付ける。
      */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="inline-flex shrink-0 items-baseline gap-1.5">
          <StatGroupLabel>営業</StatGroupLabel>
          <OperationCount
            label="コース"
            summary={resort.finalizedOperationSummary.courses}
            fallbackTotal={resort.numberOfCourses}
          />
          <OperationCount
            label="リフト"
            summary={resort.finalizedOperationSummary.lifts}
            fallbackTotal={resort.numberOfLifts}
          />
        </span>
        <span className="inline-flex shrink-0 items-baseline gap-1.5">
          <StatGroupLabel>標高差</StatGroupLabel>
          <span className="text-sm font-bold text-gray-900 tabular-nums">
            {resort.verticalDrop.toLocaleString()}m
          </span>
          {/* 内訳は幅に余裕があるときだけ。狭いと 2 行になってしまう */}
          <span className="hidden text-[11px] font-medium text-gray-400 tabular-nums @[25rem]:inline">
            {resort.topElevation.toLocaleString()}–
            {resort.baseElevation.toLocaleString()}m
          </span>
        </span>
      </div>
    </div>
    {children}
  </div>
);

const ResortSlopeMapCard = ({
  resort,
  DynamicMap,
  mapResorts,
  selection,
  onSelectionChange,
  className,
  allowPreviewInteraction = false,
  featureDetailPlacement = "below",
  showInlineMapToolbar = true,
  courseColorMode,
  onCourseColorModeChange,
  showOpenOnly,
  onShowOpenOnlyChange,
  mapTileVariant,
  onMapTileVariantChange,
}: {
  resort: Resort;
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  selection: FeatureSelection;
  onSelectionChange: (next: Partial<FeatureSelection>) => void;
  className?: string;
  /** デスクトップの並びは、その場で地図を動かせるようにする */
  allowPreviewInteraction?: boolean;
  featureDetailPlacement?: FeatureDetailPlacement;
  showInlineMapToolbar?: boolean;
  courseColorMode?: CourseColorMode;
  onCourseColorModeChange?: (mode: CourseColorMode) => void;
  showOpenOnly?: boolean;
  onShowOpenOnlyChange?: (showOpenOnly: boolean) => void;
  mapTileVariant?: MapTileVariant;
  onMapTileVariantChange?: (variant: MapTileVariant) => void;
}) => {
  const courseGroups = useMemo(
    () =>
      createFinalizedCourseGroups(
        resort.finalizedMapData?.courses?.features ?? [],
      ),
    [resort.finalizedMapData],
  );
  const selectedCourseGroup =
    selection.feature?.kind === "course"
      ? (courseGroups.find(group => group.id === selection.feature?.id) ?? null)
      : null;
  const selectedLift =
    selection.feature?.kind === "lift"
      ? (resort.finalizedMapData?.lifts?.features.find(
          lift => lift.id === selection.feature?.id,
        ) ?? null)
      : null;
  const featureDetail =
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
        selectedElevationProfilePoint={selection.elevationPoint}
        onSelectedElevationProfilePointChange={point =>
          onSelectionChange({ elevationPoint: point })
        }
        onClose={() =>
          onSelectionChange({ feature: null, elevationPoint: null })
        }
      />
    ) : null;

  return (
    <SlopeMapCardShell resort={resort} className={className}>
      <ResortMapSection
        DynamicMap={DynamicMap}
        resortId={resort.id}
        finalizedMapData={resort.finalizedMapData ?? null}
        mapResorts={mapResorts}
        selectedFinalizedFeature={selection.feature}
        selectedElevationProfilePoint={selection.elevationPoint}
        onSelectedFinalizedFeatureChange={feature =>
          onSelectionChange({ feature, elevationPoint: null })
        }
        onSelectedElevationProfilePointChange={point =>
          onSelectionChange({ elevationPoint: point })
        }
        featureDetail={featureDetail}
        featureDetailPlacement={featureDetailPlacement}
        showInlineMapToolbar={showInlineMapToolbar}
        previewHeightClassName="min-h-0 flex-1"
        selectedHeightClassName="h-[48%] min-h-[160px] shrink-0"
        allowPreviewInteraction={allowPreviewInteraction}
        blockPreviewPointerEvents={!allowPreviewInteraction}
        courseColorMode={courseColorMode}
        onCourseColorModeChange={onCourseColorModeChange}
        showOpenOnly={showOpenOnly}
        onShowOpenOnlyChange={onShowOpenOnlyChange}
        mapTileVariant={mapTileVariant}
        onMapTileVariantChange={onMapTileVariantChange}
      />
    </SlopeMapCardShell>
  );
};
