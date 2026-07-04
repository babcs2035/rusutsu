"use client";

import type L from "leaflet";
import {
  Fragment,
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import type { MapSkiResort } from "@/types/skiResorts";
import {
  BASE_MARKER_PANE,
  FILTER_MATCH_MARKER_PANE,
  FRONT_MARKER_PANE,
  RESORT_POINT_RADIUS,
  SELECTED_MARKER_PANE,
} from "../constants";
import type { LabelLayout } from "../types";
import { createResortPointIcon } from "../utils/leafletIcons";
import {
  getMarkerZIndexOffset,
  getResortPriority,
} from "../utils/resortMarkerPriority";

type ResortMarkersLayerProps = {
  displayLabelIconsByResortId: Map<string, L.DivIcon>;
  filteredResortIdSet?: Set<string>;
  interactionMode: "default" | "detail" | "compare";
  isFilterActive: boolean;
  isPhotoMapTile: boolean;
  labelLayouts: Record<string, LabelLayout>;
  labelShowZoom: number;
  mapZoom: number;
  onOpenActionPopup: (id: string) => void;
  onSelectResort: (id: string) => void;
  openActionPopupResortId: string | null;
  renderedResorts: MapSkiResort[];
  selectedResortIdSet: Set<string>;
  shouldHideLabels: boolean;
  shouldShowCompareActions: boolean;
};

type VisibleLabelResort = {
  resort: MapSkiResort;
  layout: LabelLayout;
};

const ZoomingLabelOffsetController = ({
  labelMarkerByIdRef,
  visibleLabelResorts,
  onZoomingChange,
}: {
  labelMarkerByIdRef: MutableRefObject<Map<string, L.Marker>>;
  visibleLabelResorts: VisibleLabelResort[];
  onZoomingChange: (isZooming: boolean) => void;
}) => {
  const map = useMap();
  const frameRef = useRef<number | null>(null);
  const zoomingLabelIdsRef = useRef<Set<string>>(new Set());
  const visibleLabelResortsRef = useRef(visibleLabelResorts);

  useEffect(() => {
    visibleLabelResortsRef.current = visibleLabelResorts;
  }, [visibleLabelResorts]);

  const updateZoomingLabelPositions = useCallback(() => {
    frameRef.current = null;

    for (const { resort, layout } of visibleLabelResortsRef.current) {
      if (!zoomingLabelIdsRef.current.has(resort.id)) continue;

      const labelMarker = labelMarkerByIdRef.current.get(resort.id);
      if (!labelMarker) continue;

      const markerPoint = map.latLngToContainerPoint([
        resort.latitude,
        resort.longitude,
      ] as L.LatLngTuple);
      const labelPoint = markerPoint.add([
        layout.labelOffsetPx.x,
        layout.labelOffsetPx.y,
      ]);
      labelMarker.setLatLng(map.containerPointToLatLng(labelPoint));
    }
  }, [labelMarkerByIdRef, map]);

  const scheduleZoomingLabelPositionUpdate = useCallback(() => {
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(
      updateZoomingLabelPositions,
    );
  }, [updateZoomingLabelPositions]);

  const stopZooming = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    zoomingLabelIdsRef.current.clear();
    for (const { resort, layout } of visibleLabelResortsRef.current) {
      labelMarkerByIdRef.current
        .get(resort.id)
        ?.setLatLng(layout.labelPosition);
    }
    onZoomingChange(false);
  }, [labelMarkerByIdRef, onZoomingChange]);

  useMapEvents({
    zoomstart: () => {
      zoomingLabelIdsRef.current = new Set(
        visibleLabelResortsRef.current.map(({ resort }) => resort.id),
      );
      onZoomingChange(true);
      scheduleZoomingLabelPositionUpdate();
    },
    zoom: scheduleZoomingLabelPositionUpdate,
    zoomend: stopZooming,
  });

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  return null;
};

export const ResortMarkersLayer = ({
  displayLabelIconsByResortId,
  filteredResortIdSet,
  interactionMode,
  isFilterActive,
  isPhotoMapTile,
  labelLayouts,
  labelShowZoom,
  mapZoom,
  onOpenActionPopup,
  onSelectResort,
  openActionPopupResortId,
  renderedResorts,
  selectedResortIdSet,
  shouldHideLabels,
  shouldShowCompareActions,
}: ResortMarkersLayerProps) => {
  const [isLabelZooming, setIsLabelZooming] = useState(false);
  const labelMarkerByIdRef = useRef(new Map<string, L.Marker>());
  const visibleLabelResorts = useMemo<VisibleLabelResort[]>(
    () =>
      renderedResorts
        .map(resort => {
          const labelLayout = labelLayouts[resort.id];
          const hasOpenActionPopup = openActionPopupResortId === resort.id;
          const hasVisibleLabel =
            !shouldHideLabels &&
            Boolean(labelLayout) &&
            !(shouldShowCompareActions && hasOpenActionPopup);

          return hasVisibleLabel && labelLayout
            ? { resort, layout: labelLayout }
            : null;
        })
        .filter((value): value is VisibleLabelResort => value !== null),
    [
      labelLayouts,
      openActionPopupResortId,
      renderedResorts,
      shouldHideLabels,
      shouldShowCompareActions,
    ],
  );
  const setLabelMarkerRef = useCallback(
    (resortId: string) => (marker: L.Marker | null) => {
      if (marker) {
        labelMarkerByIdRef.current.set(resortId, marker);
        return;
      }

      labelMarkerByIdRef.current.delete(resortId);
    },
    [],
  );

  return (
    <>
      <ZoomingLabelOffsetController
        labelMarkerByIdRef={labelMarkerByIdRef}
        visibleLabelResorts={visibleLabelResorts}
        onZoomingChange={setIsLabelZooming}
      />
      {renderedResorts.map(resort => {
        const priority = getResortPriority({
          resortId: resort.id,
          filteredResortIdSet,
          isFilterActive,
          selectedResortIdSet,
        });
        const isSelected = priority === "selected";
        const isFilterMatch =
          isFilterActive && filteredResortIdSet?.has(resort.id) === true;
        const labelLayout = labelLayouts[resort.id];
        const hasOpenActionPopup = openActionPopupResortId === resort.id;
        const hasVisibleLabel =
          !shouldHideLabels &&
          Boolean(labelLayout) &&
          !(shouldShowCompareActions && hasOpenActionPopup);
        const shouldDimUnselectedComparePoint =
          interactionMode === "compare" &&
          mapZoom < labelShowZoom &&
          !isSelected;
        const isDimmedByFilter =
          isFilterActive &&
          priority === "normal" &&
          filteredResortIdSet?.has(resort.id) !== true;
        const shouldDimPoint =
          shouldDimUnselectedComparePoint || isDimmedByFilter;
        const markerPane = isSelected
          ? SELECTED_MARKER_PANE
          : isFilterMatch
            ? FILTER_MATCH_MARKER_PANE
            : hasVisibleLabel
              ? FRONT_MARKER_PANE
              : BASE_MARKER_PANE;
        const markerClickEventHandlers = shouldShowCompareActions
          ? { click: () => onOpenActionPopup(resort.id) }
          : { click: () => onSelectResort(resort.id) };
        const markerZIndexOffset = getMarkerZIndexOffset(priority);
        const pointIcon = createResortPointIcon({
          radius: RESORT_POINT_RADIUS,
          isSelected,
          isFilterMatch,
          isDimmed: shouldDimPoint,
        });

        return (
          <Fragment key={resort.id}>
            {labelLayout?.showLeaderLine && !isLabelZooming && (
              <Polyline
                pane={markerPane}
                positions={[
                  [resort.latitude, resort.longitude],
                  labelLayout.leaderEndPosition,
                ]}
                pathOptions={{
                  color: isPhotoMapTile
                    ? isSelected
                      ? "#fde047"
                      : "#f8fafc"
                    : isSelected
                      ? "#c2410c"
                      : "#334155",
                  opacity: isPhotoMapTile ? 0.92 : 0.78,
                  weight: isPhotoMapTile ? 1.5 : 1.25,
                }}
                interactive={false}
              />
            )}

            <Marker
              key={`${resort.id}-point-${hasVisibleLabel ? "interactive" : "static"}`}
              pane={markerPane}
              position={[resort.latitude, resort.longitude]}
              icon={pointIcon}
              interactive={hasVisibleLabel}
              zIndexOffset={markerZIndexOffset}
              eventHandlers={
                hasVisibleLabel ? markerClickEventHandlers : undefined
              }
            />

            {hasVisibleLabel && (
              <Marker
                key={`${resort.id}-label`}
                ref={setLabelMarkerRef(resort.id)}
                pane={markerPane}
                position={labelLayout.labelPosition}
                icon={displayLabelIconsByResortId.get(resort.id)}
                interactive={hasVisibleLabel}
                zIndexOffset={markerZIndexOffset}
                eventHandlers={markerClickEventHandlers}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
};
