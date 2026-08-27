"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  ElevationProfileMapPoint,
  JapanResortMapProps,
  SelectedMapFeature,
} from "@/features/map/types";
import { FinalizedFeatureDetail } from "@/features/resort-detail/components/FinalizedFeatureDetail";
import { ResortMapSection } from "@/features/resort-detail/components/ResortMapSection";
import { createFinalizedCourseGroups } from "@/features/resort-detail/utils/detailMetrics";
import { getResortLabelName, getResortSearchName } from "@/lib/resortAliases";
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

const formatCount = (value: number | null | undefined) =>
  value == null ? "--" : `${value}`;

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
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scroll-touch flex h-full min-h-0 w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
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
 */
export const CompareSlopeMapBoard = ({
  resorts,
  DynamicMap,
  mapResorts,
  className,
  style,
}: {
  resorts: Resort[];
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  className?: string;
  style?: CSSProperties;
}) => {
  const { selectionByResortId, setSelection } = useSlopeMapSelection();

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
              selection={selectionByResortId[resort.id] ?? EMPTY_SELECTION}
              onSelectionChange={next => setSelection(resort.id, next)}
              className="h-[46vh] min-h-[340px] shadow-sm"
              allowPreviewInteraction
            />
          ))}
        </div>
      )}
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
    <div className="shrink-0 px-3 py-2">
      <p className="truncate text-sm font-bold text-gray-900 font-[var(--font-heading)]">
        {getResortLabelName(resort.id, resort.nameJa)}
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-gray-500">
        コース {formatCount(resort.numberOfCourses)} ・ リフト{" "}
        {formatCount(resort.numberOfLifts)} ・ 標高差{" "}
        {resort.verticalDrop.toLocaleString()}m
      </p>
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
}: {
  resort: Resort;
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  selection: FeatureSelection;
  onSelectionChange: (next: Partial<FeatureSelection>) => void;
  className?: string;
  /** デスクトップの並びは、その場で地図を動かせるようにする */
  allowPreviewInteraction?: boolean;
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
        previewHeightClassName="min-h-0 flex-1"
        selectedHeightClassName="h-[48%] min-h-[160px] shrink-0"
        allowPreviewInteraction={allowPreviewInteraction}
        blockPreviewPointerEvents={!allowPreviewInteraction}
      />
    </SlopeMapCardShell>
  );
};
