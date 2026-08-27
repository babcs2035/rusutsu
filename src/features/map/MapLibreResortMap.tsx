"use client";

import type {
  GeoJSONSource,
  MapLayerMouseEvent,
  MapMouseEvent,
} from "maplibre-gl";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { FinalizedMapToolbar } from "./components/FinalizedMapToolbar";
import {
  COARSE_POINTER_MEDIA_QUERY,
  DESKTOP_INITIAL_ZOOM,
  DESKTOP_LABEL_ADVANCED_LAYOUT_ZOOM,
  DESKTOP_LABEL_SHOW_ZOOM,
  FINALIZED_RESORT_LABEL_HIDE_MIN_ZOOM,
  MOBILE_INITIAL_ZOOM,
  MOBILE_LABEL_ADVANCED_LAYOUT_ZOOM,
  MOBILE_LABEL_SHOW_ZOOM,
  MOBILE_MAP_MEDIA_QUERY,
} from "./constants";
import { useDetailPanelRightOverlap } from "./hooks/useDetailPanelRightOverlap";
import { useFinalizedMapFeatures } from "./hooks/useFinalizedMapFeatures";
import { useJapanMapLabelLayout } from "./hooks/useJapanMapLabelLayout";
import { useResortAliases } from "./hooks/useResortAliases";
import { BASE_RASTER_LAYER_ID, getRasterTone } from "./maplibre/baseStyle";
import {
  applyFinalizedStyleState,
  FINALIZED_LAYER,
  FINALIZED_SOURCE,
  type FinalizedStyleState,
} from "./maplibre/finalizedLayers";
import { MapLibreControls } from "./maplibre/MapLibreControls";
import { MapLibreResortActionPopup } from "./maplibre/MapLibreResortActionPopup";
import {
  applyResortPointTileVariant,
  RESORT_POINT_LAYER,
} from "./maplibre/resortPointLayers";
import {
  buildCourseCollection,
  buildCourseOutlineCollection,
  buildLiftCollection,
} from "./maplibre/sources";
import { useElevationProfileMarker } from "./maplibre/useElevationProfileMarker";
import { useLiftAnimation } from "./maplibre/useLiftAnimation";
import { useLineLabelMarkers } from "./maplibre/useLineLabelMarkers";
import { useMapLibreMap } from "./maplibre/useMapLibreMap";
import {
  useResortViewport,
  useRestoreViewport,
  useSearchViewport,
  useSelectedFeatureViewport,
} from "./maplibre/useMapViewport";
import { useResortMarkers } from "./maplibre/useResortMarkers";
import { getCoordinateBounds } from "./maplibre/viewport";
import type {
  CourseColorMode,
  JapanResortMapProps,
  MapProjection,
  MapTileVariant,
  SelectedMapFeature,
} from "./types";
import { getResortDisplayName } from "./utils/resortLabels";
import {
  getResortPriority,
  getResortPriorityRank,
} from "./utils/resortMarkerPriority";

export const MapLibreResortMap = memo(function MapLibreResortMap({
  resorts,
  filteredResortIdSet,
  isFilterActive = false,
  searchResultResortIds = [],
  searchViewportRequestKey = 0,
  searchViewportBottomPaddingRatio = 0,
  mapControlBottomPaddingRatio = 0,
  selectedResortId,
  selectedViewportBottomPaddingRatio = 0,
  hoveredResortId = null,
  onSelectResort,
  interactionMode = "default",
  selectedCompareIdSet,
  onToggleCompare,
  onBoundsChange,
  onViewChange,
  onUserMapInteraction,
  onUserMapZoomInteraction,
  restoreViewRequest = null,
  finalizedMapData = null,
  mapPresentation = "default",
  initialViewport = null,
  showMapToolbar = true,
  mapTileVariant: controlledMapTileVariant,
  onMapTileVariantChange,
  detailViewportMode = "finalized",
  detailViewportResetKey = 0,
  selectedFinalizedFeature: controlledSelectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
  selectedElevationProfilePoint = null,
  onSelectedElevationProfilePointChange,
}: JapanResortMapProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const skipCompareRecenterRef = useRef(false);
  const isPreviewMap = mapPresentation === "preview";
  const isDetailMap = interactionMode === "detail";
  const displayNameById = useResortAliases(resorts);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia(MOBILE_MAP_MEDIA_QUERY).matches,
  );
  const [isCoarsePointer, setIsCoarsePointer] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia(COARSE_POINTER_MEDIA_QUERY).matches,
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  // 詳細地図は最初のフレームから写真＋斜度で作る。
  // 既定（地図タイル）で作ってから切り替えると、白い淡色地図のタイルを
  // 読み込んでから写真の読み込みが始まり、切り替わるまで白い地図が見えてしまう。
  const [uncontrolledTileVariant, setUncontrolledTileVariant] =
    useState<MapTileVariant>(isDetailMap ? "photo" : "pale");
  const [courseColorMode, setCourseColorMode] = useState<CourseColorMode>(
    isDetailMap ? "slope" : "difficulty",
  );
  const [showOpenOnly, setShowOpenOnly] = useState(false);
  const [uncontrolledSelected, setUncontrolledSelected] =
    useState<SelectedMapFeature | null>(null);
  const [openActionPopupResortId, setOpenActionPopupResortId] = useState<
    string | null
  >(null);

  const mapTileVariant = controlledMapTileVariant ?? uncontrolledTileVariant;
  const setMapTileVariant = useCallback(
    (variant: MapTileVariant) => {
      setUncontrolledTileVariant(variant);
      onMapTileVariantChange?.(variant);
    },
    [onMapTileVariantChange],
  );
  const selectedFinalizedFeature =
    controlledSelectedFinalizedFeature === undefined
      ? uncontrolledSelected
      : controlledSelectedFinalizedFeature;
  const setSelectedFinalizedFeature = useCallback(
    (feature: SelectedMapFeature | null) => {
      setUncontrolledSelected(feature);
      onSelectedFinalizedFeatureChange?.(feature);
    },
    [onSelectedFinalizedFeatureChange],
  );
  const initialZoom = isMobile ? MOBILE_INITIAL_ZOOM : DESKTOP_INITIAL_ZOOM;

  // 詳細画面に入るときは写真＋斜度、選択画面に戻るときは地図を既定にする。
  // ref の初期値を interactionMode 自体ではなく null にしておくことで、
  // 詳細画面としてマウントされるインスタンス（モバイルのプレビュー地図など）
  // でもマウント直後に既定値を適用できるようにする。
  const previousInteractionModeRef = useRef<
    "default" | "detail" | "compare" | null
  >(null);
  // 色味と同じ理由で描画前に確定させる（useEffect だと 1 フレーム遅れる）
  useLayoutEffect(() => {
    const previousInteractionMode = previousInteractionModeRef.current;
    previousInteractionModeRef.current = interactionMode;
    if (previousInteractionMode === interactionMode) return;

    if (interactionMode === "detail") {
      setMapTileVariant("photo");
      setCourseColorMode("slope");
      return;
    }
    if (previousInteractionMode === "detail") {
      setMapTileVariant("pale");
    }
  }, [interactionMode, setMapTileVariant]);

  useEffect(() => {
    const queries = [
      [MOBILE_MAP_MEDIA_QUERY, setIsMobile],
      [COARSE_POINTER_MEDIA_QUERY, setIsCoarsePointer],
      ["(prefers-reduced-motion: reduce)", setPrefersReducedMotion],
    ] as const;
    const cleanups = queries.map(([query, setter]) => {
      const media = window.matchMedia(query);
      const sync = () => setter(media.matches);
      sync();
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    });
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  const { map, isReady } = useMapLibreMap({
    containerRef,
    initialZoom,
    tileVariant: mapTileVariant,
    // 詳細画面として作られる地図は 1 フレーム目から白黒にする
    initialTone: getRasterTone({
      variant: mapTileVariant,
      isDetailView: isDetailMap,
      courseColorMode,
      hasCourses: (finalizedMapData?.courses?.features.length ?? 0) > 0,
    }),
    hitWidth: isCoarsePointer ? 24 : 14,
    isInteractive: !isPreviewMap,
    initialViewport,
  });

  const {
    finalizedCourses,
    finalizedLifts,
    hasFinalizedCourses,
    hasFinalizedLifts,
    isFinalizedFocusMode,
    selectedCourses,
    selectedLift,
  } = useFinalizedMapFeatures({
    courseColorMode,
    finalizedMapData,
    interactionMode,
    selectedFinalizedFeature,
  });
  const hasFinalizedFeatures = hasFinalizedCourses || hasFinalizedLifts;

  // --- ソースの中身 -------------------------------------------------------
  const courseCollection = useMemo(
    () => buildCourseCollection(finalizedCourses, courseColorMode),
    [courseColorMode, finalizedCourses],
  );
  const courseOutlineCollection = useMemo(
    () => buildCourseOutlineCollection(finalizedCourses),
    [finalizedCourses],
  );
  const liftCollection = useMemo(
    () => buildLiftCollection(finalizedLifts),
    [finalizedLifts],
  );

  useEffect(() => {
    if (!map || !isReady) return;

    const entries = [
      [FINALIZED_SOURCE.courses, courseCollection],
      [FINALIZED_SOURCE.courseOutlines, courseOutlineCollection],
      [FINALIZED_SOURCE.lifts, liftCollection],
    ] as const;
    for (const [sourceId, data] of entries) {
      const source = map.getSource(sourceId) as GeoJSONSource | undefined;
      source?.setData(data);
    }
  }, [courseCollection, courseOutlineCollection, isReady, liftCollection, map]);

  // --- 見た目の状態 -------------------------------------------------------
  const styleState: FinalizedStyleState = useMemo(
    () => ({
      courseColorMode,
      showOpenOnly,
      selectedFeature: selectedFinalizedFeature,
      isFocusMode: isFinalizedFocusMode,
      tileVariant: mapTileVariant,
    }),
    [
      courseColorMode,
      isFinalizedFocusMode,
      mapTileVariant,
      selectedFinalizedFeature,
      showOpenOnly,
    ],
  );

  useEffect(() => {
    if (!map || !isReady) return;
    applyFinalizedStyleState(map, styleState);
  }, [isReady, map, styleState]);

  // タイル種別と色味。
  //
  // useEffect ではなく useLayoutEffect にする。通常の useEffect はブラウザが
  // 描いたあとに走るので、スキー場を選んだ直後の 1〜2 フレームだけ
  // 切り替え前の色味（カラーのまま）が見えてしまう。
  useLayoutEffect(() => {
    if (!map || !isReady) return;

    const tone = getRasterTone({
      variant: mapTileVariant,
      // コースデータの到着を待たない。待つと一段遅れて色が抜けてちらつく
      isDetailView: isDetailMap,
      courseColorMode,
      hasCourses: hasFinalizedCourses,
    });
    for (const variant of ["pale", "photo"] as const) {
      const layerId = BASE_RASTER_LAYER_ID[variant];
      if (!map.getLayer(layerId)) continue;

      map.setLayoutProperty(
        layerId,
        "visibility",
        variant === mapTileVariant ? "visible" : "none",
      );
      map.setPaintProperty(layerId, "raster-saturation", tone.saturation);
      map.setPaintProperty(layerId, "raster-contrast", tone.contrast);
      map.setPaintProperty(
        layerId,
        "raster-brightness-min",
        tone.brightnessMin,
      );
    }
    applyResortPointTileVariant(map, mapTileVariant);
  }, [
    courseColorMode,
    hasFinalizedCourses,
    isDetailMap,
    isReady,
    map,
    mapTileVariant,
  ]);

  // 回転はスキー場詳細画面の地図だけ
  const canRotate = isDetailMap && !isPreviewMap;
  useEffect(() => {
    if (!map || !isReady) return;

    if (canRotate) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      map.keyboard.enableRotation();
      return;
    }

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    if (map.getBearing() !== 0) map.setBearing(0);
  }, [canRotate, isReady, map]);

  // --- 操作の通知 ---------------------------------------------------------
  useEffect(() => {
    if (!map || !isReady) return;

    const handleMoveStart = () => setIsInteracting(true);
    const handleMoveEnd = () => {
      setIsInteracting(false);
      const bounds = map.getBounds();
      const center = map.getCenter();
      onBoundsChange?.({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });
      onViewChange?.({
        center: { lat: center.lat, lng: center.lng },
        zoom: map.getZoom(),
      });
    };
    const handleDragStart = () => onUserMapInteraction?.();
    const handleZoomEnd = () => onUserMapZoomInteraction?.();

    handleMoveEnd();
    map.on("movestart", handleMoveStart);
    map.on("moveend", handleMoveEnd);
    map.on("dragstart", handleDragStart);
    map.on("zoomend", handleZoomEnd);
    return () => {
      map.off("movestart", handleMoveStart);
      map.off("moveend", handleMoveEnd);
      map.off("dragstart", handleDragStart);
      map.off("zoomend", handleZoomEnd);
    };
  }, [
    isReady,
    map,
    onBoundsChange,
    onUserMapInteraction,
    onUserMapZoomInteraction,
    onViewChange,
  ]);

  const shouldShowCompareActions = interactionMode === "compare";

  // --- スキー場の点のタップ ------------------------------------------------
  useEffect(() => {
    if (!map || !isReady) return;

    const layer = RESORT_POINT_LAYER.hit;
    const handleClick = (event: MapLayerMouseEvent) => {
      const resortId = event.features?.[0]?.properties?.resortId;
      if (typeof resortId !== "string") return;

      // 下のレイヤー（コース・リフト）まで届かないようにする
      event.preventDefault();
      if (shouldShowCompareActions) {
        setOpenActionPopupResortId(resortId);
        return;
      }
      onSelectResort(resortId);
    };
    const setPointer = (cursor: string) => () => {
      map.getCanvas().style.cursor = cursor;
    };
    const showPointer = setPointer("pointer");
    const hidePointer = setPointer("");

    map.on("click", layer, handleClick);
    map.on("mouseenter", layer, showPointer);
    map.on("mouseleave", layer, hidePointer);
    return () => {
      map.off("click", layer, handleClick);
      map.off("mouseenter", layer, showPointer);
      map.off("mouseleave", layer, hidePointer);
    };
  }, [isReady, map, onSelectResort, shouldShowCompareActions]);

  // --- コース・リフトの選択 ------------------------------------------------
  useEffect(() => {
    if (!map || !isReady) return;

    const hitLayers = [FINALIZED_LAYER.courseHit, FINALIZED_LAYER.liftHit];
    const handleClick = (event: MapMouseEvent) => {
      if (event.defaultPrevented) return;

      const features = map.queryRenderedFeatures(event.point, {
        layers: hitLayers.filter(layer => map.getLayer(layer)),
      });
      const feature = features[0];
      if (!feature) {
        // 空白をタップしたら選択を解除する（FR-6.2）
        if (isDetailMap && selectedFinalizedFeature) {
          setSelectedFinalizedFeature(null);
        }
        return;
      }

      const sourceId = feature.properties?.sourceId;
      if (typeof sourceId !== "string") return;

      setSelectedFinalizedFeature({
        kind: feature.layer.id === FINALIZED_LAYER.liftHit ? "lift" : "course",
        id: sourceId,
      });
    };
    const setPointer = (cursor: string) => () => {
      map.getCanvas().style.cursor = cursor;
    };
    const showPointer = setPointer("pointer");
    const hidePointer = setPointer("");

    map.on("click", handleClick);
    for (const layer of hitLayers) {
      map.on("mouseenter", layer, showPointer);
      map.on("mouseleave", layer, hidePointer);
    }
    return () => {
      map.off("click", handleClick);
      for (const layer of hitLayers) {
        map.off("mouseenter", layer, showPointer);
        map.off("mouseleave", layer, hidePointer);
      }
    };
  }, [
    isDetailMap,
    isReady,
    map,
    selectedFinalizedFeature,
    setSelectedFinalizedFeature,
  ]);

  useEffect(() => {
    if (!isDetailMap || !selectedFinalizedFeature) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedFinalizedFeature(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDetailMap, selectedFinalizedFeature, setSelectedFinalizedFeature]);

  // スキー場が切り替わったときだけ選択を解除する。
  // マウントのたびに解除すると、地図インスタンスが複数ある画面
  // （スマホのプレビュー + 全画面）で、選択した直後に別インスタンスの
  // マウントが選択を消してしまう。
  const previousFinalizedMapDataRef = useRef(finalizedMapData);
  useEffect(() => {
    if (previousFinalizedMapDataRef.current === finalizedMapData) return;

    previousFinalizedMapDataRef.current = finalizedMapData;
    setSelectedFinalizedFeature(null);
  }, [finalizedMapData, setSelectedFinalizedFeature]);

  // --- スキー場名ラベルの配置 ---------------------------------------------
  const labelShowZoom = isMobile
    ? MOBILE_LABEL_SHOW_ZOOM
    : DESKTOP_LABEL_SHOW_ZOOM;
  const hasFinalizedCourseData =
    (finalizedMapData?.courses?.features.length ?? 0) > 0;
  const { labelLayouts, mapZoom, updateLabelLayout } = useJapanMapLabelLayout({
    resorts,
    displayNameById,
    filteredResortIdSet,
    hideLabelsMinZoom: hasFinalizedCourseData
      ? FINALIZED_RESORT_LABEL_HIDE_MIN_ZOOM
      : null,
    hoveredResortId,
    interactionMode,
    isFilterActive,
    isMobileMapZoom: isMobile,
    labelAdvancedLayoutZoom: isMobile
      ? MOBILE_LABEL_ADVANCED_LAYOUT_ZOOM
      : DESKTOP_LABEL_ADVANCED_LAYOUT_ZOOM,
    labelShowZoom,
    selectedCompareIdSet,
    selectedResortId,
  });

  useEffect(() => {
    if (!map || !isReady) return;

    const projection: MapProjection = {
      getZoom: () => map.getZoom(),
      getSize: () => {
        const container = map.getContainer();
        return { x: container.clientWidth, y: container.clientHeight };
      },
      project: (latitude, longitude) => {
        const point = map.project([longitude, latitude]);
        return { x: point.x, y: point.y };
      },
      unproject: (x, y) => {
        const lngLat = map.unproject([x, y]);
        return { lat: lngLat.lat, lng: lngLat.lng };
      },
    };
    const layout = () => updateLabelLayout(projection);

    layout();
    map.on("moveend", layout);
    map.on("resize", layout);
    return () => {
      map.off("moveend", layout);
      map.off("resize", layout);
    };
  }, [isReady, map, updateLabelLayout]);

  const selectedResortIdSet = useMemo(() => {
    const next =
      interactionMode === "compare"
        ? new Set(selectedCompareIdSet ?? [])
        : selectedResortId
          ? new Set([selectedResortId])
          : new Set<string>();
    if (hoveredResortId) next.add(hoveredResortId);
    return next;
  }, [
    hoveredResortId,
    interactionMode,
    selectedCompareIdSet,
    selectedResortId,
  ]);

  const renderedResorts = useMemo(
    () =>
      [...resorts].sort((a, b) => {
        const rank =
          getResortPriorityRank(
            getResortPriority({
              resortId: a.id,
              filteredResortIdSet,
              isFilterActive,
              selectedResortIdSet,
            }),
          ) -
          getResortPriorityRank(
            getResortPriority({
              resortId: b.id,
              filteredResortIdSet,
              isFilterActive,
              selectedResortIdSet,
            }),
          );
        return rank !== 0 ? rank : a.numberOfCourses - b.numberOfCourses;
      }),
    [filteredResortIdSet, isFilterActive, resorts, selectedResortIdSet],
  );

  const resortDisplayNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const resort of resorts) {
      names.set(resort.id, getResortDisplayName(resort, displayNameById));
    }
    return names;
  }, [displayNameById, resorts]);

  useEffect(() => {
    if (shouldShowCompareActions) return;
    setOpenActionPopupResortId(null);
  }, [shouldShowCompareActions]);

  const openActionPopupResort = useMemo(
    () =>
      openActionPopupResortId
        ? (resorts.find(resort => resort.id === openActionPopupResortId) ??
          null)
        : null,
    [openActionPopupResortId, resorts],
  );

  useResortMarkers({
    map,
    isReady,
    state: useMemo(
      () => ({
        resorts: renderedResorts,
        labelLayouts,
        displayNameById: resortDisplayNames,
        selectedResortIdSet,
        filteredResortIdSet,
        isFilterActive,
        tileVariant: mapTileVariant,
        interactionMode,
        mapZoom,
        labelShowZoom,
        shouldHideLabels:
          hasFinalizedCourses &&
          mapZoom >= FINALIZED_RESORT_LABEL_HIDE_MIN_ZOOM,
        shouldShowCompareActions,
        openActionPopupResortId,
        onSelectResort,
        onOpenActionPopup: setOpenActionPopupResortId,
      }),
      [
        filteredResortIdSet,
        hasFinalizedCourses,
        interactionMode,
        isFilterActive,
        labelLayouts,
        labelShowZoom,
        mapTileVariant,
        mapZoom,
        onSelectResort,
        openActionPopupResortId,
        renderedResorts,
        resortDisplayNames,
        selectedResortIdSet,
        shouldShowCompareActions,
      ],
    ),
  });

  useLineLabelMarkers({
    map,
    isReady,
    courses: finalizedCourses,
    lifts: finalizedLifts,
    selectedFeature: selectedFinalizedFeature,
    showOpenOnly,
    onSelectFeature: setSelectedFinalizedFeature,
  });

  useLiftAnimation({
    map,
    isReady,
    isInteracting,
    prefersReducedMotion,
  });

  useElevationProfileMarker({
    map,
    isReady,
    point: selectedElevationProfilePoint,
    selectedCourses: selectedCourses ?? [],
    onPointChange: onSelectedElevationProfilePointChange,
  });

  // --- 表示範囲の調整 -----------------------------------------------------
  const finalizedBounds = useMemo(
    () =>
      getCoordinateBounds([
        ...finalizedCourses.flatMap(course => course.coordinates),
        ...finalizedLifts.flatMap(lift => lift.coordinates),
      ]),
    [finalizedCourses, finalizedLifts],
  );

  useResortViewport({
    map,
    isReady,
    initialZoom,
    resorts,
    finalizedBounds,
    selectedResortId,
    selectedCompareIdSet: selectedCompareIdSet ?? new Set<string>(),
    interactionMode,
    detailViewportMode,
    selectedViewportBottomPaddingRatio,
    labelShowZoom,
    // モバイルは動かす様子を見せない。開いた時点でスキー場が出ている方が速い
    animate: !isMobile,
    skipCompareRecenterRef,
    viewportResetKey: detailViewportResetKey,
  });
  useSearchViewport({
    map,
    isReady,
    enabled: interactionMode === "default",
    resorts,
    searchResultResortIds,
    searchViewportRequestKey,
    searchViewportBottomPaddingRatio,
    labelShowZoom,
    animate: !isMobile,
  });
  useRestoreViewport({ map, isReady, restoreViewRequest, animate: !isMobile });
  useSelectedFeatureViewport({
    map,
    isReady,
    selectedFeature: selectedFinalizedFeature,
    selectedCourses: selectedCourses ?? [],
    selectedLift: selectedLift ?? null,
    bottomPaddingRatio: selectedViewportBottomPaddingRatio,
    animate: !isMobile,
  });

  const toolbarRightOverlap = useDetailPanelRightOverlap(
    surfaceRef,
    !isPreviewMap && hasFinalizedFeatures,
  );

  return (
    <div
      ref={surfaceRef}
      data-map-tile-variant={mapTileVariant}
      data-map-course-color-mode={courseColorMode}
      data-map-finalized-focus={isFinalizedFocusMode ? "true" : "false"}
      data-map-presentation={mapPresentation}
      className="relative z-0 h-full w-full"
    >
      <div ref={containerRef} className="h-full w-full" />
      {shouldShowCompareActions && openActionPopupResort && (
        <MapLibreResortActionPopup
          key={openActionPopupResort.id}
          map={map}
          resort={openActionPopupResort}
          isCompareSelected={
            selectedCompareIdSet?.has(openActionPopupResort.id) ?? false
          }
          onClose={() => setOpenActionPopupResortId(null)}
          onSelectResort={onSelectResort}
          onToggleCompare={
            onToggleCompare
              ? (id, selected) => {
                  skipCompareRecenterRef.current = true;
                  onToggleCompare(id, selected);
                }
              : undefined
          }
        />
      )}
      {!isPreviewMap && (
        <MapLibreControls
          map={map}
          initialZoom={initialZoom}
          bottomPaddingRatio={mapControlBottomPaddingRatio}
          mapTileVariant={mapTileVariant}
          onMapTileVariantChange={setMapTileVariant}
          showTileVariantControl={!hasFinalizedFeatures}
          showHomeButton={!isDetailMap}
          canRotate={canRotate}
          isMobile={isMobile}
          onUserMapInteraction={onUserMapInteraction}
          onUserMapZoomInteraction={onUserMapZoomInteraction}
        />
      )}
      {!isPreviewMap && hasFinalizedFeatures && showMapToolbar && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[750] flex justify-end pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pl-2"
          style={{ paddingRight: `${toolbarRightOverlap + 8}px` }}
        >
          <div className="pointer-events-auto max-w-full">
            <FinalizedMapToolbar
              mode={courseColorMode}
              onModeChange={setCourseColorMode}
              hasCourses={hasFinalizedCourses}
              hasLifts={hasFinalizedLifts}
              showOpenOnly={showOpenOnly}
              onShowOpenOnlyChange={setShowOpenOnly}
              mapTileVariant={mapTileVariant}
              onMapTileVariantChange={setMapTileVariant}
            />
          </div>
        </div>
      )}
    </div>
  );
});
