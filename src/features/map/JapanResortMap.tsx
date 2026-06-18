"use client";

import { Box } from "@chakra-ui/react";
import type L from "leaflet";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CircleMarker,
  MapContainer,
  Pane,
  TileLayer,
  Tooltip,
} from "react-leaflet";
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
        {selectedElevationProfilePoint && (
          <CircleMarker
            center={toLatLngTuple(selectedElevationProfilePoint.coordinate)}
            pane={FINALIZED_SELECTED_PANE}
            radius={7}
            pathOptions={{
              color: "#111827",
              fillColor: "#FACC15",
              fillOpacity: 0.95,
              opacity: 1,
              weight: 3,
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -8]}
              opacity={1}
              permanent
              pane={FINALIZED_SELECTED_PANE}
            >
              {selectedElevationProfilePoint.slope == null
                ? "斜度 --"
                : `斜度 ${Math.round(selectedElevationProfilePoint.slope)}°`}
            </Tooltip>
          </CircleMarker>
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
