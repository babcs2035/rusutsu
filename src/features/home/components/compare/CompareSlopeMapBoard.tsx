"use client";

import type { ComponentType, CSSProperties, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CourseColorMode,
  ElevationProfileMapPoint,
  JapanResortMapProps,
  MapTileVariant,
  SelectedMapFeature,
} from "@/features/map/types";
import type { MapDisplaySettings } from "@/features/map/utils/mapDisplaySettings";
import { StatusMark } from "@/features/resort-detail/components/CompactInfo";
import { FinalizedFeatureDetail } from "@/features/resort-detail/components/FinalizedFeatureDetail";
import type { FeatureDetailPlacement } from "@/features/resort-detail/components/ResortMapSection";
import { ResortMapSection } from "@/features/resort-detail/components/ResortMapSection";
import { createMapCourseStatusSummary } from "@/features/resort-detail/utils/courseStatusSummary";
import { hasSourceUrl } from "@/features/resort-detail/utils/currentConditions";
import {
  createFinalizedCourseGroups,
  findSelectedCourseGroup,
} from "@/features/resort-detail/utils/detailMetrics";
import { createLiftStatusSummary } from "@/features/resort-detail/utils/liftStatusSummary";
import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import { getResortSearchName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import type { MapSkiResort } from "@/types/skiResorts";
import {
  COMPARE_CAROUSEL_PAGE_CLASS,
  COMPARE_CAROUSEL_TRACK_CLASS,
  CompareCarouselPager,
  useCompareCarousel,
} from "./CompareCarousel";
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

const unknownSummary = (total: number): CourseStatusSummary => ({
  total,
  open: 0,
  partial: 0,
  closed: 0,
  unknown: total,
  observedAt: null,
  sourceUrls: [],
  updates: [],
});

export const getCourseSummary = (resort: Resort): CourseStatusSummary => {
  const mapData = resort.finalizedMapData;
  return (
    (mapData
      ? createMapCourseStatusSummary(mapData.courses)
      : resort.operationStatus?.courses) ??
    unknownSummary(resort.numberOfCourses ?? 0)
  );
};

export const getLiftSummary = (resort: Resort): CourseStatusSummary => {
  const section = resort.finalizedMapData?.lifts;
  if (!resort.finalizedMapData && resort.operationStatus) {
    const { lifts, liftSourceUrls } = resort.operationStatus;
    if (!hasSourceUrl(liftSourceUrls))
      return unknownSummary(lifts?.total ?? resort.numberOfLifts ?? 0);
    return lifts ?? unknownSummary(0);
  }
  if (!hasSourceUrl(section?.sourceUrls)) {
    return unknownSummary(
      section?.features.length ?? resort.numberOfLifts ?? 0,
    );
  }
  return createLiftStatusSummary(section) ?? unknownSummary(0);
};

/** 行ボックス内の余白が異なる数字・日本語も、描画される文字の中心で揃える。 */
const CenteredStatusText = ({
  children,
  className,
}: {
  children: string | number;
  className?: string;
}) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const baselineRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    let active = true;
    const align = () => {
      const element = textRef.current;
      const baseline = baselineRef.current;
      if (!active || !element || !baseline) return;
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;
      const style = getComputedStyle(element);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics = context.measureText(String(children));
      const box = element.getBoundingClientRect();
      const inkCenter =
        baseline.getBoundingClientRect().top +
        (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) /
          2;
      const offset = box.top + box.height / 2 - inkCenter;
      element.style.transform = `translateY(${offset}px)`;
    };
    align();
    void document.fonts.ready.then(align);
    document.fonts.addEventListener("loadingdone", align);
    return () => {
      active = false;
      document.fonts.removeEventListener("loadingdone", align);
    };
  }, [children]);
  return (
    <span ref={textRef} className={cn("leading-none", className)}>
      {children}
      <span
        ref={baselineRef}
        aria-hidden="true"
        className="inline-block h-0 w-0 align-baseline"
      />
    </span>
  );
};

/**
 * ○△×不明の件数を 1 行に並べる。
 * sm はゲレンデのカード見出し（14px）、md は概要カードで数字を主役にする大きさ。
 */
export const OperationCount = ({
  label,
  summary,
  lift = false,
  size = "sm",
  compact = false,
}: {
  label: string;
  summary: CourseStatusSummary;
  lift?: boolean;
  size?: "sm" | "md";
  compact?: boolean;
}) => (
  <span
    role="group"
    aria-label={label}
    className={cn(
      "inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
      size === "md" ? (compact ? "h-6 gap-1" : "h-6 gap-1.5") : "h-5",
    )}
  >
    <CenteredStatusText
      className={cn(
        "font-semibold",
        size === "md" ? "text-sm text-slate-900" : "text-xs text-gray-500",
      )}
    >
      {label}
    </CenteredStatusText>
    <span
      className={cn(
        "inline-flex items-center leading-none font-bold tabular-nums text-slate-900",
        size === "md"
          ? "text-base [&_[role=img]]:size-3.5 [&_svg]:size-3.5"
          : "gap-0.5 text-sm [&_[role=img]]:size-3 [&_svg]:size-3",
        size === "md" && (compact ? "gap-1" : "gap-1.5"),
      )}
    >
      {(
        [
          ["○", summary.open],
          ["△", summary.partial],
          ["×", summary.closed],
        ] as const
      ).map(([symbol, count]) => (
        <span key={symbol} className="inline-flex items-center gap-0.5">
          <StatusMark symbol={symbol} lift={lift} size="sm" />
          <CenteredStatusText>{count}</CenteredStatusText>
        </span>
      ))}
      <span className="inline-flex items-center gap-0.5">
        <CenteredStatusText className="text-[11px] font-semibold text-slate-700">
          不明
        </CenteredStatusText>
        <CenteredStatusText>{summary.unknown}</CenteredStatusText>
      </span>
    </span>
  </span>
);

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

/**
 * 同時に画面に作っておく地図の数。
 * MapLibre は 1 枚ごとに WebGL コンテキストを使い、ブラウザは 1 ページで
 * 16 枚前後までしか持てない（超えると古い地図が消える）。ホームの地図の分も
 * 残して、スマホはメモリも考えて少なめにする。
 */
const MAX_LIVE_SLOPE_MAPS = { mobile: 5, desktop: 10 } as const;

/**
 * 見えている順・最近見た順に、地図を残すスキー場を選ぶ。
 * 戻ったときに作り直さないよう、上限までは見た地図を手放さない。
 */
export const nextLiveMapIds = (
  previous: string[],
  priority: string[],
  resortIds: string[],
  max: number,
) => {
  const wanted = priority.filter(id => resortIds.includes(id));
  const next = [
    ...wanted,
    ...previous.filter(id => !wanted.includes(id) && resortIds.includes(id)),
  ].slice(0, max);
  const unchanged =
    next.length === previous.length && next.every(id => previous.includes(id));
  return unchanged ? previous : next;
};

/** 地図の代わりに置く枠。地図を作る前と、作らずに残しているカードで使う */
const SlopeMapPlaceholder = () => (
  <div className="min-h-0 flex-1 border-t border-gray-200 bg-gray-100" />
);

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
 * スワイプのたびに地図を作り直さないよう、表示中と両隣の地図を先に用意し、
 * 最近見た地図も残す。MapLibre は WebGL コンテキストを持つので、同時に
 * 残す枚数は MAX_LIVE_SLOPE_MAPS までにする。
 * 表示の切替は上に固定した帯にまとめ、比較中のスキー場すべてに効かせる。
 * 色凡例と設定は通常表示でも使えるよう、この帯に置く。
 */
export const CompareSlopeMapTab = ({
  resorts,
  DynamicMap,
  mapResorts,
  onMapResortsNeeded,
  courseColorMode,
  onCourseColorModeChange,
  mapDisplaySettings,
  onMapDisplaySettingsChange,
  showOpenOnly,
  onShowOpenOnlyChange,
  mapTileVariant,
  onMapTileVariantChange,
}: {
  resorts: Resort[];
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  /** 表示中・隣のスキー場。地図データを先に取るために知らせる */
  onMapResortsNeeded?: (ids: string[]) => void;
  /** 表示設定は比較画面全体で 1 つ持ち、タブ行のツールバーから変える */
  courseColorMode: CourseColorMode;
  onCourseColorModeChange: (mode: CourseColorMode) => void;
  mapDisplaySettings: MapDisplaySettings;
  onMapDisplaySettingsChange: (settings: MapDisplaySettings) => void;
  showOpenOnly: boolean;
  onShowOpenOnlyChange: (showOpenOnly: boolean) => void;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
}) => {
  const { selectionByResortId, setSelection } = useSlopeMapSelection();
  const { activeIndex, scrollRef, handleScroll, scrollToIndex } =
    useCompareCarousel();
  const resortIdsKey = resorts.map(resort => resort.id).join(",");
  const [liveMapIds, setLiveMapIds] = useState<string[]>([]);
  useEffect(() => {
    const resortIds = resortIdsKey ? resortIdsKey.split(",") : [];
    const priority = [activeIndex, activeIndex + 1, activeIndex - 1]
      .map(index => resortIds[index])
      .filter((id): id is string => id !== undefined);
    onMapResortsNeeded?.(priority);
    setLiveMapIds(previous =>
      nextLiveMapIds(previous, priority, resortIds, MAX_LIVE_SLOPE_MAPS.mobile),
    );
  }, [activeIndex, resortIdsKey, onMapResortsNeeded]);
  if (resorts.length === 0) return <EmptyMessage />;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={COMPARE_CAROUSEL_TRACK_CLASS}
      >
        {resorts.map((resort, index) => (
          <div key={resort.id} className={COMPARE_CAROUSEL_PAGE_CLASS}>
            {index === activeIndex || liveMapIds.includes(resort.id) ? (
              <ResortSlopeMapCard
                resort={resort}
                DynamicMap={DynamicMap}
                mapResorts={mapResorts}
                selection={selectionByResortId[resort.id] ?? EMPTY_SELECTION}
                onSelectionChange={next => setSelection(resort.id, next)}
                className="h-full"
                showInlineMapToolbar={false}
                // 縮尺は詳細と同じものを右下に出す
                compactControls
                courseColorMode={courseColorMode}
                onCourseColorModeChange={onCourseColorModeChange}
                mapDisplaySettings={mapDisplaySettings}
                onMapDisplaySettingsChange={onMapDisplaySettingsChange}
                showOpenOnly={showOpenOnly}
                onShowOpenOnlyChange={onShowOpenOnlyChange}
                mapTileVariant={mapTileVariant}
                onMapTileVariantChange={onMapTileVariantChange}
              />
            ) : (
              <SlopeMapCardShell resort={resort} className="h-full">
                <SlopeMapPlaceholder />
              </SlopeMapCardShell>
            )}
          </div>
        ))}
      </div>

      <CompareCarouselPager
        ids={resorts.map(resort => resort.id)}
        activeIndex={activeIndex}
        onIndexChange={scrollToIndex}
      />
    </div>
  );
};

/**
 * 比較のゲレンデ表示（デスクトップ）。左側の地図エリアを丸ごと使う。
 *
 * 幅に応じて 1〜3 列（3 列は非常に広い画面だけ）で並べる。
 * 地図で埋め尽くすと、ホイールもドラッグも地図に吸われて縦スクロールできなく
 * なるため、余白・カード見出し・右端のスクロールバー領域を必ず残す。
 * 色分け・地図種別はタブ行のツールバー（SkiResortCompareView）、営業フィルターは各地図に置く。
 * ここでは全カードへ同じ値を配る。
 * 地図は見えているカードとその近くだけ作り、見た分は上限まで残す。
 * 件数が増えてもブラウザの地図の上限に届かないようにするため。
 */
export const CompareSlopeMapBoard = ({
  resorts,
  DynamicMap,
  mapResorts,
  courseColorMode,
  onCourseColorModeChange,
  mapDisplaySettings,
  onMapDisplaySettingsChange,
  showOpenOnly,
  onShowOpenOnlyChange,
  mapTileVariant,
  onMapTileVariantChange,
  selection,
  onSelectionChange,
  onMapResortsNeeded,
  className,
  style,
}: {
  resorts: Resort[];
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  /** 見えているスキー場。地図データを先に取るために知らせる */
  onMapResortsNeeded?: (ids: string[]) => void;
  courseColorMode: CourseColorMode;
  onCourseColorModeChange: (mode: CourseColorMode) => void;
  mapDisplaySettings?: MapDisplaySettings;
  onMapDisplaySettingsChange?: (settings: MapDisplaySettings) => void;
  showOpenOnly: boolean;
  onShowOpenOnlyChange: (showOpenOnly: boolean) => void;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  selection: CompareSlopeSelection | null;
  onSelectionChange: (selection: CompareSlopeSelection | null) => void;
  className?: string;
  style?: CSSProperties;
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const resortIdsKey = resorts.map(resort => resort.id).join(",");
  const [liveMapIds, setLiveMapIds] = useState<string[]>([]);
  const setCardRef = useCallback(
    (id: string, element: HTMLDivElement | null) => {
      if (element) cardRefs.current.set(id, element);
      else cardRefs.current.delete(id);
    },
    [],
  );

  // 見えているカード（少し先まで含む）を監視し、その順に地図を作る
  useEffect(() => {
    const root = scrollRef.current;
    const resortIds = resortIdsKey ? resortIdsKey.split(",") : [];
    if (!root || resortIds.length === 0) return;
    const visible = new Set<string>();
    const apply = () => {
      const priority = resortIds.filter(id => visible.has(id));
      onMapResortsNeeded?.(priority);
      setLiveMapIds(previous =>
        nextLiveMapIds(
          previous,
          priority,
          resortIds,
          MAX_LIVE_SLOPE_MAPS.desktop,
        ),
      );
    };
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.resortId;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        apply();
      },
      // 1 画面分先まで先に作っておく。スクロールした先で地図を待たせない
      { root, rootMargin: "100% 0px" },
    );
    for (const id of resortIds) {
      const element = cardRefs.current.get(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [resortIdsKey, onMapResortsNeeded]);

  return (
    <div
      ref={scrollRef}
      style={style}
      className={cn(
        "compare-board-scroll @container overflow-y-auto overscroll-contain bg-gray-50",
        className,
      )}
    >
      {resorts.length === 0 ? (
        <EmptyMessage />
      ) : (
        <div className="grid grid-cols-1 gap-6 @[52rem]:grid-cols-2 @[84rem]:grid-cols-3">
          {resorts.map(resort => (
            <div
              key={resort.id}
              data-resort-id={resort.id}
              ref={element => setCardRef(resort.id, element)}
            >
              {liveMapIds.includes(resort.id) ? (
                <ResortSlopeMapCard
                  resort={resort}
                  DynamicMap={DynamicMap}
                  mapResorts={mapResorts}
                  selection={
                    selection?.resortId === resort.id
                      ? selection
                      : EMPTY_SELECTION
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
                  compactControls
                  courseColorMode={courseColorMode}
                  onCourseColorModeChange={onCourseColorModeChange}
                  mapDisplaySettings={mapDisplaySettings}
                  onMapDisplaySettingsChange={onMapDisplaySettingsChange}
                  showOpenOnly={showOpenOnly}
                  onShowOpenOnlyChange={onShowOpenOnlyChange}
                  mapTileVariant={mapTileVariant}
                  onMapTileVariantChange={onMapTileVariantChange}
                />
              ) : (
                <SlopeMapCardShell
                  resort={resort}
                  className="h-[46vh] min-h-[340px] shadow-sm"
                >
                  <SlopeMapPlaceholder />
                </SlopeMapCardShell>
              )}
            </div>
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
  const selectedCourseGroup = findSelectedCourseGroup(
    courseGroups,
    selection.feature,
  );
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
          resortId={resort.id}
          mapData={resort.finalizedMapData ?? null}
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
      <div className="mt-1 flex items-center gap-2">
        <OperationCount label="コース" summary={getCourseSummary(resort)} />
        <OperationCount label="リフト" summary={getLiftSummary(resort)} lift />
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
  compactControls = false,
  courseColorMode,
  onCourseColorModeChange,
  mapDisplaySettings,
  onMapDisplaySettingsChange,
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
  /** 拡大・縮小と方位のボタンを小さい版にする */
  compactControls?: boolean;
  courseColorMode?: CourseColorMode;
  onCourseColorModeChange?: (mode: CourseColorMode) => void;
  mapDisplaySettings?: MapDisplaySettings;
  onMapDisplaySettingsChange?: (settings: MapDisplaySettings) => void;
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
  const selectedCourseGroup = findSelectedCourseGroup(
    courseGroups,
    selection.feature,
  );
  const selectedLift =
    selection.feature?.kind === "lift"
      ? (resort.finalizedMapData?.lifts?.features.find(
          lift => lift.id === selection.feature?.id,
        ) ?? null)
      : null;
  const featureDetail =
    selectedCourseGroup || selectedLift ? (
      <FinalizedFeatureDetail
        resortId={resort.id}
        mapData={resort.finalizedMapData ?? null}
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
        // 「営業中のみ」は比較全体で 1 つ。上の帯に出すので地図には出さない
        showOpenOnlyControl={false}
        compactControls={compactControls}
        previewHeightClassName="min-h-0 flex-1"
        selectedHeightClassName="h-[48%] min-h-[160px] shrink-0"
        allowPreviewInteraction={allowPreviewInteraction}
        blockPreviewPointerEvents={!allowPreviewInteraction}
        courseColorMode={courseColorMode}
        onCourseColorModeChange={onCourseColorModeChange}
        mapDisplaySettings={mapDisplaySettings}
        onMapDisplaySettingsChange={onMapDisplaySettingsChange}
        showOpenOnly={showOpenOnly}
        onShowOpenOnlyChange={onShowOpenOnlyChange}
        mapTileVariant={mapTileVariant}
        onMapTileVariantChange={onMapTileVariantChange}
      />
    </SlopeMapCardShell>
  );
};
