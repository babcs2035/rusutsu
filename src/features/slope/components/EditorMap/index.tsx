"use client";

import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  MapTouchEvent,
} from "maplibre-gl";
import { Map as MapLibreMapClass, Popup } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
// ワーカー URL の設定。import した時点で副作用として走る
import "@/features/map/maplibre/mapWorker";
import { getCoordinateBounds } from "@/features/map/maplibre/viewport";
import type { LngLat, TileLayerId } from "../../types";
import { EditorTileSwitcher } from "./EditorTileSwitcher";
import { buildLabels, EditorLabelLayer } from "./editorLabels";
import {
  createEditorLayers,
  EDITOR_LAYER,
  EDITOR_SOURCE,
  LINE_HIT_WIDTH,
} from "./editorLayers";
import {
  pickFeature,
  pickNearestLine,
  queryLineCandidateIds,
} from "./editorPicking";
import {
  buildBackgroundCollection,
  buildInsertHintCollection,
  buildLineCollection,
  buildMergeAnchorCollection,
  buildMergeDiscardedCollection,
  buildMergePreviewCollection,
  buildMidpointCollection,
  buildMidstationCollection,
  buildVertexCollection,
  EMPTY_COLLECTION,
} from "./editorSources";
import {
  ALL_TILE_IDS,
  addGoogleTileLayer,
  createEditorStyle,
  FALLBACK_TILE_LAYER,
  getMapMaxZoom,
  isGoogleTileLayer,
  tileLayerId,
} from "./editorTiles";
import type {
  EditorLinePick,
  EditorMapLine,
  EditorMapMode,
  EditorMergePreview,
} from "./types";
import { useGoogleTileUrl } from "./useGoogleTileSession";

export type {
  EditorLinePick,
  EditorMapLine,
  EditorMapMode,
  EditorMergePreview,
} from "./types";

type EditorMapProps = {
  center: LngLat;
  zoom: number;
  courses: EditorMapLine[];
  // 参照用に薄く表示する編集対象外の線（編集前の位置など）
  backgroundLines?: EditorMapLine[];
  activeCourseId: string | null;
  mode: EditorMapMode;
  googleMapsApiKey: string | null;
  // 値が変わるたびに全コースへ fitBounds する
  fitBoundsKey?: number;
  onSelectCourse?: (courseId: string) => void;
  onAppendVertex?: (lngLat: LngLat) => void;
  onMoveVertex?: (index: number, lngLat: LngLat) => void;
  onInsertVertex?: (index: number, lngLat: LngLat) => void;
  onDeleteVertex?: (index: number) => void;
  onFinishDraw?: () => void;
  onSplitVertex?: (index: number) => void;
  // mode "merge" で線の上をクリックしたとき。つなぎ目の位置を渡す
  onPickLinePoint?: (pick: EditorLinePick) => void;
  mergePreview?: EditorMergePreview | null;
  // アクティブな線の中間駅（リフト用）。mode "midstation" で地図クリック配置
  midstation?: LngLat | null;
  onPlaceMidstation?: (lngLat: LngLat) => void;
  onMoveMidstation?: (lngLat: LngLat) => void;
  // タイルレイヤーを親で管理する場合に指定（未指定なら内部 state で管理）
  layerId?: TileLayerId;
  onLayerIdChange?: (layerId: TileLayerId) => void;
  // 非表示のまま地図を保持し、再表示時にサイズだけ再計算する
  visible?: boolean;
  // 線の名前を地図上に出す
  showLabels?: boolean;
  labelText?: (line: EditorMapLine, index: number) => string;
};

type DragTarget = { kind: "vertex"; index: number } | { kind: "midstation" };

const LINE_TOLERANCE_PX = LINE_HIT_WIDTH / 2 + 4;

const setSourceData = (
  map: MapLibreMap,
  sourceId: string,
  data: GeoJSON.FeatureCollection,
) => {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data);
};

/**
 * 編集用の地図。
 *
 * コース入力とリフト入力で共用する。
 * 線も頂点も GeoJSON のレイヤーで描き、頂点のドラッグだけ自前で組む。
 */
export function EditorMap({
  center,
  zoom,
  courses,
  backgroundLines = [],
  activeCourseId,
  mode,
  googleMapsApiKey,
  fitBoundsKey = 0,
  onSelectCourse,
  onAppendVertex,
  onMoveVertex,
  onInsertVertex,
  onDeleteVertex,
  onFinishDraw,
  onSplitVertex,
  onPickLinePoint,
  mergePreview = null,
  midstation = null,
  onPlaceMidstation,
  onMoveMidstation,
  layerId: controlledLayerId,
  onLayerIdChange,
  visible = true,
  showLabels = false,
  labelText,
}: EditorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const labelLayerRef = useRef<EditorLabelLayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hoveredCourseId, setHoveredCourseId] = useState<string | null>(null);

  const [internalLayerId, setInternalLayerId] =
    useState<TileLayerId>("gsiPale");
  const layerId = controlledLayerId ?? internalLayerId;
  const setLayerId = (id: TileLayerId) => {
    onLayerIdChange?.(id);
    if (controlledLayerId === undefined) setInternalLayerId(id);
  };

  const googleTileUrl = useGoogleTileUrl(googleMapsApiKey, layerId);
  const googleUnavailable =
    isGoogleTileLayer(layerId) && googleTileUrl === null;
  // Google タイルが未取得・取得失敗の間は地理院地図で代替する
  const effectiveLayerId: TileLayerId =
    isGoogleTileLayer(layerId) && typeof googleTileUrl !== "string"
      ? FALLBACK_TILE_LAYER
      : layerId;

  const activeCourse =
    courses.find(course => course.id === activeCourseId) ?? null;

  // イベントハンドラは地図に一度だけ登録するので、最新の値は ref から読む
  const latest = useRef({
    mode,
    courses,
    activeCourse,
    onSelectCourse,
    onAppendVertex,
    onMoveVertex,
    onInsertVertex,
    onDeleteVertex,
    onFinishDraw,
    onSplitVertex,
    onPickLinePoint,
    onPlaceMidstation,
    onMoveMidstation,
  });
  latest.current = {
    mode,
    courses,
    activeCourse,
    onSelectCourse,
    onAppendVertex,
    onMoveVertex,
    onInsertVertex,
    onDeleteVertex,
    onFinishDraw,
    onSplitVertex,
    onPickLinePoint,
    onPlaceMidstation,
    onMoveMidstation,
  };

  const draggingRef = useRef<DragTarget | null>(null);
  const dragMovedRef = useRef(false);
  // カーソルが今乗っている頂点。Backspace/Delete で消す対象を覚えておく
  const hoveredVertexRef = useRef<number | null>(null);

  // 生成時の値だけを使う。あとから変わっても地図は作り直さない
  const initialRef = useRef({ center, zoom, layerId: effectiveLayerId });

  // --- 地図の生成 ---------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const initial = initialRef.current;
    const map = new MapLibreMapClass({
      container,
      style: createEditorStyle(initial.layerId),
      center: initial.center,
      zoom: initial.zoom,
      maxZoom: getMapMaxZoom(initial.layerId),
      // 描画中のダブルクリックが誤ってズームにならないようにする
      doubleClickZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("load", () => {
      for (const sourceId of Object.values(EDITOR_SOURCE)) {
        if (map.getSource(sourceId)) continue;
        map.addSource(sourceId, { type: "geojson", data: EMPTY_COLLECTION });
      }
      for (const layer of createEditorLayers()) {
        if (map.getLayer(layer.id)) continue;
        map.addLayer(layer);
      }
      labelLayerRef.current = new EditorLabelLayer(map);
      setIsReady(true);
    });

    return () => {
      setIsReady(false);
      labelLayerRef.current?.clear();
      labelLayerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const map = mapRef.current;

  // --- 描くものを地図へ流し込む -------------------------------------------
  const lineCollection = useMemo(
    () => buildLineCollection(courses, activeCourseId, hoveredCourseId),
    [courses, activeCourseId, hoveredCourseId],
  );
  const backgroundCollection = useMemo(
    () => buildBackgroundCollection(backgroundLines),
    [backgroundLines],
  );
  const vertexCollection = useMemo(
    () => buildVertexCollection(activeCourse, mode),
    [activeCourse, mode],
  );
  const midpointCollection = useMemo(
    () => buildMidpointCollection(activeCourse, mode),
    [activeCourse, mode],
  );
  const midstationCollection = useMemo(
    () => buildMidstationCollection(activeCourse, midstation),
    [activeCourse, midstation],
  );
  const mergePreviewCollection = useMemo(
    () => buildMergePreviewCollection(mergePreview),
    [mergePreview],
  );
  const mergeDiscardedCollection = useMemo(
    () => buildMergeDiscardedCollection(mergePreview),
    [mergePreview],
  );
  const mergeAnchorCollection = useMemo(
    () => buildMergeAnchorCollection(mergePreview),
    [mergePreview],
  );

  useEffect(() => {
    if (!map || !isReady) return;
    setSourceData(map, EDITOR_SOURCE.lines, lineCollection);
    setSourceData(map, EDITOR_SOURCE.backgroundLines, backgroundCollection);
    setSourceData(map, EDITOR_SOURCE.vertices, vertexCollection);
    setSourceData(map, EDITOR_SOURCE.midpoints, midpointCollection);
    setSourceData(map, EDITOR_SOURCE.midstation, midstationCollection);
    setSourceData(map, EDITOR_SOURCE.mergePreview, mergePreviewCollection);
    setSourceData(map, EDITOR_SOURCE.mergeDiscarded, mergeDiscardedCollection);
    setSourceData(map, EDITOR_SOURCE.mergeAnchors, mergeAnchorCollection);
  }, [
    backgroundCollection,
    isReady,
    lineCollection,
    map,
    mergeAnchorCollection,
    mergeDiscardedCollection,
    mergePreviewCollection,
    midpointCollection,
    midstationCollection,
    vertexCollection,
  ]);

  // --- 線の名前ラベル -----------------------------------------------------
  useEffect(() => {
    if (!map || !isReady) return;
    const labelLayer = labelLayerRef.current;
    if (!labelLayer) return;
    if (!showLabels) {
      labelLayer.clear();
      return;
    }
    labelLayer.sync(
      buildLabels(
        courses,
        labelText ?? ((line, index) => line.name || `${index + 1}`),
      ),
      activeCourseId,
    );
  }, [activeCourseId, courses, isReady, labelText, map, showLabels]);

  // --- タイルの切り替え ---------------------------------------------------
  useEffect(() => {
    if (!map || !isReady) return;
    if (isGoogleTileLayer(layerId) && typeof googleTileUrl === "string") {
      addGoogleTileLayer(map, layerId, googleTileUrl);
    }
  }, [googleTileUrl, isReady, layerId, map]);

  useEffect(() => {
    if (!map || !isReady) return;
    for (const id of ALL_TILE_IDS) {
      const target = tileLayerId(id);
      if (!map.getLayer(target)) continue;
      map.setLayoutProperty(
        target,
        "visibility",
        id === effectiveLayerId ? "visible" : "none",
      );
    }
    map.setMaxZoom(getMapMaxZoom(effectiveLayerId));
  }, [effectiveLayerId, isReady, map]);

  // --- 視点 ---------------------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: center の変更時のみ視点を移動する
  useEffect(() => {
    if (!map || !isReady) return;
    map.jumpTo({ center, zoom });
  }, [center[0], center[1], isReady, map]);

  // 隠しているあいだは大きさが変わっても気づけないので、出すときに測り直す
  useEffect(() => {
    if (!map || !isReady || !visible) return;
    map.resize();

    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [isReady, map, visible]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fitBoundsKey の変更時のみ全体表示する
  useEffect(() => {
    if (!map || !isReady || fitBoundsKey === 0) return;
    const points = courses.flatMap(course => course.coordinates);
    if (points.length === 0) return;
    const bounds = getCoordinateBounds(points);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: 40 });
  }, [fitBoundsKey, isReady, map]);

  // --- タップ・右クリック・ドラッグ ---------------------------------------
  useEffect(() => {
    if (!map || !isReady) return;

    /** カーソルにいちばん近い線を、画面上の距離で選び直して返す */
    const nearestLine = (event: MapMouseEvent): EditorLinePick | null =>
      pickNearestLine(
        map,
        event.point,
        queryLineCandidateIds(map, event.point, EDITOR_LAYER.lineHit),
        latest.current.courses,
        LINE_TOLERANCE_PX,
      );

    /**
     * MapLibre にはレイヤー間の伝播も stopPropagation も無いので、
     * ハンドラを 1 つだけ置いて優先順位を自分で解く。
     * 「頂点や線に当たったら、何もしない場合でも下へ流さない」も保つ。
     */
    const handleClick = (event: MapMouseEvent) => {
      // ドラッグの直後に出るクリックは操作として数えない
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return;
      }
      const current = latest.current;
      const lngLat: LngLat = [event.lngLat.lng, event.lngLat.lat];

      const vertex = pickFeature(map, event.point, [EDITOR_LAYER.vertexHit]);
      if (vertex) {
        const index = Number(vertex.properties?.index);
        if (current.mode === "split") current.onSplitVertex?.(index);
        else if (current.mode === "draw" && vertex.properties?.kind === "last")
          current.onFinishDraw?.();
        return;
      }

      const midpoint = pickFeature(map, event.point, [
        EDITOR_LAYER.midpointHit,
      ]);
      if (midpoint) {
        const geometry = midpoint.geometry;
        if (geometry.type !== "Point") return;
        current.onInsertVertex?.(Number(midpoint.properties?.insertIndex), [
          geometry.coordinates[0],
          geometry.coordinates[1],
        ]);
        return;
      }

      // 中間駅にクリックの動作は無いが、下の線を拾わせない
      if (pickFeature(map, event.point, [EDITOR_LAYER.midstationHit])) return;

      const line = nearestLine(event);
      if (line) {
        if (current.mode === "merge") {
          current.onPickLinePoint?.(line);
          return;
        }
        // 編集中の線の上をクリックしたら、その場に点を足す。
        // 中点まで狙わなくても、線のどこでも 1 クリックで増やせる。
        if (
          current.mode === "edit" &&
          line.lineId === current.activeCourse?.id
        ) {
          current.onInsertVertex?.(line.segmentIndex + 1, line.lngLat);
          return;
        }
        current.onSelectCourse?.(line.lineId);
        return;
      }

      if (current.mode === "draw") current.onAppendVertex?.(lngLat);
      else if (current.mode === "midstation")
        current.onPlaceMidstation?.(lngLat);
    };

    const handleContextMenu = (event: MapMouseEvent) => {
      const current = latest.current;
      if (current.mode !== "edit" && current.mode !== "draw") return;
      const vertex = pickFeature(map, event.point, [EDITOR_LAYER.vertexHit]);
      if (!vertex) return;
      event.preventDefault();
      event.originalEvent.preventDefault();
      current.onDeleteVertex?.(Number(vertex.properties?.index));
    };

    const handleMouseDown = (event: MapMouseEvent) => {
      // 右クリック（コンテキストメニュー）や中クリックはドラッグ開始として扱わない
      if (event.originalEvent.button !== 0) return;
      const current = latest.current;
      const canDragVertex = current.mode === "edit" || current.mode === "draw";
      const canDragMidstation =
        current.mode === "edit" || current.mode === "midstation";

      // 重なったときは上に描いてある中間駅を優先する
      const midstationHit = canDragMidstation
        ? pickFeature(map, event.point, [EDITOR_LAYER.midstationHit])
        : null;
      const vertexHit =
        !midstationHit && canDragVertex
          ? pickFeature(map, event.point, [EDITOR_LAYER.vertexHit])
          : null;

      const target: DragTarget | null = midstationHit
        ? { kind: "midstation" }
        : vertexHit
          ? { kind: "vertex", index: Number(vertexHit.properties?.index) }
          : null;
      if (!target) return;

      event.preventDefault();
      draggingRef.current = target;
      dragMovedRef.current = false;
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    };

    const handleDragMove = (event: MapMouseEvent | MapTouchEvent) => {
      const target = draggingRef.current;
      if (!target) return;
      dragMovedRef.current = true;
      const lngLat: LngLat = [event.lngLat.lng, event.lngLat.lat];
      if (target.kind === "midstation") {
        latest.current.onMoveMidstation?.(lngLat);
      } else {
        latest.current.onMoveVertex?.(target.index, lngLat);
      }
    };

    const stopDrag = () => {
      if (!draggingRef.current) return;
      draggingRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    };

    map.on("click", handleClick);
    map.on("contextmenu", handleContextMenu);
    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleDragMove);
    map.on("touchmove", handleDragMove);
    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("touchend", stopDrag);

    return () => {
      map.off("click", handleClick);
      map.off("contextmenu", handleContextMenu);
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleDragMove);
      map.off("touchmove", handleDragMove);
      document.removeEventListener("mouseup", stopDrag);
      document.removeEventListener("touchend", stopDrag);
    };
  }, [isReady, map]);

  // --- ホバーの吹き出しとカーソル -----------------------------------------
  useEffect(() => {
    if (!map || !isReady) return;

    // Leaflet の sticky ツールチップと同じく、カーソルに付いてくる
    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: false,
      className: "editor-map-tooltip",
      offset: 14,
    });
    let currentHoveredId: string | null = null;
    const setHovered = (id: string | null) => {
      if (currentHoveredId === id) return;
      currentHoveredId = id;
      setHoveredCourseId(id);
    };
    const setInsertHint = (point: LngLat | null) => {
      setSourceData(
        map,
        EDITOR_SOURCE.insertHint,
        buildInsertHintCollection(point),
      );
    };

    const handleMove = (event: MapMouseEvent) => {
      if (draggingRef.current) return;
      const current = latest.current;
      const canvas = map.getCanvas();

      const show = (text: string) => {
        popup.setLngLat(event.lngLat).setText(text).addTo(map);
      };

      if (pickFeature(map, event.point, [EDITOR_LAYER.midstationHit])) {
        show("中間駅");
        canvas.style.cursor = "pointer";
        setHovered(null);
        setInsertHint(null);
        hoveredVertexRef.current = null;
        return;
      }

      const vertex = pickFeature(map, event.point, [EDITOR_LAYER.vertexHit]);
      hoveredVertexRef.current = vertex
        ? Number(vertex.properties?.index)
        : null;
      const onMidpoint =
        !vertex && pickFeature(map, event.point, [EDITOR_LAYER.midpointHit]);

      if (vertex || onMidpoint) {
        popup.remove();
        canvas.style.cursor = "pointer";
        setHovered(null);
        setInsertHint(null);
        return;
      }

      const line = pickNearestLine(
        map,
        event.point,
        queryLineCandidateIds(map, event.point, EDITOR_LAYER.lineHit),
        current.courses,
        LINE_TOLERANCE_PX,
      );
      if (line) {
        const hovered = current.courses.find(item => item.id === line.lineId);
        const isActiveLine = line.lineId === current.activeCourse?.id;
        const canInsert = current.mode === "edit" && isActiveLine;
        show(
          canInsert
            ? "クリックでここに点を追加"
            : current.mode === "merge"
              ? `ここでつなぐ: ${hovered?.name || "（名前未入力）"}`
              : hovered?.name || "（名前未入力）",
        );
        canvas.style.cursor = "pointer";
        setHovered(isActiveLine ? null : line.lineId);
        setInsertHint(canInsert ? line.lngLat : null);
        return;
      }

      popup.remove();
      setHovered(null);
      setInsertHint(null);
      canvas.style.cursor =
        current.mode === "draw" || current.mode === "midstation"
          ? "crosshair"
          : "";
    };

    const handleOut = () => {
      popup.remove();
      hoveredVertexRef.current = null;
      setHovered(null);
      setInsertHint(null);
      map.getCanvas().style.cursor = "";
    };

    /**
     * カーソルが乗っている頂点を Backspace/Delete で消す。
     * 右クリックでの削除と同じ対象を、キーボードからも操作できるようにする。
     * フォームの入力中に誤爆しないよう、編集可能な要素にフォーカスがある間は無視する。
     */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const index = hoveredVertexRef.current;
      if (index === null) return;
      const current = latest.current;
      if (current.mode !== "edit" && current.mode !== "draw") return;
      event.preventDefault();
      hoveredVertexRef.current = null;
      current.onDeleteVertex?.(index);
    };

    map.on("mousemove", handleMove);
    map.on("mouseout", handleOut);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      map.off("mousemove", handleMove);
      map.off("mouseout", handleOut);
      document.removeEventListener("keydown", handleKeyDown);
      popup.remove();
    };
  }, [isReady, map]);

  return (
    // isolate で重なりの文脈を閉じ、地図の上の要素がダイアログより前へ出ないようにする
    <div className="relative isolate h-full w-full" data-editor-map="true">
      <div ref={containerRef} className="h-full w-full" />
      <EditorTileSwitcher
        layerId={layerId}
        onLayerIdChange={setLayerId}
        googleMapsApiKey={googleMapsApiKey}
        googleUnavailable={googleUnavailable}
      />
    </div>
  );
}
