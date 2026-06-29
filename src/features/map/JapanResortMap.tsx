"use client";

import { Box } from "@chakra-ui/react";
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
import {
  FinalizedCourseNameLabels,
  FinalizedLiftNameLabels,
} from "./components/DetailMapNameLabels";
import {
  LabelLayoutWatcher,
  MapEventsHandler,
  MapViewportController,
  MapZoomSettingsController,
  RestoreViewportController,
  SearchViewportController,
  SelectedFinalizedFeatureViewportController,
} from "./components/MapControllers";
import {
  FinalizedMapLegend,
  FinalizedMapModeControl,
  MapControls,
} from "./components/MapControls";
import { ResortActionPopup } from "./components/ResortActionPopup";
import { ResortMarkersLayer } from "./components/ResortMarkersLayer";
import {
  BASE_MARKER_PANE,
  DESKTOP_INITIAL_ZOOM,
  DESKTOP_LABEL_ADVANCED_LAYOUT_ZOOM,
  DESKTOP_LABEL_SHOW_ZOOM,
  DESKTOP_ZOOM_SETTINGS,
  FILTER_MATCH_MARKER_PANE,
  FINALIZED_COURSE_PANE,
  FINALIZED_LIFT_PANE,
  FINALIZED_RESORT_LABEL_HIDE_MIN_ZOOM,
  FINALIZED_SELECTED_PANE,
  FRONT_MARKER_PANE,
  GSI_TILE_ATTRIBUTION,
  GSI_TILE_LAYERS,
  GSI_TILE_MAX_ZOOM,
  GSI_TILE_MIN_ZOOM,
  INITIAL_CENTER,
  MOBILE_INITIAL_ZOOM,
  MOBILE_LABEL_ADVANCED_LAYOUT_ZOOM,
  MOBILE_LABEL_SHOW_ZOOM,
  MOBILE_MAP_MEDIA_QUERY,
  MOBILE_ZOOM_SETTINGS,
  SELECTED_MARKER_PANE,
} from "./constants";
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
  selectedFinalizedFeature: controlledSelectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
  selectedElevationProfilePoint,
  onSelectedElevationProfilePointChange,
}: JapanResortMapProps) {
  const displayNameById = useResortAliases(resorts);
  const [openActionPopupResortId, setOpenActionPopupResortId] = useState<
    string | null
  >(null);
  const [isMobileMapZoom, setIsMobileMapZoom] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia(MOBILE_MAP_MEDIA_QUERY).matches,
  );
  const initialZoom = isMobileMapZoom
    ? MOBILE_INITIAL_ZOOM
    : DESKTOP_INITIAL_ZOOM;
  const [mapTileVariant, setMapTileVariant] = useState<MapTileVariant>("pale");
  const [courseColorMode, setCourseColorMode] =
    useState<CourseColorMode>("difficulty");
  const [showOpenFinalizedOnly, setShowOpenFinalizedOnly] = useState(false);
  const [
    uncontrolledSelectedFinalizedFeature,
    setUncontrolledSelectedFinalizedFeature,
  ] = useState<SelectedMapFeature | null>(null);
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

  const labelShowZoom = isMobileMapZoom
    ? MOBILE_LABEL_SHOW_ZOOM
    : DESKTOP_LABEL_SHOW_ZOOM;
  const labelAdvancedLayoutZoom = isMobileMapZoom
    ? MOBILE_LABEL_ADVANCED_LAYOUT_ZOOM
    : DESKTOP_LABEL_ADVANCED_LAYOUT_ZOOM;

  const { labelLayouts, mapZoom, updateLabelLayout } = useJapanMapLabelLayout({
    resorts,
    displayNameById,
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
    mapZoom,
    showOpenOnly: showOpenFinalizedOnly,
    selectedFinalizedFeature,
  });

  useEffect(() => {
    if (finalizedMapData === null) {
      setSelectedFinalizedFeature(null);
      return;
    }
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
  const renderedResorts = useMemo(
    () =>
      [...resorts].sort((a, b) => {
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
    [filteredResortIdSet, isFilterActive, resorts, selectedResortIdSet],
  );
  const handleBoundsChange = useCallback(
    (bounds: L.LatLngBounds) => {
      onBoundsChange(bounds);
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
  const shouldHideResortLabelsForFinalizedCourses =
    hasFinalizedCourses && mapZoom >= FINALIZED_RESORT_LABEL_HIDE_MIN_ZOOM;
  const {
    mapZoomSurfaceRef,
    handleMapDoubleClickCapture,
    handleMapTouchEndCapture,
    handleMapTouchStartCapture,
    handleMapWheelCapture,
  } = useMapZoomInteractionSurface(onUserMapZoomInteraction);

  return (
    <Box
      ref={mapZoomSurfaceRef}
      data-map-zoom-surface="true"
      data-map-tile-variant={mapTileVariant}
      data-map-finalized-focus={isFinalizedFocusMode ? "true" : "false"}
      h="100%"
      w="100%"
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
        zoomControl={false}
        style={{ width: "100%", height: "100%" }}
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

        <FinalizedGeoJsonLayer
          collection={liftFeatureCollection}
          pane={FINALIZED_LIFT_PANE}
          featureKind="lift"
          hitWeight={18}
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
          pane={FINALIZED_COURSE_PANE}
          featureKind="course"
          hitWeight={18}
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
        {hasFinalizedLifts && (
          <FinalizedLiftNameLabels
            lifts={finalizedLifts}
            selectedFeature={selectedFinalizedFeature}
          />
        )}
        {hasFinalizedCourses && (
          <FinalizedCourseNameLabels
            courses={finalizedCourses}
            selectedFeature={selectedFinalizedFeature}
          />
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

        <MapControls
          initialZoom={initialZoom}
          bottomPaddingRatio={mapControlBottomPaddingRatio}
          mapTileVariant={mapTileVariant}
          onMapTileVariantChange={setMapTileVariant}
          onUserMapInteraction={onUserMapInteraction}
          onUserMapZoomInteraction={onUserMapZoomInteraction}
        />
        <MapViewportController
          initialZoom={initialZoom}
          resorts={resorts}
          finalizedBounds={finalizedBounds}
          selectedResortId={selectedResortId}
          selectedCompareIdSet={selectedCompareIdSet ?? new Set<string>()}
          interactionMode={interactionMode}
          selectedViewportBottomPaddingRatio={
            selectedViewportBottomPaddingRatio
          }
          labelShowZoom={labelShowZoom}
          onViewportChange={updateLabelLayout}
          skipCompareRecenterRef={skipCompareRecenterRef}
        />
        <SearchViewportController
          enabled={interactionMode === "default"}
          resorts={resorts}
          searchResultResortIds={searchResultResortIds}
          searchViewportRequestKey={searchViewportRequestKey}
          searchViewportBottomPaddingRatio={searchViewportBottomPaddingRatio}
          labelShowZoom={labelShowZoom}
          onViewportChange={updateLabelLayout}
        />
        <RestoreViewportController
          restoreViewRequest={restoreViewRequest}
          onViewportChange={updateLabelLayout}
        />
        <LabelLayoutWatcher onLayout={updateLabelLayout} />
        <MapEventsHandler
          onBoundsChange={handleBoundsChange}
          onViewChange={onViewChange}
          onUserMapInteraction={onUserMapInteraction}
          onUserMapZoomInteraction={onUserMapZoomInteraction}
        />
        <MapZoomSettingsController
          initialZoom={initialZoom}
          zoomSnap={zoomSettings.zoomSnap}
          zoomDelta={zoomSettings.zoomDelta}
        />
      </MapContainer>
      <Box
        position="absolute"
        top={{ base: "calc(env(safe-area-inset-top, 0px) + 4.25rem)", md: 4 }}
        left={4}
        zIndex={1000}
        display="flex"
        flexDirection="column"
        gap={2}
        alignItems="flex-start"
        pointerEvents="none"
      >
        <Box pointerEvents="auto">
          <FinalizedMapModeControl
            mode={courseColorMode}
            onModeChange={setCourseColorMode}
            hasCourses={hasFinalizedCourses}
            hasLifts={hasFinalizedLifts}
            showOpenOnly={showOpenFinalizedOnly}
            onShowOpenOnlyChange={setShowOpenFinalizedOnly}
          />
        </Box>
        <Box pointerEvents="auto">
          <FinalizedMapLegend
            mode={courseColorMode}
            hasCourses={hasFinalizedCourses}
            hasLifts={hasFinalizedLifts}
          />
        </Box>
      </Box>
    </Box>
  );
});
