"use client";

import type L from "leaflet";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
} from "@/lib/finalizedResortGeojsonShared";
import type { MapSkiResort } from "@/types/skiResorts";
import { VIEWPORT_PADDING_RATIO_CHANGE_THRESHOLD } from "../constants";
import type {
  MapViewRestoreRequest,
  MapViewSnapshot,
  SelectedMapFeature,
} from "../types";
import { getFeatureBounds } from "../utils/finalizedMapData";
import {
  fitResortsInViewport,
  getComparePanelOverlapRightWidth,
  getDetailPanelOverlapRightWidth,
  getPanelAdjustedCenter,
  getSafeFitPadding,
} from "../utils/viewport";

export const MapEventsHandler = ({
  onBoundsChange,
  onViewChange,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: {
  onBoundsChange: (bounds: L.LatLngBounds) => void;
  onViewChange?: (view: MapViewSnapshot) => void;
  onUserMapInteraction?: () => void;
  onUserMapZoomInteraction?: () => void;
}) => {
  const map = useMap();
  const hasUserZoomInteractionRef = useRef(false);
  const zoomInteractionFallbackTimeoutRef = useRef<number | null>(null);
  const notifyViewportChange = useCallback(() => {
    const center = map.getCenter();
    onBoundsChange(map.getBounds());
    onViewChange?.({
      center: { lat: center.lat, lng: center.lng },
      zoom: map.getZoom(),
    });
  }, [map, onBoundsChange, onViewChange]);
  const clearZoomInteractionFallback = useCallback(() => {
    if (zoomInteractionFallbackTimeoutRef.current === null) return;

    window.clearTimeout(zoomInteractionFallbackTimeoutRef.current);
    zoomInteractionFallbackTimeoutRef.current = null;
  }, []);
  const completeUserZoomInteraction = useCallback(() => {
    clearZoomInteractionFallback();
    if (!hasUserZoomInteractionRef.current) return;

    hasUserZoomInteractionRef.current = false;
    onUserMapZoomInteraction?.();
  }, [clearZoomInteractionFallback, onUserMapZoomInteraction]);
  const markUserZoomInteraction = useCallback(() => {
    hasUserZoomInteractionRef.current = true;
  }, []);

  useMapEvents({
    dragstart: () => {
      onUserMapInteraction?.();
    },
    zoomstart: () => {
      clearZoomInteractionFallback();
    },
    zoomend: () => {
      notifyViewportChange();
      completeUserZoomInteraction();
    },
    moveend: notifyViewportChange,
  });

  useEffect(() => {
    const container = map.getContainer();
    const scheduleFallback = () => {
      clearZoomInteractionFallback();
      zoomInteractionFallbackTimeoutRef.current = window.setTimeout(() => {
        zoomInteractionFallbackTimeoutRef.current = null;
        completeUserZoomInteraction();
      }, 180);
    };
    const handleWheel = () => {
      markUserZoomInteraction();
      completeUserZoomInteraction();
    };
    const handleDoubleClick = () => {
      markUserZoomInteraction();
      completeUserZoomInteraction();
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;

      markUserZoomInteraction();
      completeUserZoomInteraction();
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!hasUserZoomInteractionRef.current || event.touches.length > 0) {
        return;
      }

      scheduleFallback();
    };

    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("dblclick", handleDoubleClick);
    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    container.addEventListener("touchcancel", handleTouchEnd, {
      passive: true,
    });

    return () => {
      clearZoomInteractionFallback();
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("dblclick", handleDoubleClick);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [
    clearZoomInteractionFallback,
    completeUserZoomInteraction,
    map,
    markUserZoomInteraction,
  ]);

  useEffect(() => {
    notifyViewportChange();
  }, [notifyViewportChange]);

  return null;
};

export const MapZoomSettingsController = ({
  initialZoom,
  zoomSnap,
  zoomDelta,
}: {
  initialZoom: number;
  zoomSnap: number;
  zoomDelta: number;
}) => {
  const map = useMap();

  useEffect(() => {
    map.options.zoomSnap = zoomSnap;
    map.options.zoomDelta = zoomDelta;

    if (zoomSnap >= 1) {
      const roundedZoom = Math.max(initialZoom, Math.round(map.getZoom()));
      if (Math.abs(map.getZoom() - roundedZoom) > 0.001) {
        map.setZoom(roundedZoom);
      }
    }
  }, [initialZoom, map, zoomDelta, zoomSnap]);

  return null;
};

export const RestoreViewportController = ({
  restoreViewRequest,
  onViewportChange,
}: {
  restoreViewRequest: MapViewRestoreRequest | null;
  onViewportChange: (map: L.Map) => void;
}) => {
  const map = useMap();
  const lastRestoreKeyRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      !restoreViewRequest ||
      restoreViewRequest.key === lastRestoreKeyRef.current
    ) {
      return;
    }

    lastRestoreKeyRef.current = restoreViewRequest.key;
    map.setView(
      [restoreViewRequest.center.lat, restoreViewRequest.center.lng],
      restoreViewRequest.zoom,
      { animate: true },
    );
    onViewportChange(map);
  }, [map, onViewportChange, restoreViewRequest]);

  return null;
};

export const SelectedFinalizedFeatureViewportController = ({
  selectedFeature,
  selectedCourses,
  selectedLift,
  bottomPaddingRatio,
}: {
  selectedFeature: SelectedMapFeature | null;
  selectedCourses: FinalizedCourseFeature[];
  selectedLift: FinalizedLiftFeature | null;
  bottomPaddingRatio: number;
}) => {
  const map = useMap();
  const lastSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedFeature) {
      lastSelectedRef.current = null;
      return;
    }

    const key = `${selectedFeature.kind}:${selectedFeature.id}`;
    if (lastSelectedRef.current === key) return;
    lastSelectedRef.current = key;

    const coordinates =
      selectedFeature.kind === "course"
        ? selectedCourses.flatMap(course => course.coordinates)
        : selectedLift?.coordinates;
    if (!coordinates || coordinates.length < 2) return;

    const bottomPanelHeight = map.getSize().y * bottomPaddingRatio;
    const rightPanelWidth = getDetailPanelOverlapRightWidth(map);
    const fitPadding = getSafeFitPadding(
      map,
      rightPanelWidth,
      bottomPanelHeight,
    );

    map.fitBounds(getFeatureBounds(coordinates), {
      animate: true,
      ...fitPadding,
    });
  }, [bottomPaddingRatio, map, selectedCourses, selectedFeature, selectedLift]);

  return null;
};

export const LabelLayoutWatcher = ({
  onLayout,
}: {
  onLayout: (map: L.Map) => void;
}) => {
  const map = useMap();
  const layoutFrameRef = useRef<number | null>(null);
  const scheduleLayout = useCallback(() => {
    if (layoutFrameRef.current !== null) {
      return;
    }
    layoutFrameRef.current = window.requestAnimationFrame(() => {
      layoutFrameRef.current = null;
      onLayout(map);
    });
  }, [map, onLayout]);

  useMapEvents({
    zoomend: scheduleLayout,
    moveend: scheduleLayout,
    resize: scheduleLayout,
  });

  useEffect(() => {
    scheduleLayout();
    return () => {
      if (layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = null;
      }
    };
  }, [scheduleLayout]);

  return null;
};

export const SearchViewportController = ({
  enabled,
  resorts,
  searchResultResortIds,
  searchViewportRequestKey,
  searchViewportBottomPaddingRatio,
  labelShowZoom,
  onViewportChange,
}: {
  enabled: boolean;
  resorts: MapSkiResort[];
  searchResultResortIds: string[];
  searchViewportRequestKey: number;
  searchViewportBottomPaddingRatio: number;
  labelShowZoom: number;
  onViewportChange: (map: L.Map) => void;
}) => {
  const map = useMap();
  const lastRequestKeyRef = useRef(searchViewportRequestKey);
  const lastBottomPaddingRatioRef = useRef(searchViewportBottomPaddingRatio);

  useEffect(() => {
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
    const searchResultResorts = resorts.filter(resort =>
      searchResultResortIdSet.has(resort.id),
    );

    fitResortsInViewport({
      map,
      resorts: searchResultResorts,
      bottomPanelHeight: map.getSize().y * searchViewportBottomPaddingRatio,
      labelShowZoom,
    });
    onViewportChange(map);
  }, [
    map,
    enabled,
    onViewportChange,
    resorts,
    searchResultResortIds,
    searchViewportRequestKey,
    searchViewportBottomPaddingRatio,
    labelShowZoom,
  ]);

  return null;
};

export const MapViewportController = ({
  initialZoom,
  resorts,
  finalizedBounds,
  selectedResortId,
  selectedCompareIdSet,
  interactionMode,
  selectedViewportBottomPaddingRatio,
  labelShowZoom,
  onViewportChange,
  skipCompareRecenterRef,
}: {
  initialZoom: number;
  resorts: MapSkiResort[];
  finalizedBounds: L.LatLngBounds | null;
  selectedResortId: string | null;
  selectedCompareIdSet: Set<string>;
  interactionMode: "default" | "detail" | "compare";
  selectedViewportBottomPaddingRatio: number;
  labelShowZoom: number;
  onViewportChange: (map: L.Map) => void;
  skipCompareRecenterRef?: React.MutableRefObject<boolean>;
}) => {
  const map = useMap();

  useEffect(() => {
    map.setMinZoom(initialZoom);
  }, [initialZoom, map]);

  useEffect(() => {
    if (interactionMode === "detail" && selectedResortId) {
      const resort = resorts.find(resort => resort.id === selectedResortId);
      if (!resort) return;

      const sidePanelWidth = getDetailPanelOverlapRightWidth(map);
      const bottomPanelHeight =
        map.getSize().y * selectedViewportBottomPaddingRatio;
      if (finalizedBounds?.isValid()) {
        map.fitBounds(finalizedBounds, {
          animate: true,
          maxZoom: 15,
          ...getSafeFitPadding(map, sidePanelWidth, bottomPanelHeight),
        });
        onViewportChange(map);
        return;
      }

      const resortLatLng: L.LatLngTuple = [resort.latitude, resort.longitude];
      const targetZoom = Math.max(map.getZoom(), labelShowZoom);
      map.setView(
        getPanelAdjustedCenter(
          map,
          resortLatLng,
          sidePanelWidth,
          bottomPanelHeight,
          targetZoom,
        ),
        targetZoom,
        { animate: true },
      );
      onViewportChange(map);
      return;
    }

    if (interactionMode === "compare" && selectedCompareIdSet.size > 0) {
      if (skipCompareRecenterRef?.current) {
        skipCompareRecenterRef.current = false;
        return;
      }
      const selectedResorts = resorts.filter(resort =>
        selectedCompareIdSet.has(resort.id),
      );
      if (selectedResorts.length === 0) return;

      const sidePanelWidth = getComparePanelOverlapRightWidth(map);
      fitResortsInViewport({
        map,
        resorts: selectedResorts,
        rightPanelWidth: sidePanelWidth,
        labelShowZoom,
      });
      onViewportChange(map);
    }
  }, [
    interactionMode,
    finalizedBounds,
    labelShowZoom,
    map,
    onViewportChange,
    resorts,
    selectedCompareIdSet,
    selectedResortId,
    selectedViewportBottomPaddingRatio,
    skipCompareRecenterRef,
  ]);

  return null;
};
