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
import {
  getLiftFlowDashLength,
  getLineKind,
  getLineStyle,
  getMapCasingWidth,
  getMapLineWidth,
  type LayerVariant,
  type LineStyleContext,
} from "../utils/lineStyle";

const SELECTED_HALO_COLOR = "#FFFFFF";
// 描画面の面積は (1 + 2p)^2 で効く。Retina では特に重いので小さく保つ
const FINALIZED_RENDERER_PADDING = 0.4;
// 連続ズームでは zoomend が細かく飛ぶ。線幅は 1/4 段ごとに更新すれば
// 見た目には十分で、数千パスの setStyle 回数を 1/4 に減らせる。
const RENDER_ZOOM_STEP = 4;
const RESTYLE_DEBOUNCE_MS = 140;

const quantizeZoom = (zoom: number) =>
  Math.round(zoom * RENDER_ZOOM_STEP) / RENDER_ZOOM_STEP;

type GeoJsonOptionsWithRenderer = L.GeoJSONOptions & {
  renderer: L.Renderer;
};

/**
 * コースは Canvas、リフトは SVG で描く。
 *
 * SVG レンダラはズームのたびに全パスを再投影して d 属性を書き直す。
 * 連続ズームでは 1 ジェスチャで何度もズームが確定するため、
 * 斜度モードの 1,500 本規模では書き直しが間に合わずに固まる。
 * Canvas なら DOM を持たないので、同じ本数でも 1 枚描き直すだけで済む。
 *
 * リフトは運行中のフローを CSS アニメーションで動かしており、
 * これは SVG のパスにしか効かないので SVG のまま残す（本数も 20〜30 と少ない）。
 */
const createRenderer = (
  featureKind: "course" | "lift",
  options: { padding: number; pane: string },
): L.Renderer =>
  featureKind === "course" ? L.canvas(options) : L.svg(options);

const withRenderer = (
  options: L.GeoJSONOptions,
  renderer: L.Renderer,
): GeoJsonOptionsWithRenderer => ({ ...options, renderer });

const isLineGeometry = (feature: { geometry?: { type?: string } | null }) => {
  const geometryType = feature.geometry?.type;
  return geometryType === "LineString" || geometryType === "MultiLineString";
};

export const FinalizedGeoJsonLayer = ({
  collection,
  outlineCollection,
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
  /** ケーシングとヒット領域用。斜度モードでもコース単位で 1 本にする */
  outlineCollection: FinalizedLineFeatureCollection | null;
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
  const [renderZoom, setRenderZoom] = useState(() =>
    quantizeZoom(map.getZoom()),
  );
  const baseLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const styledLayersRef = useRef<{ layer: L.GeoJSON; variant: LayerVariant }[]>(
    [],
  );
  const selectedLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const baseRendererRef = useRef<L.Renderer | null>(null);
  const selectedRendererRef = useRef<L.SVG | null>(null);
  const flowLayerRef = useRef<L.GeoJSON | null>(null);

  const styleContext: LineStyleContext = {
    zoom: renderZoom,
    courseColorMode,
    mapTileVariant,
    isFocusMode,
    showOpenOnly,
    selectedFeature,
  };
  const styleContextRef = useRef(styleContext);
  styleContextRef.current = styleContext;

  const getOrCreateRenderers = useCallback(() => {
    if (!map.getPane(pane)) {
      map.createPane(pane);
    }
    if (!map.getPane(selectedPane)) {
      map.createPane(selectedPane);
    }

    if (!baseRendererRef.current) {
      baseRendererRef.current = createRenderer(featureKind, {
        padding: FINALIZED_RENDERER_PADDING,
        pane,
      });
    }
    if (!selectedRendererRef.current) {
      // 選択中の 1 本だけなので、見た目を優先して SVG を使う
      selectedRendererRef.current = L.svg({
        padding: FINALIZED_RENDERER_PADDING,
        pane: selectedPane,
      });
    }

    return {
      baseRenderer: baseRendererRef.current,
      selectedRenderer: selectedRendererRef.current,
    };
  }, [featureKind, map, pane, selectedPane]);

  const styleFor = useCallback(
    (variant: LayerVariant) => (feature?: GeoJSON.Feature) =>
      getLineStyle({
        feature: feature as unknown as FinalizedLineFeature,
        featureKind,
        variant,
        hitWeight,
        context: styleContextRef.current,
      }),
    [featureKind, hitWeight],
  );

  useEffect(() => {
    // 連続ズームでは zoomend が短い間隔で何度も飛ぶ。線幅の更新は数千パスの
    // setStyle を伴うので、落ち着いてから 1 回だけ走らせる。
    // ズーム中はペインごと拡大されるため、見た目は追従している。
    let timer: number | null = null;
    const handleZoomEnd = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        setRenderZoom(quantizeZoom(map.getZoom()));
      }, RESTYLE_DEBOUNCE_MS);
    };

    map.on("zoomend", handleZoomEnd);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
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
      styledLayersRef.current = [];
      flowLayerRef.current = null;

      // パスを外すと Canvas レンダラは再描画を requestAnimationFrame で予約する。
      // 同じフレームでレンダラを外すと、その再描画がコンテキストを失った状態で
      // 走って落ちるので、1 フレーム遅らせてから外す。
      const renderers = [baseRendererRef.current, selectedRendererRef.current];
      baseRendererRef.current = null;
      selectedRendererRef.current = null;
      window.requestAnimationFrame(() => {
        for (const renderer of renderers) {
          if (renderer && map.hasLayer(renderer)) {
            map.removeLayer(renderer);
          }
        }
      });
    };
  }, [map]);

  // ジオメトリの構築。ズーム・選択・タイル種別では再実行しない。
  useEffect(() => {
    if (baseLayerGroupRef.current) {
      baseLayerGroupRef.current.removeFrom(map);
      baseLayerGroupRef.current = null;
      styledLayersRef.current = [];
      flowLayerRef.current = null;
    }

    if (!collection || collection.features.length === 0) return;

    const { baseRenderer } = getOrCreateRenderers();
    const group = L.layerGroup();
    baseLayerGroupRef.current = group;

    const createLayer = (
      variant: LayerVariant,
      source: FinalizedLineFeatureCollection,
      interactive: boolean,
    ) => {
      const layer = L.geoJSON(
        source,
        withRenderer(
          {
            interactive,
            filter: isLineGeometry,
            style: styleFor(variant),
            onEachFeature: (feature, featureLayer) => {
              if (!interactive) return;
              const properties = (feature as unknown as FinalizedLineFeature)
                .properties;
              featureLayer.on("click", event => {
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
      layer.addTo(group);
      styledLayersRef.current.push({ layer, variant });
      return layer;
    };

    // Base layers intentionally keep pane ownership on the shared SVG
    // renderer. Passing pane again to L.geoJSON can create paths in the wrong
    // pane, which makes finalized lines disappear.
    const outline = outlineCollection ?? collection;
    createLayer("casing", outline, false);
    createLayer("line", collection, false);
    if (featureKind === "lift") {
      flowLayerRef.current = createLayer("flow", collection, false);
    }
    createLayer("hit", outline, true);
    group.addTo(map);

    return () => {
      group.removeFrom(map);
      if (baseLayerGroupRef.current === group) {
        baseLayerGroupRef.current = null;
        styledLayersRef.current = [];
        flowLayerRef.current = null;
      }
    };
  }, [
    collection,
    outlineCollection,
    featureKind,
    getOrCreateRenderers,
    map,
    onSelectFeature,
    styleFor,
  ]);

  // スタイルだけの更新。パスは再生成しない（FR-1.1 / FR-1.3）。
  useEffect(() => {
    const context: LineStyleContext = {
      zoom: renderZoom,
      courseColorMode,
      mapTileVariant,
      isFocusMode,
      showOpenOnly,
      selectedFeature,
    };

    for (const { layer, variant } of styledLayersRef.current) {
      if (variant === "hit") continue;
      layer.setStyle((feature?: GeoJSON.Feature) =>
        getLineStyle({
          feature: feature as unknown as FinalizedLineFeature,
          featureKind,
          variant,
          hitWeight,
          context,
        }),
      );
    }

    const flowCycle = getLiftFlowDashLength(renderZoom) * 2;
    flowLayerRef.current?.eachLayer(layer => {
      const path = (layer as L.Path & { _path?: SVGPathElement })._path;
      path?.style.setProperty("--lift-flow-offset", `-${flowCycle}px`);
    });
  }, [
    courseColorMode,
    featureKind,
    hitWeight,
    isFocusMode,
    mapTileVariant,
    renderZoom,
    selectedFeature,
    showOpenOnly,
  ]);

  // 選択中の線だけを別ペインに重ねる。選択のたびに全パスを作り直さないための分離。
  useEffect(() => {
    if (selectedLayerGroupRef.current) {
      selectedLayerGroupRef.current.removeFrom(map);
      selectedLayerGroupRef.current = null;
    }

    if (!collection || collection.features.length === 0 || !selectedFeature) {
      return;
    }

    const matches = (source: FinalizedLineFeatureCollection) =>
      source.features.filter(
        feature =>
          selectedFeature.kind === feature.properties.kind &&
          selectedFeature.id === feature.properties.sourceId,
      );
    const selectedLineFeatures = matches(collection);
    if (selectedLineFeatures.length === 0) return;

    const selectedLineCollection: FinalizedLineFeatureCollection = {
      type: "FeatureCollection",
      features: selectedLineFeatures,
    };
    const selectedOutlineCollection: FinalizedLineFeatureCollection = {
      type: "FeatureCollection",
      features: matches(outlineCollection ?? collection),
    };
    const { selectedRenderer } = getOrCreateRenderers();
    const group = L.layerGroup();
    selectedLayerGroupRef.current = group;

    const haloWeight =
      getMapCasingWidth(
        getMapLineWidth(renderZoom, getLineKind(featureKind)) + 1.6,
        mapTileVariant === "photo",
      ) + 3;

    L.geoJSON(
      selectedOutlineCollection,
      withRenderer(
        {
          interactive: false,
          filter: isLineGeometry,
          style: () => ({
            color: SELECTED_HALO_COLOR,
            opacity: 0.95,
            weight: haloWeight,
            lineCap: "round",
            lineJoin: "round",
          }),
        },
        selectedRenderer,
      ),
    ).addTo(group);

    L.geoJSON(
      selectedLineCollection,
      withRenderer(
        {
          interactive: false,
          filter: isLineGeometry,
          style: styleFor("line"),
        },
        selectedRenderer,
      ),
    ).addTo(group);

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
    map,
    mapTileVariant,
    outlineCollection,
    renderZoom,
    selectedFeature,
    styleFor,
  ]);

  return null;
};
