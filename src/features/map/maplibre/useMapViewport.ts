"use client";

import type { LngLatBounds, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
} from "@/lib/finalizedResortGeojsonShared";
import type { MapSkiResort } from "@/types/skiResorts";
import { VIEWPORT_PADDING_RATIO_CHANGE_THRESHOLD } from "../constants";
import type { MapViewRestoreRequest, SelectedMapFeature } from "../types";
import {
  fitResortsInViewport,
  getComparePanelOverlapRightWidth,
  getCoordinateBounds,
  getDetailPanelOverlapRightWidth,
  getMapSize,
  getMoveOptions,
  getPanelOffset,
  getSafeFitPadding,
} from "./viewport";

/** スキー場詳細でコース全体を見せるときの上限。寄りすぎないようにする */
const DETAIL_FIT_MAX_ZOOM = 15;

/**
 * 選択したスキー場（詳細）と、比較中のスキー場に地図を合わせる。
 * Leaflet 版の MapViewportController と同じ振る舞いにしている。
 */
export const useResortViewport = ({
  map,
  isReady,
  initialZoom,
  resorts,
  finalizedBounds,
  selectedResortId,
  selectedCompareIdSet,
  interactionMode,
  detailViewportMode,
  selectedViewportBottomPaddingRatio,
  labelShowZoom,
  animate,
  skipCompareRecenterRef,
  viewportResetKey = 0,
}: {
  map: MapLibreMap | null;
  isReady: boolean;
  initialZoom: number;
  resorts: MapSkiResort[];
  finalizedBounds: LngLatBounds | null;
  selectedResortId: string | null;
  selectedCompareIdSet: Set<string>;
  interactionMode: "default" | "detail" | "compare";
  detailViewportMode: "finalized" | "resort";
  selectedViewportBottomPaddingRatio: number;
  labelShowZoom: number;
  /** モバイルでは動かす様子を見せずに、開いた時点でその場所を出す */
  animate: boolean;
  skipCompareRecenterRef?: React.RefObject<boolean>;
  /** 値が変わるたびに詳細の表示範囲を組み直す（コース選択の解除など） */
  viewportResetKey?: number;
}) => {
  useEffect(() => {
    if (!map || !isReady) return;
    map.setMinZoom(initialZoom);
  }, [initialZoom, isReady, map]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: viewportResetKey は「もう一度合わせ直す」合図なので、本文では読まずに依存にだけ置く
  useEffect(() => {
    if (!map || !isReady) return;

    if (interactionMode === "detail" && selectedResortId) {
      const resort = resorts.find(resort => resort.id === selectedResortId);
      if (!resort) return;

      // 右パネルを避けて左へずらすと、選んだスキー場が画面中央からずれて
      // 見えてしまう。素直に選んだ場所へズームするため、水平方向は詰めない。
      const rightPanelWidth = 0;
      const bottomPanelHeight =
        getMapSize(map).y * selectedViewportBottomPaddingRatio;

      if (detailViewportMode === "finalized" && finalizedBounds) {
        map.fitBounds(finalizedBounds, {
          maxZoom: DETAIL_FIT_MAX_ZOOM,
          padding: getSafeFitPadding(map, rightPanelWidth, bottomPanelHeight),
          bearing: map.getBearing(),
          ...getMoveOptions(animate),
        });
        return;
      }

      map.easeTo({
        center: [resort.longitude, resort.latitude],
        zoom: Math.max(map.getZoom(), labelShowZoom),
        offset: getPanelOffset(rightPanelWidth, bottomPanelHeight),
        ...getMoveOptions(animate),
      });
      return;
    }

    if (interactionMode === "compare" && selectedCompareIdSet.size > 0) {
      // 吹き出しから比較に足したときは、地図を動かさない
      if (skipCompareRecenterRef?.current) {
        skipCompareRecenterRef.current = false;
        return;
      }

      const selectedResorts = resorts.filter(resort =>
        selectedCompareIdSet.has(resort.id),
      );
      if (selectedResorts.length === 0) return;

      fitResortsInViewport({
        map,
        resorts: selectedResorts,
        rightPanelWidth: getComparePanelOverlapRightWidth(map),
        labelShowZoom,
        animate,
      });
    }
  }, [
    animate,
    detailViewportMode,
    finalizedBounds,
    interactionMode,
    isReady,
    labelShowZoom,
    map,
    resorts,
    selectedCompareIdSet,
    selectedResortId,
    selectedViewportBottomPaddingRatio,
    skipCompareRecenterRef,
    viewportResetKey,
  ]);
};

/** 検索結果に地図を合わせる */
export const useSearchViewport = ({
  map,
  isReady,
  enabled,
  resorts,
  searchResultResortIds,
  searchViewportRequestKey,
  searchViewportBottomPaddingRatio,
  labelShowZoom,
  animate,
}: {
  map: MapLibreMap | null;
  isReady: boolean;
  enabled: boolean;
  resorts: MapSkiResort[];
  searchResultResortIds: string[];
  searchViewportRequestKey: number;
  searchViewportBottomPaddingRatio: number;
  labelShowZoom: number;
  animate: boolean;
}) => {
  const lastRequestKeyRef = useRef(0);
  const lastBottomPaddingRatioRef = useRef(searchViewportBottomPaddingRatio);

  useEffect(() => {
    if (!map || !isReady) return;

    const hasNewSearchRequest =
      searchViewportRequestKey !== lastRequestKeyRef.current;
    const hasBottomPaddingChanged =
      Math.abs(
        searchViewportBottomPaddingRatio - lastBottomPaddingRatioRef.current,
      ) > VIEWPORT_PADDING_RATIO_CHANGE_THRESHOLD;
    if (
      !enabled ||
      searchViewportRequestKey === 0 ||
      (!hasNewSearchRequest && !hasBottomPaddingChanged)
    ) {
      return;
    }

    lastRequestKeyRef.current = searchViewportRequestKey;
    lastBottomPaddingRatioRef.current = searchViewportBottomPaddingRatio;

    const searchResultResortIdSet = new Set(searchResultResortIds);
    fitResortsInViewport({
      map,
      resorts: resorts.filter(resort => searchResultResortIdSet.has(resort.id)),
      bottomPanelHeight: getMapSize(map).y * searchViewportBottomPaddingRatio,
      labelShowZoom,
      animate,
    });
  }, [
    animate,
    enabled,
    isReady,
    labelShowZoom,
    map,
    resorts,
    searchResultResortIds,
    searchViewportBottomPaddingRatio,
    searchViewportRequestKey,
  ]);
};

/** 詳細画面から戻ったときに、元の見え方へ復帰させる */
export const useRestoreViewport = ({
  map,
  isReady,
  restoreViewRequest,
  animate,
}: {
  map: MapLibreMap | null;
  isReady: boolean;
  restoreViewRequest: MapViewRestoreRequest | null;
  animate: boolean;
}) => {
  const lastRestoreKeyRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map || !isReady) return;
    if (
      !restoreViewRequest ||
      restoreViewRequest.key === lastRestoreKeyRef.current
    ) {
      return;
    }

    lastRestoreKeyRef.current = restoreViewRequest.key;
    map.easeTo({
      center: [restoreViewRequest.center.lng, restoreViewRequest.center.lat],
      zoom: restoreViewRequest.zoom,
      ...getMoveOptions(animate),
    });
  }, [animate, isReady, map, restoreViewRequest]);
};

/** 選択したコース・リフトが画面に収まるように寄る */
export const useSelectedFeatureViewport = ({
  map,
  isReady,
  selectedFeature,
  selectedCourses,
  selectedLift,
  bottomPaddingRatio,
  animate,
}: {
  map: MapLibreMap | null;
  isReady: boolean;
  selectedFeature: SelectedMapFeature | null;
  selectedCourses: FinalizedCourseFeature[];
  selectedLift: FinalizedLiftFeature | null;
  bottomPaddingRatio: number;
  animate: boolean;
}) => {
  const lastSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!map || !isReady) return;
    if (!selectedFeature) {
      lastSelectedRef.current = null;
      return;
    }

    // 同じものを選び直したときに動かさないよう、キーで覚えておく
    const key = `${selectedFeature.kind}:${selectedFeature.id}`;
    if (lastSelectedRef.current === key) return;
    lastSelectedRef.current = key;

    const coordinates =
      selectedFeature.kind === "course"
        ? selectedCourses.flatMap(course => course.coordinates)
        : selectedLift?.coordinates;
    if (!coordinates || coordinates.length < 2) return;

    const bounds = getCoordinateBounds(coordinates);
    if (!bounds) return;

    map.fitBounds(bounds, {
      padding: getSafeFitPadding(
        map,
        getDetailPanelOverlapRightWidth(map),
        getMapSize(map).y * bottomPaddingRatio,
      ),
      // 回したまま選んでも向きを変えない
      bearing: map.getBearing(),
      ...getMoveOptions(animate),
    });
  }, [
    animate,
    bottomPaddingRatio,
    isReady,
    map,
    selectedCourses,
    selectedFeature,
    selectedLift,
  ]);
};
