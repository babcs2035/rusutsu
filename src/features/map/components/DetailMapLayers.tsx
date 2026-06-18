"use client";

import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import type {
  CourseColorMode,
  FinalizedLineFeature,
  FinalizedLineFeatureCollection,
  MapTileVariant,
  SelectedMapFeature,
} from "../types";
import { getLiftFlowDashLength } from "../utils/finalizedMapData";
import { getScaledMapLineWidth } from "../utils/leafletIcons";

const INACTIVE_LINE_COLOR = "#94A3B8";
const NON_OPEN_SLOPE_COURSE_COLOR = "#64748B";
const NON_OPEN_DIFFICULTY_OPACITY = 0.38;
const NON_OPEN_LIFT_OPACITY = 0.44;
const SELECTED_HALO_COLOR = "#FFFFFF";
const UNGROOMED_LIMITED_UNDERLAY_COLOR = "#BAE6FD";
const UNGROOMED_CLOSED_UNDERLAY_COLOR = "#7DD3FC";

export const FinalizedGeoJsonLayer = ({
  collection,
  pane,
  featureKind,
  hitWeight,
  mapTileVariant,
  courseColorMode,
  isFocusMode,
  selectedFeature,
  onSelectFeature,
  selectedPane,
  showOpenOnly,
}: {
  collection: FinalizedLineFeatureCollection | null;
  pane: string;
  featureKind: "course" | "lift";
  hitWeight: number;
  mapTileVariant: MapTileVariant;
  courseColorMode: CourseColorMode;
  isFocusMode: boolean;
  selectedFeature: SelectedMapFeature | null;
  onSelectFeature: (feature: SelectedMapFeature) => void;
  selectedPane: string;
  showOpenOnly: boolean;
}) => {
  const map = useMap();
  const [renderZoom, setRenderZoom] = useState(() => map.getZoom());
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const handleZoomEnd = () => setRenderZoom(map.getZoom());
    map.on("zoomend", handleZoomEnd);
    return () => {
      map.off("zoomend", handleZoomEnd);
    };
  }, [map]);

  useEffect(() => {
    if (layerGroupRef.current) {
      layerGroupRef.current.removeFrom(map);
      layerGroupRef.current = null;
    }

    if (!collection || collection.features.length === 0) return;

    const group = L.layerGroup();
    layerGroupRef.current = group;

    const getStyle = (
      feature: FinalizedLineFeature,
      variant:
        | "outline"
        | "pisteUnderlay"
        | "selectedPisteUnderlay"
        | "line"
        | "hit"
        | "selectedHalo"
        | "selectedLine",
    ): L.PathOptions => {
      const properties = feature.properties;
      const isSelected =
        selectedFeature?.kind === properties.kind &&
        selectedFeature.id === properties.sourceId;
      const isDimmedBySelection = selectedFeature !== null && !isSelected;
      const statusKind = properties.statusKind;
      const isOpen = statusKind === "open";
      const isNonOpenInOpenOnlyMode = showOpenOnly && !isOpen && !isSelected;
      const shouldUseSlopeModeGray =
        isNonOpenInOpenOnlyMode &&
        featureKind === "course" &&
        courseColorMode === "slope";
      const isUngroomedCourse =
        featureKind === "course" &&
        (!showOpenOnly || isOpen) &&
        (properties.pisteStatus === "limited" ||
          properties.pisteStatus === "closed");
      const isSegmentedCourse =
        featureKind === "course" && properties.segmented === true;
      const lineCap = isSegmentedCourse ? "square" : "round";
      const dashArray = undefined;
      const isPhotoTile = mapTileVariant === "photo";
      const focusWeightBoost = isFocusMode ? 0.8 : 0;
      const baseLineWeight = getScaledMapLineWidth(
        renderZoom,
        isUngroomedCourse ? "ungroomedCourse" : featureKind,
      );
      const statusWeightReduction = 0;
      const outlineWeight =
        baseLineWeight + (featureKind === "course" ? 3.4 : 2.6);
      const outlineOpacity = isDimmedBySelection
        ? 0.24
        : isPhotoTile
          ? Math.max(
              isFocusMode ? 0.72 : 0.58,
              properties.opacity * (isFocusMode ? 1 : 0.98),
            )
          : Math.max(
              isFocusMode ? 0.5 : 0.36,
              properties.opacity * (isFocusMode ? 0.98 : 0.9),
            );
      const visibleOutlineWeight = isPhotoTile
        ? outlineWeight +
          (featureKind === "course" ? 1.4 : 0.9) +
          focusWeightBoost
        : outlineWeight + focusWeightBoost;
      const visibleLineWeight = Math.max(
        1.2,
        baseLineWeight +
          (isPhotoTile ? 0.4 : 0) +
          focusWeightBoost -
          statusWeightReduction,
      );
      const lineOpacity = (() => {
        if (isDimmedBySelection) return 0.48;
        if (isSelected) return 1;
        if (isNonOpenInOpenOnlyMode) {
          return featureKind === "course"
            ? NON_OPEN_DIFFICULTY_OPACITY
            : NON_OPEN_LIFT_OPACITY;
        }
        if (featureKind === "lift") return 1;
        return 1;
      })();
      const lineColor = (() => {
        if (isDimmedBySelection) return INACTIVE_LINE_COLOR;
        if (isSelected) return properties.color;
        if (shouldUseSlopeModeGray) return NON_OPEN_SLOPE_COURSE_COLOR;
        return properties.color;
      })();

      if (variant === "hit") {
        return {
          color: "#000000",
          opacity: 0,
          weight: hitWeight,
        };
      }

      if (variant === "outline") {
        if (featureKind === "course" && isNonOpenInOpenOnlyMode) {
          return {
            opacity: 0,
            weight: 0,
          };
        }
        return {
          color: "#ffffff",
          opacity: isDimmedBySelection ? 0.1 : outlineOpacity,
          weight: visibleOutlineWeight,
          lineCap,
          lineJoin: "round",
        };
      }

      if (variant === "pisteUnderlay" || variant === "selectedPisteUnderlay") {
        if (
          !isUngroomedCourse ||
          (variant === "selectedPisteUnderlay" && !isSelected)
        ) {
          return {
            opacity: 0,
            weight: 0,
          };
        }
        return {
          color: isDimmedBySelection
            ? INACTIVE_LINE_COLOR
            : properties.pisteStatus === "closed"
              ? UNGROOMED_CLOSED_UNDERLAY_COLOR
              : UNGROOMED_LIMITED_UNDERLAY_COLOR,
          opacity: isDimmedBySelection
            ? 0.16
            : properties.pisteStatus === "closed"
              ? 0.52
              : 0.34,
          weight:
            visibleLineWeight + (properties.pisteStatus === "closed" ? 6 : 5),
          lineCap: "round",
          lineJoin: "round",
        };
      }

      if (variant === "selectedHalo") {
        if (!isSelected) {
          return {
            opacity: 0,
            weight: 0,
          };
        }
        return {
          color: SELECTED_HALO_COLOR,
          opacity: 0.95,
          weight: visibleOutlineWeight + 4,
          lineCap,
          lineJoin: "round",
        };
      }

      if (variant === "selectedLine") {
        if (!isSelected) {
          return {
            opacity: 0,
            weight: 0,
          };
        }
        return {
          color: properties.color,
          opacity: 1,
          weight: visibleLineWeight + 2,
          dashArray,
          lineCap,
          lineJoin: "round",
        };
      }

      return {
        color: lineColor,
        opacity: lineOpacity,
        weight: isSelected ? visibleLineWeight + 2 : visibleLineWeight,
        dashArray,
        lineCap,
        lineJoin: "round",
      };
    };

    const createLayer = (
      variant:
        | "outline"
        | "pisteUnderlay"
        | "selectedPisteUnderlay"
        | "line"
        | "hit"
        | "selectedHalo"
        | "selectedLine",
      interactive: boolean,
      targetPane = pane,
    ) =>
      L.geoJSON(collection, {
        pane: targetPane,
        interactive,
        style: feature =>
          getStyle(feature as unknown as FinalizedLineFeature, variant),
        onEachFeature: (feature, layer) => {
          if (!interactive) return;
          const properties = (feature as unknown as FinalizedLineFeature)
            .properties;
          layer.on("click", event => {
            L.DomEvent.stopPropagation(event);
            onSelectFeature({
              kind: properties.kind,
              id: properties.sourceId,
            });
          });
        },
      });

    createLayer("outline", false).addTo(group);
    if (featureKind === "course") {
      createLayer("pisteUnderlay", false).addTo(group);
    }
    createLayer("line", false).addTo(group);
    createLayer("selectedHalo", false, selectedPane).addTo(group);
    if (featureKind === "course") {
      createLayer("selectedPisteUnderlay", false, selectedPane).addTo(group);
    }
    createLayer("selectedLine", false, selectedPane).addTo(group);
    let openLiftFlowLayer: L.GeoJSON | null = null;
    let openLiftFlowCycle: number | null = null;
    if (featureKind === "lift" && renderZoom >= 11) {
      const dashLength = getLiftFlowDashLength(renderZoom);
      const gapLength = dashLength;
      openLiftFlowCycle = dashLength + gapLength;
      openLiftFlowLayer = L.geoJSON(collection, {
        pane,
        interactive: false,
        style: feature => {
          const properties = (feature as unknown as FinalizedLineFeature)
            .properties;
          const isSelected =
            selectedFeature?.kind === properties.kind &&
            selectedFeature.id === properties.sourceId;
          if (
            properties.liftStatus !== "open" ||
            (selectedFeature !== null && !isSelected)
          ) {
            return {
              opacity: 0,
              weight: 0,
            };
          }
          const flowWeight = getScaledMapLineWidth(renderZoom, "liftFlow");
          return {
            color: properties.flowColor ?? "#ffffff",
            opacity: 0.94,
            weight: flowWeight,
            dashArray: `${dashLength} ${gapLength}`,
            lineCap: "butt",
            lineJoin: "round",
            className: `finalized-lift-flow finalized-lift-flow-${properties.flowSpeed ?? "normal"}`,
          };
        },
      }).addTo(group);
    }
    createLayer("hit", true).addTo(group);
    group.addTo(map);
    if (openLiftFlowLayer && openLiftFlowCycle != null) {
      window.requestAnimationFrame(() => {
        openLiftFlowLayer?.eachLayer(layer => {
          const path = (layer as L.Path & { _path?: SVGPathElement })._path;
          path?.style.setProperty(
            "--lift-flow-offset",
            `-${openLiftFlowCycle}px`,
          );
        });
      });
    }

    return () => {
      group.removeFrom(map);
      if (layerGroupRef.current === group) {
        layerGroupRef.current = null;
      }
    };
  }, [
    collection,
    courseColorMode,
    featureKind,
    hitWeight,
    isFocusMode,
    map,
    mapTileVariant,
    onSelectFeature,
    pane,
    renderZoom,
    selectedFeature,
    selectedPane,
    showOpenOnly,
  ]);

  return null;
};
