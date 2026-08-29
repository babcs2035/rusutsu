"use client";

import type { ComponentType } from "react";
import { useMemo } from "react";
import type {
  FinalizedResortMapData,
  GeoCoordinate,
} from "@/lib/finalizedResortGeojsonShared";
import { cn } from "@/lib/utils";
import type { MapSkiResort } from "@/types/skiResorts";
import type {
  CourseColorMode,
  ElevationProfileMapPoint,
  JapanResortMapProps,
  MapTileVariant,
  SelectedMapFeature,
} from "../types";

const EMPTY_COMPARE_ID_SET = new Set<string>();
/** 1 スキー場だけを出す地図の初期ズーム。この後で実際の範囲へ合わせ直す */
const RESORT_INITIAL_ZOOM = 13;

const getCoordinatesCenter = (
  coordinates: GeoCoordinate[],
): [number, number] | null => {
  if (coordinates.length === 0) return null;

  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
};

type Props = {
  DynamicMap: ComponentType<JapanResortMapProps>;
  resortId: string;
  finalizedMapData: FinalizedResortMapData | null;
  mapResorts: MapSkiResort[];
  /**
   * "preview" は操作を受け付けない小さな地図。
   * "expanded" は操作もツールバーもある地図。
   */
  presentation: "preview" | "expanded";
  /** コースマップ用ツールバーを出すか。狭い地図では畳む */
  showToolbar?: boolean;
  /**
   * 表示設定を呼び出し側で持つ場合に渡す。
   * 比較のゲレンデ一覧のように、複数の地図へ同じ設定を効かせるときに使う。
   */
  courseColorMode?: CourseColorMode;
  onCourseColorModeChange?: (mode: CourseColorMode) => void;
  showOpenOnly?: boolean;
  onShowOpenOnlyChange?: (showOpenOnly: boolean) => void;
  mapTileVariant?: MapTileVariant;
  onMapTileVariantChange?: (variant: MapTileVariant) => void;
  selectedFinalizedFeature: SelectedMapFeature | null;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
  /** 下に重なるパネルの高さ比。選択したコースがその下に潜らないようにする */
  bottomPaddingRatio?: number;
  detailViewportResetKey?: number;
  className?: string;
};

/**
 * 1 スキー場のコース・リフト地図。
 *
 * 詳細画面（プレビュー / 全画面）と比較画面のゲレンデタブが同じ配線を使う。
 * DynamicMap の props をここに集約して、呼び出し側では
 * 「どのスキー場を、どの大きさで、何を選んだ状態で出すか」だけを決める。
 */
export const ResortFinalizedMap = ({
  DynamicMap,
  resortId,
  finalizedMapData,
  mapResorts,
  presentation,
  showToolbar = true,
  courseColorMode,
  onCourseColorModeChange,
  showOpenOnly,
  onShowOpenOnlyChange,
  mapTileVariant,
  onMapTileVariantChange,
  selectedFinalizedFeature,
  selectedElevationProfilePoint,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
  bottomPaddingRatio = 0,
  detailViewportResetKey = 0,
  className,
}: Props) => {
  const selectedResortIdSet = useMemo(() => new Set([resortId]), [resortId]);
  const hasFinalizedMap =
    (finalizedMapData?.courses?.features.length ?? 0) > 0 ||
    (finalizedMapData?.lifts?.features.length ?? 0) > 0;

  // 生成した瞬間からこのスキー場を描く。既定の日本全体から寄せると、
  // 拡大やスワイプのたびに白地図が一瞬見えてしまう。
  const initialViewport = useMemo(() => {
    const center =
      getCoordinatesCenter([
        ...(finalizedMapData?.courses?.features ?? []).flatMap(
          course => course.coordinates,
        ),
        ...(finalizedMapData?.lifts?.features ?? []).flatMap(
          lift => lift.coordinates,
        ),
      ]) ??
      (() => {
        const resort = mapResorts.find(candidate => candidate.id === resortId);
        return resort
          ? ([resort.longitude, resort.latitude] as [number, number])
          : null;
      })();

    return center ? { center, zoom: RESORT_INITIAL_ZOOM } : null;
  }, [finalizedMapData, mapResorts, resortId]);

  // コースマップと周辺位置は分けない。縮小すればスキー場名のラベルが出るので、
  // 1 枚の地図で両方の役割を兼ねられる。
  const mapFinalizedData = hasFinalizedMap ? finalizedMapData : null;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <DynamicMap
        resorts={mapResorts}
        filteredResortIdSet={selectedResortIdSet}
        isFilterActive={false}
        selectedResortId={resortId}
        selectedCompareIdSet={EMPTY_COMPARE_ID_SET}
        interactionMode="detail"
        finalizedMapData={mapFinalizedData}
        mapPresentation={presentation}
        initialViewport={initialViewport}
        showMapToolbar={showToolbar}
        courseColorMode={courseColorMode}
        onCourseColorModeChange={onCourseColorModeChange}
        showOpenOnly={showOpenOnly}
        onShowOpenOnlyChange={onShowOpenOnlyChange}
        mapTileVariant={mapTileVariant}
        onMapTileVariantChange={onMapTileVariantChange}
        detailViewportMode={hasFinalizedMap ? "finalized" : "resort"}
        detailViewportResetKey={detailViewportResetKey}
        selectedFinalizedFeature={selectedFinalizedFeature}
        selectedElevationProfilePoint={selectedElevationProfilePoint}
        selectedViewportBottomPaddingRatio={bottomPaddingRatio}
        onBoundsChange={() => undefined}
        onSelectResort={() => undefined}
        onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
        onSelectedElevationProfilePointChange={
          onSelectedElevationProfilePointChange
        }
      />
    </div>
  );
};
