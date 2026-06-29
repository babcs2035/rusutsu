"use client";

import type L from "leaflet";
import { Fragment } from "react";
import { Marker, Polyline } from "react-leaflet";
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
}: ResortMarkersLayerProps) => (
  <>
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
        interactionMode === "compare" && mapZoom < labelShowZoom && !isSelected;
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
          {labelLayout?.showLeaderLine && (
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
