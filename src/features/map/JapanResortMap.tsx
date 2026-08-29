"use client";

import L from "leaflet";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CircleMarker,
  MapContainer,
  Marker,
  Pane,
  TileLayer,
  useMap,
} from "react-leaflet";
import { createConnectedCourseElevationProfile } from "@/features/resort-detail/utils/detailMetrics";
import type { FinalizedCourseFeature } from "@/lib/finalizedResortGeojsonShared";
import { FinalizedGeoJsonLayer } from "./components/DetailMapLayers";
import { FinalizedLineOverlay } from "./components/DetailMapLineOverlay";
import { FinalizedMapToolbar } from "./components/FinalizedMapToolbar";
import {
  FinalizedSelectionInteractionController,
  LabelLayoutWatcher,
  MapEventsHandler,
  MapViewportController,
  MapZoomSettingsController,
  RestoreViewportController,
  SearchViewportController,
  SelectedFinalizedFeatureViewportController,
} from "./components/MapControllers";
import { MapControls } from "./components/MapControls";
import { ResortActionPopup } from "./components/ResortActionPopup";
import { ResortMarkersLayer } from "./components/ResortMarkersLayer";
import { SmoothWheelZoomController } from "./components/SmoothWheelZoomController";
import {
  BASE_MARKER_PANE,
  COARSE_POINTER_MEDIA_QUERY,
  DESKTOP_INITIAL_ZOOM,
  DESKTOP_LABEL_ADVANCED_LAYOUT_ZOOM,
  DESKTOP_LABEL_SHOW_ZOOM,
  DESKTOP_ZOOM_SETTINGS,
  FILTER_MATCH_MARKER_PANE,
  FINALIZED_COURSE_PANE,
  FINALIZED_LABEL_PANE,
  FINALIZED_LIFT_PANE,
  FINALIZED_RESORT_LABEL_HIDE_MIN_ZOOM,
  FINALIZED_SELECTED_PANE,
  FRONT_MARKER_PANE,
  GSI_TILE_ATTRIBUTION,
  GSI_TILE_LAYERS,
  GSI_TILE_MAX_ZOOM,
  GSI_TILE_MIN_ZOOM,
  INITIAL_CENTER,
  MARKER_VIEWPORT_PADDING_RATIO,
  MOBILE_INITIAL_ZOOM,
  MOBILE_LABEL_ADVANCED_LAYOUT_ZOOM,
  MOBILE_LABEL_SHOW_ZOOM,
  MOBILE_MAP_MEDIA_QUERY,
  MOBILE_ZOOM_SETTINGS,
  SELECTED_MARKER_PANE,
} from "./constants";
import { useDetailPanelRightOverlap } from "./hooks/useDetailPanelRightOverlap";
import { useFinalizedMapFeatures } from "./hooks/useFinalizedMapFeatures";
import { useJapanMapLabelLayout } from "./hooks/useJapanMapLabelLayout";
import { useMapZoomInteractionSurface } from "./hooks/useMapZoomInteractionSurface";
import { useResortAliases } from "./hooks/useResortAliases";
import type {
  CourseColorMode,
  ElevationProfileMapPoint,
  JapanResortMapProps,
  MapTileVariant,
  SelectedMapFeature,
} from "./types";
import { toLatLngTuple } from "./utils/finalizedMapData";
import { createNameLabelIcon, measureLabelHeight } from "./utils/leafletIcons";
import { createLeafletProjection } from "./utils/leafletProjection";
import { getResortDisplayName } from "./utils/resortLabels";
import {
  getResortPriority,
  getResortPriorityRank,
} from "./utils/resortMarkerPriority";

export type { ElevationProfileMapPoint, SelectedMapFeature } from "./types";

type CourseLinePoint = ElevationProfileMapPoint & {
  segmentDy: number;
};

const getElevationProfileLabelIcon = (
  point: ElevationProfileMapPoint,
  placement: "top" | "bottom",
) =>
  L.divIcon({
    className: `course-profile-label-icon course-profile-label-icon-${placement}`,
    html: `<div class="course-profile-label"><span>${point.slope == null ? "--" : `${Math.round(point.slope)}°`}</span><span>${Math.round(point.elevation).toLocaleString()}m</span></div>`,
    iconSize: [56, 44],
    iconAnchor: placement === "top" ? [28, 54] : [28, -10],
  });

const ElevationProfileMapMarker = ({
  point,
  selectedCourses,
  pane,
  onPointChange,
}: {
  point: ElevationProfileMapPoint;
  selectedCourses: FinalizedCourseFeature[];
  pane: string;
  onPointChange?: (point: ElevationProfileMapPoint | null) => void;
}) => {
  const map = useMap();
  const profilePoints = useMemo(
    () => createConnectedCourseElevationProfile(selectedCourses),
    [selectedCourses],
  );
  const [isDraggingProfilePoint, setIsDraggingProfilePoint] = useState(false);
  const getNearestCourseLinePoint = useCallback(
    (latLng: L.LatLng): CourseLinePoint | null => {
      if (profilePoints.length === 0) return null;
      if (profilePoints.length === 1) {
        return {
          ...profilePoints[0],
          courseGroupId: point.courseGroupId,
          courseName: point.courseName,
          segmentDy: 0,
        };
      }

      const draggedPoint = map.latLngToLayerPoint(latLng);
      let nearest: (CourseLinePoint & { layerDistance: number }) | null = null;

      for (let index = 1; index < profilePoints.length; index += 1) {
        const start = profilePoints[index - 1];
        const end = profilePoints[index];
        const startPoint = map.latLngToLayerPoint(
          toLatLngTuple(start.coordinate),
        );
        const endPoint = map.latLngToLayerPoint(toLatLngTuple(end.coordinate));
        const segment = endPoint.subtract(startPoint);
        const segmentLengthSquared = segment.x ** 2 + segment.y ** 2;
        const rawT =
          segmentLengthSquared === 0
            ? 0
            : ((draggedPoint.x - startPoint.x) * segment.x +
                (draggedPoint.y - startPoint.y) * segment.y) /
              segmentLengthSquared;
        const t = Math.min(1, Math.max(0, rawT));
        const projectedPoint = L.point(
          startPoint.x + segment.x * t,
          startPoint.y + segment.y * t,
        );
        const layerDistance = projectedPoint.distanceTo(draggedPoint);
        if (nearest !== null && layerDistance >= nearest.layerDistance) {
          continue;
        }

        const startDistance = start.distance;
        const endDistance = end.distance;
        const startElevation = start.elevation;
        const endElevation = end.elevation;
        const projectedLatLng = map.layerPointToLatLng(projectedPoint);
        const elevation = startElevation + (endElevation - startElevation) * t;
        nearest = {
          courseGroupId: point.courseGroupId,
          courseName: point.courseName,
          coordinate: [projectedLatLng.lng, projectedLatLng.lat, elevation],
          distance: startDistance + (endDistance - startDistance) * t,
          elevation,
          slope: t < 0.5 ? start.slope : end.slope,
          segmentDy: segment.y,
          layerDistance,
        };
      }

      return nearest;
    },
    [map, point.courseGroupId, point.courseName, profilePoints],
  );
  const updateToNearestCourseLinePoint = useCallback(
    (latLng: L.LatLng) => {
      if (!onPointChange) return;
      const nearestPoint = getNearestCourseLinePoint(latLng);
      if (!nearestPoint) return;

      onPointChange({
        courseGroupId: point.courseGroupId,
        courseName: point.courseName,
        coordinate: nearestPoint.coordinate,
        distance: nearestPoint.distance,
        elevation: nearestPoint.elevation,
        slope: nearestPoint.slope,
      });
    },
    [
      getNearestCourseLinePoint,
      onPointChange,
      point.courseGroupId,
      point.courseName,
    ],
  );
  const selectedLinePoint = useMemo(
    () => getNearestCourseLinePoint(L.latLng(toLatLngTuple(point.coordinate))),
    [getNearestCourseLinePoint, point.coordinate],
  );
  const labelPlacement =
    selectedLinePoint && selectedLinePoint.segmentDy < 0 ? "bottom" : "top";
  const labelIcon = useMemo(
    () => getElevationProfileLabelIcon(point, labelPlacement),
    [labelPlacement, point],
  );

  useEffect(() => {
    if (!isDraggingProfilePoint) return;

    map.dragging.disable();
    const handleMouseMove = (event: L.LeafletMouseEvent) => {
      updateToNearestCourseLinePoint(event.latlng);
    };
    const handleMouseUp = () => {
      setIsDraggingProfilePoint(false);
    };

    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);
    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
      map.dragging.enable();
    };
  }, [isDraggingProfilePoint, map, updateToNearestCourseLinePoint]);

  return (
    <>
      <CircleMarker
        center={toLatLngTuple(point.coordinate)}
        eventHandlers={{
          mousedown: event => {
            L.DomEvent.stopPropagation(event.originalEvent);
            if (!onPointChange) return;
            setIsDraggingProfilePoint(true);
          },
          click: event => {
            L.DomEvent.stopPropagation(event.originalEvent);
          },
        }}
        pane={pane}
        radius={10}
        pathOptions={{
          color: "#111827",
          fillColor: "transparent",
          fillOpacity: 0,
          opacity: 1,
          weight: 2.5,
        }}
      />
      <Marker
        interactive={false}
        icon={labelIcon}
        pane={pane}
        position={toLatLngTuple(point.coordinate)}
      />
    </>
  );
};

export const JapanResortMap = memo(function JapanResortMap({
  resorts,
  filteredResortIdSet,
  isFilterActive = false,
  searchResultResortIds = [],
  searchViewportRequestKey = 0,
  searchViewportBottomPaddingRatio = 0,
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
  mapTileVariant: controlledMapTileVariant,
  onMapTileVariantChange,
  detailViewportMode = "finalized",
  selectedFinalizedFeature: controlledSelectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
  selectedElevationProfilePoint,
  onSelectedElevationProfilePointChange,
}: JapanResortMapProps) {
  const displayNameById = useResortAliases(resorts);
  const isPreviewMap = mapPresentation === "preview";
  const [openActionPopupResortId, setOpenActionPopupResortId] = useState<
    string | null
  >(null);
  const [isMobileMapZoom, setIsMobileMapZoom] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia(MOBILE_MAP_MEDIA_QUERY).matches,
  );
  const [isCoarsePointer, setIsCoarsePointer] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia(COARSE_POINTER_MEDIA_QUERY).matches,
  );
  const initialZoom = isMobileMapZoom
    ? MOBILE_INITIAL_ZOOM
    : DESKTOP_INITIAL_ZOOM;
  const [uncontrolledMapTileVariant, setUncontrolledMapTileVariant] =
    useState<MapTileVariant>("pale");
  const mapTileVariant = controlledMapTileVariant ?? uncontrolledMapTileVariant;
  const setMapTileVariant = useCallback(
    (variant: MapTileVariant) => {
      setUncontrolledMapTileVariant(variant);
      onMapTileVariantChange?.(variant);
    },
    [onMapTileVariantChange],
  );
  const [courseColorMode, setCourseColorMode] =
    useState<CourseColorMode>("difficulty");
  const [showOpenFinalizedOnly, setShowOpenFinalizedOnly] = useState(false);
  const [
    uncontrolledSelectedFinalizedFeature,
    setUncontrolledSelectedFinalizedFeature,
  ] = useState<SelectedMapFeature | null>(null);
  const [markerBounds, setMarkerBounds] = useState<L.LatLngBounds | null>(null);
  const skipCompareRecenterRef = useRef(false);
  const _mapZoomSurfaceRef = useRef<HTMLDivElement | null>(null);
  const selectedFinalizedFeature =
    controlledSelectedFinalizedFeature === undefined
      ? uncontrolledSelectedFinalizedFeature
      : controlledSelectedFinalizedFeature;
  const setSelectedFinalizedFeature = useCallback(
    (feature: SelectedMapFeature | null) => {
      setUncontrolledSelectedFinalizedFeature(feature);
      onSelectedFinalizedFeatureChange?.(feature);
    },
    [onSelectedFinalizedFeatureChange],
  );
  const handleDeselectFinalizedFeature = useCallback(() => {
    setSelectedFinalizedFeature(null);
  }, [setSelectedFinalizedFeature]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MAP_MEDIA_QUERY);
    const syncMapZoomMode = () => {
      setIsMobileMapZoom(mediaQuery.matches);
    };

    syncMapZoomMode();
    mediaQuery.addEventListener("change", syncMapZoomMode);
    return () => {
      mediaQuery.removeEventListener("change", syncMapZoomMode);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(COARSE_POINTER_MEDIA_QUERY);
    const syncPointerKind = () => {
      setIsCoarsePointer(mediaQuery.matches);
    };

    syncPointerKind();
    mediaQuery.addEventListener("change", syncPointerKind);
    return () => {
      mediaQuery.removeEventListener("change", syncPointerKind);
    };
  }, []);

  const labelShowZoom = isMobileMapZoom
    ? MOBILE_LABEL_SHOW_ZOOM
    : DESKTOP_LABEL_SHOW_ZOOM;
  const labelAdvancedLayoutZoom = isMobileMapZoom
    ? MOBILE_LABEL_ADVANCED_LAYOUT_ZOOM
    : DESKTOP_LABEL_ADVANCED_LAYOUT_ZOOM;

  const hasFinalizedCourseData =
    (finalizedMapData?.courses?.features.length ?? 0) > 0;
  const { labelLayouts, mapZoom, updateLabelLayout } = useJapanMapLabelLayout({
    resorts,
    displayNameById,
    hideLabelsMinZoom: hasFinalizedCourseData
      ? FINALIZED_RESORT_LABEL_HIDE_MIN_ZOOM
      : null,
    filteredResortIdSet,
    hoveredResortId,
    interactionMode,
    isFilterActive,
    isMobileMapZoom,
    labelAdvancedLayoutZoom,
    labelShowZoom,
    selectedCompareIdSet,
    selectedResortId,
  });

  const nameLabelIconsByResortId = useMemo(() => {
    const labelHeight = measureLabelHeight();
    const icons = new Map<string, L.DivIcon>();
    resorts.forEach(resort => {
      const labelLayout = labelLayouts[resort.id];
      if (!labelLayout) {
        return;
      }
      const isSelected =
        resort.id === hoveredResortId ||
        resort.id === selectedResortId ||
        (interactionMode === "compare" &&
          selectedCompareIdSet?.has(resort.id) === true);
      const isDimmedByFilter =
        isFilterActive &&
        !isSelected &&
        filteredResortIdSet?.has(resort.id) !== true;
      const displayName = getResortDisplayName(resort, displayNameById);
      icons.set(
        resort.id,
        createNameLabelIcon(
          displayName,
          labelLayout.labelWidth,
          labelHeight,
          isSelected,
          isDimmedByFilter,
        ),
      );
    });
    return icons;
  }, [
    displayNameById,
    interactionMode,
    isFilterActive,
    labelLayouts,
    resorts,
    filteredResortIdSet,
    hoveredResortId,
    selectedCompareIdSet,
    selectedResortId,
  ]);

  const shouldShowCompareActions = interactionMode === "compare";
  const {
    courseFeatureCollection,
    courseOutlineFeatureCollection,
    finalizedBounds,
    finalizedCourses,
    finalizedLifts,
    hasFinalizedCourses,
    hasFinalizedLifts,
    isFinalizedFocusMode,
    liftFeatureCollection,
    selectedCourses,
    selectedLift,
  } = useFinalizedMapFeatures({
    courseColorMode,
    finalizedMapData,
    interactionMode,
    selectedFinalizedFeature,
  });
  // タッチはヒット領域を広く、マウスは狭く（FR-6.1）
  const finalizedHitWeight = isCoarsePointer ? 24 : 12;

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

  useEffect(() => {
    if (!shouldShowCompareActions) {
      setOpenActionPopupResortId(null);
    }
  }, [shouldShowCompareActions]);

  const openActionPopupResort = useMemo(
    () =>
      openActionPopupResortId
        ? (resorts.find(resort => resort.id === openActionPopupResortId) ??
          null)
        : null,
    [openActionPopupResortId, resorts],
  );
  const selectedResortIdSet = useMemo(() => {
    const next =
      interactionMode === "compare"
        ? new Set(selectedCompareIdSet ?? [])
        : selectedResortId
          ? new Set([selectedResortId])
          : new Set<string>();

    if (hoveredResortId) {
      next.add(hoveredResortId);
    }

    return next;
  }, [
    hoveredResortId,
    interactionMode,
    selectedCompareIdSet,
    selectedResortId,
  ]);
  // 画面外のマーカーも Leaflet はズームのたびに再配置するので、
  // 描く対象を表示範囲の周辺だけに絞る（数百個あると連続ズームで効いてくる）
  const visibleResorts = useMemo(() => {
    if (!markerBounds) return resorts;

    const padded = markerBounds.pad(MARKER_VIEWPORT_PADDING_RATIO);
    return resorts.filter(
      resort =>
        selectedResortIdSet.has(resort.id) ||
        padded.contains([resort.latitude, resort.longitude]),
    );
  }, [markerBounds, resorts, selectedResortIdSet]);
  const renderedResorts = useMemo(
    () =>
      [...visibleResorts].sort((a, b) => {
        const aPriority = getResortPriority({
          resortId: a.id,
          filteredResortIdSet,
          isFilterActive,
          selectedResortIdSet,
        });
        const bPriority = getResortPriority({
          resortId: b.id,
          filteredResortIdSet,
          isFilterActive,
          selectedResortIdSet,
        });
        const priorityDiff =
          getResortPriorityRank(aPriority) - getResortPriorityRank(bPriority);

        if (priorityDiff !== 0) return priorityDiff;

        return a.numberOfCourses - b.numberOfCourses;
      }),
    [filteredResortIdSet, isFilterActive, selectedResortIdSet, visibleResorts],
  );
  const handleViewportChange = useCallback(
    (map: L.Map) => {
      updateLabelLayout(createLeafletProjection(map));
    },
    [updateLabelLayout],
  );
  const handleBoundsChange = useCallback(
    (bounds: L.LatLngBounds) => {
      setMarkerBounds(bounds);
      onBoundsChange?.({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });
    },
    [onBoundsChange],
  );
  const zoomSettings = isMobileMapZoom
    ? MOBILE_ZOOM_SETTINGS
    : DESKTOP_ZOOM_SETTINGS;
  const mapTileLayer = GSI_TILE_LAYERS[mapTileVariant];
  const tileOpacity = isFinalizedFocusMode
    ? mapTileVariant === "photo"
      ? 1
      : 0.9
    : mapTileLayer.opacity;
  const isPhotoMapTile = mapTileVariant === "photo";
  const hasFinalizedFeatures = hasFinalizedCourses || hasFinalizedLifts;
  const shouldHideResortLabelsForFinalizedCourses =
    hasFinalizedCourses && mapZoom >= FINALIZED_RESORT_LABEL_HIDE_MIN_ZOOM;
  const {
    mapZoomSurfaceRef,
    handleMapDoubleClickCapture,
    handleMapTouchEndCapture,
    handleMapTouchStartCapture,
    handleMapWheelCapture,
  } = useMapZoomInteractionSurface(onUserMapZoomInteraction);
  const toolbarRightOverlap = useDetailPanelRightOverlap(
    mapZoomSurfaceRef,
    !isPreviewMap && hasFinalizedFeatures,
  );

  return (
    <div
      ref={mapZoomSurfaceRef}
      data-map-zoom-surface="true"
      data-map-tile-variant={mapTileVariant}
      data-map-course-color-mode={courseColorMode}
      data-map-finalized-focus={isFinalizedFocusMode ? "true" : "false"}
      data-map-presentation={mapPresentation}
      className="relative z-0 h-full w-full"
      onDoubleClickCapture={handleMapDoubleClickCapture}
      onTouchCancelCapture={handleMapTouchEndCapture}
      onTouchEndCapture={handleMapTouchEndCapture}
      onTouchStartCapture={handleMapTouchStartCapture}
      onWheelCapture={handleMapWheelCapture}
    >
      <MapContainer
        center={INITIAL_CENTER}
        zoom={initialZoom}
        minZoom={GSI_TILE_MIN_ZOOM}
        maxZoom={GSI_TILE_MAX_ZOOM}
        zoomSnap={zoomSettings.zoomSnap}
        zoomDelta={zoomSettings.zoomDelta}
        bounceAtZoomLimits={false}
        zoomControl={false}
        dragging={!isPreviewMap}
        touchZoom={!isPreviewMap}
        scrollWheelZoom={!isPreviewMap}
        doubleClickZoom={!isPreviewMap}
        boxZoom={!isPreviewMap}
        keyboard={!isPreviewMap}
        attributionControl={!isPreviewMap}
        className="w-full h-full"
      >
        <TileLayer
          key={mapTileVariant}
          className={`gsi-tile-layer-${mapTileVariant}`}
          url={mapTileLayer.url}
          opacity={tileOpacity}
          attribution={GSI_TILE_ATTRIBUTION}
          minZoom={GSI_TILE_MIN_ZOOM}
          maxZoom={GSI_TILE_MAX_ZOOM}
          maxNativeZoom={GSI_TILE_MAX_ZOOM}
        />
        <Pane name={BASE_MARKER_PANE} style={{ zIndex: 430 }} />
        <Pane name={FRONT_MARKER_PANE} style={{ zIndex: 470 }} />
        <Pane name={FILTER_MATCH_MARKER_PANE} style={{ zIndex: 520 }} />
        <Pane name={SELECTED_MARKER_PANE} style={{ zIndex: 560 }} />
        <Pane name={FINALIZED_COURSE_PANE} style={{ zIndex: 440 }} />
        <Pane name={FINALIZED_LIFT_PANE} style={{ zIndex: 465 }} />
        <Pane name={FINALIZED_SELECTED_PANE} style={{ zIndex: 590 }} />
        <Pane
          name={FINALIZED_LABEL_PANE}
          style={{ zIndex: 600, pointerEvents: "none" }}
        />

        <FinalizedGeoJsonLayer
          collection={liftFeatureCollection}
          outlineCollection={liftFeatureCollection}
          pane={FINALIZED_LIFT_PANE}
          featureKind="lift"
          hitWeight={finalizedHitWeight}
          mapTileVariant={mapTileVariant}
          courseColorMode={courseColorMode}
          isFocusMode={isFinalizedFocusMode}
          selectedFeature={selectedFinalizedFeature}
          onSelectFeature={setSelectedFinalizedFeature}
          selectedPane={FINALIZED_SELECTED_PANE}
          showOpenOnly={showOpenFinalizedOnly}
        />
        <FinalizedGeoJsonLayer
          collection={courseFeatureCollection}
          outlineCollection={courseOutlineFeatureCollection}
          pane={FINALIZED_COURSE_PANE}
          featureKind="course"
          hitWeight={finalizedHitWeight}
          mapTileVariant={mapTileVariant}
          courseColorMode={courseColorMode}
          isFocusMode={isFinalizedFocusMode}
          selectedFeature={selectedFinalizedFeature}
          onSelectFeature={setSelectedFinalizedFeature}
          selectedPane={FINALIZED_SELECTED_PANE}
          showOpenOnly={showOpenFinalizedOnly}
        />
        <SelectedFinalizedFeatureViewportController
          selectedFeature={selectedFinalizedFeature}
          selectedCourses={selectedCourses ?? []}
          selectedLift={selectedLift}
          bottomPaddingRatio={selectedViewportBottomPaddingRatio}
        />
        {(hasFinalizedCourses || hasFinalizedLifts) && (
          <>
            <FinalizedLineOverlay
              courses={finalizedCourses}
              lifts={finalizedLifts}
              selectedFeature={selectedFinalizedFeature}
              onSelectFeature={setSelectedFinalizedFeature}
              showOpenOnly={showOpenFinalizedOnly}
            />
            <FinalizedSelectionInteractionController
              enabled={interactionMode === "detail"}
              hasSelection={selectedFinalizedFeature !== null}
              onDeselect={handleDeselectFinalizedFeature}
            />
          </>
        )}
        {selectedElevationProfilePoint && selectedCourses && (
          <ElevationProfileMapMarker
            point={selectedElevationProfilePoint}
            selectedCourses={selectedCourses}
            pane={FINALIZED_SELECTED_PANE}
            onPointChange={onSelectedElevationProfilePointChange}
          />
        )}

        <ResortMarkersLayer
          displayLabelIconsByResortId={nameLabelIconsByResortId}
          filteredResortIdSet={filteredResortIdSet}
          interactionMode={interactionMode}
          isFilterActive={isFilterActive}
          isPhotoMapTile={isPhotoMapTile}
          labelLayouts={labelLayouts}
          labelShowZoom={labelShowZoom}
          mapZoom={mapZoom}
          onOpenActionPopup={setOpenActionPopupResortId}
          onSelectResort={onSelectResort}
          openActionPopupResortId={openActionPopupResortId}
          renderedResorts={renderedResorts}
          selectedResortIdSet={selectedResortIdSet}
          shouldHideLabels={shouldHideResortLabelsForFinalizedCourses}
          shouldShowCompareActions={shouldShowCompareActions}
        />

        {shouldShowCompareActions && openActionPopupResort && (
          <ResortActionPopup
            key={openActionPopupResort.id}
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
          <MapControls
            initialZoom={initialZoom}
            mapTileVariant={mapTileVariant}
            onMapTileVariantChange={setMapTileVariant}
            showTileVariantControl={!hasFinalizedFeatures}
            showHomeButton={interactionMode !== "detail"}
            onUserMapInteraction={onUserMapInteraction}
            onUserMapZoomInteraction={onUserMapZoomInteraction}
          />
        )}
        <MapViewportController
          initialZoom={initialZoom}
          resorts={resorts}
          finalizedBounds={finalizedBounds}
          selectedResortId={selectedResortId}
          selectedCompareIdSet={selectedCompareIdSet ?? new Set<string>()}
          interactionMode={interactionMode}
          detailViewportMode={detailViewportMode}
          selectedViewportBottomPaddingRatio={
            selectedViewportBottomPaddingRatio
          }
          labelShowZoom={labelShowZoom}
          onViewportChange={handleViewportChange}
          skipCompareRecenterRef={skipCompareRecenterRef}
        />
        <SearchViewportController
          enabled={interactionMode === "default"}
          resorts={resorts}
          searchResultResortIds={searchResultResortIds}
          searchViewportRequestKey={searchViewportRequestKey}
          searchViewportBottomPaddingRatio={searchViewportBottomPaddingRatio}
          labelShowZoom={labelShowZoom}
          onViewportChange={handleViewportChange}
        />
        <RestoreViewportController
          restoreViewRequest={restoreViewRequest}
          onViewportChange={handleViewportChange}
        />
        <LabelLayoutWatcher onLayout={handleViewportChange} />
        <MapEventsHandler
          onBoundsChange={handleBoundsChange}
          onViewChange={onViewChange}
          onUserMapInteraction={onUserMapInteraction}
          onUserMapZoomInteraction={onUserMapZoomInteraction}
        />
        <SmoothWheelZoomController
          enabled={!isPreviewMap && interactionMode === "detail"}
          onUserMapZoomInteraction={onUserMapZoomInteraction}
        />
        <MapZoomSettingsController
          initialZoom={initialZoom}
          zoomSnap={zoomSettings.zoomSnap}
          zoomDelta={zoomSettings.zoomDelta}
        />
      </MapContainer>
      {!isPreviewMap && hasFinalizedFeatures && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[750] flex justify-end pl-2 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
          style={{ paddingRight: `${toolbarRightOverlap + 8}px` }}
        >
          <div className="pointer-events-auto max-w-full">
            <FinalizedMapToolbar
              mode={courseColorMode}
              onModeChange={setCourseColorMode}
              hasCourses={hasFinalizedCourses}
              hasLifts={hasFinalizedLifts}
              showOpenOnly={showOpenFinalizedOnly}
              onShowOpenOnlyChange={setShowOpenFinalizedOnly}
              mapTileVariant={mapTileVariant}
              onMapTileVariantChange={setMapTileVariant}
            />
          </div>
        </div>
      )}
    </div>
  );
});
