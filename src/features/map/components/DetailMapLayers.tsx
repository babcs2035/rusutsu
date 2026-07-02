"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
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
const FINALIZED_RENDERER_PADDING = 1;

type LayerVariant =
  | "outline"
  | "pisteUnderlay"
  | "selectedPisteUnderlay"
  | "line"
  | "hit"
  | "selectedHalo"
  | "selectedLine";

type FinalizedPathOptions = L.PathOptions & {
  noClip?: boolean;
};

type GeoJsonOptionsWithRenderer = L.GeoJSONOptions & {
  renderer: L.Renderer;
};

const withRenderer = (
  options: L.GeoJSONOptions,
  renderer: L.Renderer,
): GeoJsonOptionsWithRenderer => ({ ...options, renderer });

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
  const baseLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const selectedLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const baseRendererRef = useRef<L.SVG | null>(null);
  const selectedRendererRef = useRef<L.SVG | null>(null);

  const getOrCreateRenderers = useCallback(() => {
    if (!map.getPane(pane)) {
      map.createPane(pane);
    }
    if (!map.getPane(selectedPane)) {
      map.createPane(selectedPane);
    }

    if (!baseRendererRef.current) {
      baseRendererRef.current = L.svg({
        padding: FINALIZED_RENDERER_PADDING,
        pane,
      });
    }
    if (!selectedRendererRef.current) {
      selectedRendererRef.current = L.svg({
        padding: FINALIZED_RENDERER_PADDING,
        pane: selectedPane,
      });
    }

    return {
      baseRenderer: baseRendererRef.current,
      selectedRenderer: selectedRendererRef.current,
    };
  }, [map, pane, selectedPane]);

  useEffect(() => {
    const handleZoomEnd = () => setRenderZoom(map.getZoom());
    map.on("zoomend", handleZoomEnd);
    return () => {
      map.off("zoomend", handleZoomEnd);
    };
  }, [map]);

  useEffect(() => {
    const container = map.getContainer();
    let resizeFrame: number | null = null;
    const invalidateMapSize = () => {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        map.invalidateSize({ pan: false, debounceMoveend: true });
      });
    };

    invalidateMapSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", invalidateMapSize);
      return () => {
        window.removeEventListener("resize", invalidateMapSize);
        if (resizeFrame !== null) {
          window.cancelAnimationFrame(resizeFrame);
        }
      };
    }

    const resizeObserver = new ResizeObserver(invalidateMapSize);
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
    };
  }, [map]);

  useEffect(() => {
    return () => {
      baseLayerGroupRef.current?.removeFrom(map);
      selectedLayerGroupRef.current?.removeFrom(map);
      baseLayerGroupRef.current = null;
      selectedLayerGroupRef.current = null;

      const baseRenderer = baseRendererRef.current;
      const selectedRenderer = selectedRendererRef.current;
      if (baseRenderer && map.hasLayer(baseRenderer)) {
        map.removeLayer(baseRenderer);
      }
      if (selectedRenderer && map.hasLayer(selectedRenderer)) {
        map.removeLayer(selectedRenderer);
      }
      baseRendererRef.current = null;
      selectedRendererRef.current = null;
    };
  }, [map]);

  const getStyle = useCallback(
    (
      feature: FinalizedLineFeature,
      variant: LayerVariant,
      selection: SelectedMapFeature | null,
    ): FinalizedPathOptions => {
      const properties = feature.properties;
      const isSelected =
        selection?.kind === properties.kind &&
        selection.id === properties.sourceId;
      const isDimmedBySelection = selection !== null && !isSelected;
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
          noClip: true,
          opacity: 0,
          weight: hitWeight,
        };
      }

      if (variant === "outline") {
        if (featureKind === "course" && isNonOpenInOpenOnlyMode) {
          return {
            noClip: true,
            opacity: 0,
            weight: 0,
          };
        }
        return {
          color: "#ffffff",
          noClip: true,
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
            noClip: true,
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
          noClip: true,
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
            noClip: true,
            opacity: 0,
            weight: 0,
          };
        }
        return {
          color: SELECTED_HALO_COLOR,
          noClip: true,
          opacity: 0.95,
          weight: visibleOutlineWeight + 4,
          lineCap,
          lineJoin: "round",
        };
      }

      if (variant === "selectedLine") {
        if (!isSelected) {
          return {
            noClip: true,
            opacity: 0,
            weight: 0,
          };
        }
        return {
          color: properties.color,
          opacity: 1,
          noClip: true,
          weight: visibleLineWeight + 2,
          dashArray,
          lineCap,
          lineJoin: "round",
        };
      }

      return {
        color: lineColor,
        noClip: true,
        opacity: lineOpacity,
        weight: isSelected ? visibleLineWeight + 2 : visibleLineWeight,
        dashArray,
        lineCap,
        lineJoin: "round",
      };
    },
    [
      courseColorMode,
      featureKind,
      hitWeight,
      isFocusMode,
      mapTileVariant,
      renderZoom,
      showOpenOnly,
    ],
  );

  useEffect(() => {
    if (baseLayerGroupRef.current) {
      baseLayerGroupRef.current.removeFrom(map);
      baseLayerGroupRef.current = null;
    }

    if (!collection || collection.features.length === 0) return;

    const { baseRenderer } = getOrCreateRenderers();
    const group = L.layerGroup();
    baseLayerGroupRef.current = group;

    const createLayer = (
      variant: Extract<
        LayerVariant,
        "outline" | "pisteUnderlay" | "line" | "hit"
      >,
      interactive: boolean,
    ) =>
      L.geoJSON(
        collection,
        withRenderer(
          {
            interactive,
            filter: feature => {
              const geometryType = feature.geometry?.type;
              return (
                geometryType === "LineString" ||
                geometryType === "MultiLineString"
              );
            },
            style: feature =>
              getStyle(
                feature as unknown as FinalizedLineFeature,
                variant,
                null,
              ),
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
          },
          baseRenderer,
        ),
      );

    // Base layers intentionally ignore selectedFeature and keep pane ownership
    // on the shared SVG renderer. Passing pane again to L.geoJSON can create
    // paths in the wrong pane, which makes finalized lines disappear.
    createLayer("outline", false).addTo(group);
    if (featureKind === "course") {
      createLayer("pisteUnderlay", false).addTo(group);
    }
    createLayer("line", false).addTo(group);
    let openLiftFlowLayer: L.GeoJSON | null = null;
    let openLiftFlowCycle: number | null = null;
    if (featureKind === "lift" && renderZoom >= 11) {
      const dashLength = getLiftFlowDashLength(renderZoom);
      const gapLength = dashLength;
      openLiftFlowCycle = dashLength + gapLength;
      openLiftFlowLayer = L.geoJSON(
        collection,
        withRenderer(
          {
            interactive: false,
            filter: feature => {
              const geometryType = feature.geometry?.type;
              return (
                geometryType === "LineString" ||
                geometryType === "MultiLineString"
              );
            },
            style: feature => {
              const properties = (feature as unknown as FinalizedLineFeature)
                .properties;
              if (properties.liftStatus !== "open") {
                return {
                  noClip: true,
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
                noClip: true,
              };
            },
          },
          baseRenderer,
        ),
      ).addTo(group);
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
      if (baseLayerGroupRef.current === group) {
        baseLayerGroupRef.current = null;
      }
    };
  }, [
    collection,
    featureKind,
    getOrCreateRenderers,
    getStyle,
    map,
    onSelectFeature,
    renderZoom,
  ]);

  useEffect(() => {
    if (selectedLayerGroupRef.current) {
      selectedLayerGroupRef.current.removeFrom(map);
      selectedLayerGroupRef.current = null;
    }

    if (!collection || collection.features.length === 0 || !selectedFeature) {
      return;
    }

    const { selectedRenderer } = getOrCreateRenderers();
    const selectedFeatures = collection.features.filter(
      feature =>
        selectedFeature.kind === feature.properties.kind &&
        selectedFeature.id === feature.properties.sourceId,
    );
    if (selectedFeatures.length === 0) return;

    const selectedCollection: FinalizedLineFeatureCollection = {
      type: "FeatureCollection",
      features: selectedFeatures,
    };
    const group = L.layerGroup();
    selectedLayerGroupRef.current = group;

    const createSelectedLayer = (
      variant: Extract<
        LayerVariant,
        "selectedHalo" | "selectedPisteUnderlay" | "selectedLine"
      >,
    ) =>
      L.geoJSON(
        selectedCollection,
        withRenderer(
          {
            interactive: false,
            filter: feature => {
              const geometryType = feature.geometry?.type;
              return (
                geometryType === "LineString" ||
                geometryType === "MultiLineString"
              );
            },
            style: feature =>
              getStyle(
                feature as unknown as FinalizedLineFeature,
                variant,
                selectedFeature,
              ),
          },
          selectedRenderer,
        ),
      );

    // Selection is rendered as a tiny overlay containing only the active
    // course/lift. Keep this separate from the base renderer so selection
    // changes do not rebuild every finalized path.
    createSelectedLayer("selectedHalo").addTo(group);
    if (featureKind === "course") {
      createSelectedLayer("selectedPisteUnderlay").addTo(group);
    }
    createSelectedLayer("selectedLine").addTo(group);
    group.addTo(map);

    return () => {
      group.removeFrom(map);
      if (selectedLayerGroupRef.current === group) {
        selectedLayerGroupRef.current = null;
      }
    };
  }, [
    collection,
    featureKind,
    getOrCreateRenderers,
    getStyle,
    map,
    selectedFeature,
  ]);

  return null;
};
