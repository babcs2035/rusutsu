"use client";

import { Trash2, Undo2 } from "lucide-react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  MapTouchEvent,
} from "maplibre-gl";
import { Map as MapLibreMapClass, Popup } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
// ワーカー URL の設定。import した時点で副作用として走る
import "@/features/map/maplibre/mapWorker";
import { getCoordinateBounds } from "@/features/map/maplibre/viewport";
import type { LngLat, TileLayerId } from "../../types";
import { EditorTileSwitcher } from "./EditorTileSwitcher";
import { buildLabels, EditorLabelLayer } from "./editorLabels";
import {
  CORRECTION_ACTIVE_COURSE_WIDTH,
  CORRECTION_COURSE_WIDTH,
  createEditorLayers,
  EDITOR_LAYER,
  EDITOR_SOURCE,
  HIT_RADIUS,
  LINE_HIT_WIDTH,
  RADIUS,
  TOUCH_MIDPOINT_HIT_RADIUS,
  TOUCH_MIDPOINT_RADIUS,
  TOUCH_VERTEX_HIT_RADIUS,
  TOUCH_VERTEX_RADIUS,
} from "./editorLayers";
import {
  pickFeature,
  pickNearestLine,
  queryLineCandidateIds,
} from "./editorPicking";
import {
  buildBackgroundCollection,
  buildCorrectionMaskCollection,
  buildCorrectionSelectionCollection,
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
  EDITOR_MAX_ZOOM,
  FALLBACK_TILE_LAYER,
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
  backgroundLineAppearance?: "muted" | "lift";
  // 申請の編集中に、公開中のデータから変わった線を色分けする
  highlightedLineIds?: ReadonlySet<string>;
  activeCourseId: string | null;
  mode: EditorMapMode;
  googleMapsApiKey: string | null;
  // 値が変わるたびに全コースへ fitBounds する
  fitBoundsKey?: number;
  fitBoundsToBackground?: boolean;
  // 値が変わるたびに、選択中の線が収まる位置へ寄せる（一覧から選んだとき用）
  focusActiveKey?: number;
  showTileSwitcher?: boolean;
  correctionPreview?: boolean;
  correctionSelection?: { lineId: string; from: number; to: number };
  readOnlyPick?: boolean;
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
  // 背景を白黒にする（公開の地図の「白黒／カラー」と同じ見え方）
  monochrome?: boolean;
  /**
   * 描いている間の「1点戻す／描き終える」を地図の上に出すか。
   * 既定は指で操作する端末だけ。横の一覧に同じボタンが無い画面では "always" にする。
   */
  drawToolbar?: "touch" | "always";
};

const TOUCH_QUERY = "(pointer: coarse), (max-width: 47.999em)";

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
  backgroundLineAppearance = "muted",
  highlightedLineIds,
  activeCourseId,
  mode,
  googleMapsApiKey,
  fitBoundsKey = 0,
  fitBoundsToBackground = false,
  focusActiveKey = 0,
  showTileSwitcher = true,
  correctionPreview = false,
  correctionSelection: correctionSelectionProp,
  readOnlyPick = false,
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
  monochrome = false,
  drawToolbar = "touch",
}: EditorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const labelLayerRef = useRef<EditorLabelLayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hoveredCourseId, setHoveredCourseId] = useState<string | null>(null);
  // タップで選んだ点。スマホには右クリックもキーボードも無いので、
  // 点を選んでから地図の上の「この点を削除」で消す。
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(TOUCH_QUERY);
    const update = () => setIsTouch(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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
  // 線・モード・点の数が変わると番号がずれるので、選択を外す
  const vertexCount = activeCourse?.coordinates.length ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 対象が変わったときだけ選択を外す
  useEffect(() => {
    setSelectedVertex(null);
  }, [activeCourseId, mode, vertexCount]);

  // イベントハンドラは地図に一度だけ登録するので、最新の値は ref から読む
  const latest = useRef({
    mode,
    readOnlyPick,
    courses,
    backgroundLines,
    backgroundLineAppearance,
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
    readOnlyPick,
    courses,
    backgroundLines,
    backgroundLineAppearance,
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
      maxZoom: EDITOR_MAX_ZOOM,
      // 描画中のダブルクリックが誤ってズームにならないようにする
      doubleClickZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      attributionControl: { compact: false },
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

  useEffect(() => {
    if (!map || !isReady) return;
    const isLift = backgroundLineAppearance === "lift";
    map.setPaintProperty(
      EDITOR_LAYER.backgroundLine,
      "line-color",
      isLift ? "#C026D3" : "#4A5568",
    );
    map.setPaintProperty(
      EDITOR_LAYER.backgroundLine,
      "line-width",
      isLift ? 4.5 : 3,
    );
    map.setPaintProperty(
      EDITOR_LAYER.backgroundLine,
      "line-opacity",
      isLift ? 1 : 0.55,
    );
  }, [backgroundLineAppearance, isReady, map]);

  useEffect(() => {
    if (!map || !isReady) return;
    map.setPaintProperty(
      EDITOR_LAYER.lineInactive,
      "line-color",
      correctionPreview
        ? [
            "case",
            ["boolean", ["get", "highlighted"], false],
            "#F59E0B",
            ["coalesce", ["get", "previewColor"], "#3182CE"],
          ]
        : [
            "case",
            ["boolean", ["get", "highlighted"], false],
            "#F59E0B",
            "#3182CE",
          ],
    );
    map.setPaintProperty(
      EDITOR_LAYER.lineInactive,
      "line-width",
      correctionPreview ? CORRECTION_COURSE_WIDTH : 3,
    );
    map.setPaintProperty(
      EDITOR_LAYER.lineActive,
      "line-color",
      correctionPreview
        ? ["coalesce", ["get", "previewColor"], "#E53E3E"]
        : "#E53E3E",
    );
    map.setPaintProperty(
      EDITOR_LAYER.lineActive,
      "line-width",
      correctionPreview ? CORRECTION_ACTIVE_COURSE_WIDTH : 5,
    );
  }, [correctionPreview, isReady, map]);

  // --- 描くものを地図へ流し込む -------------------------------------------
  const lineCollection = useMemo(
    () =>
      buildLineCollection(
        courses,
        activeCourseId,
        hoveredCourseId,
        highlightedLineIds,
        correctionPreview,
      ),
    [
      courses,
      activeCourseId,
      hoveredCourseId,
      highlightedLineIds,
      correctionPreview,
    ],
  );
  const correctionMasks = useMemo(
    () =>
      correctionPreview
        ? buildCorrectionMaskCollection(courses, activeCourseId)
        : EMPTY_COLLECTION,
    [activeCourseId, correctionPreview, courses],
  );
  const correctionSelectionCollection = useMemo(
    () =>
      correctionPreview
        ? buildCorrectionSelectionCollection(courses, correctionSelectionProp)
        : EMPTY_COLLECTION,
    [correctionPreview, courses, correctionSelectionProp],
  );
  const backgroundCollection = useMemo(
    () => buildBackgroundCollection(backgroundLines),
    [backgroundLines],
  );
  const vertexCollection = useMemo(
    () =>
      buildVertexCollection(
        activeCourse,
        mode,
        mode === "edit" ? selectedVertex : null,
      ),
    [activeCourse, mode, selectedVertex],
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
    setSourceData(map, EDITOR_SOURCE.correctionMasks, correctionMasks);
    setSourceData(
      map,
      EDITOR_SOURCE.correctionSelection,
      correctionSelectionCollection,
    );
    setSourceData(map, EDITOR_SOURCE.vertices, vertexCollection);
    setSourceData(map, EDITOR_SOURCE.midpoints, midpointCollection);
    setSourceData(map, EDITOR_SOURCE.midstation, midstationCollection);
    setSourceData(map, EDITOR_SOURCE.mergePreview, mergePreviewCollection);
    setSourceData(map, EDITOR_SOURCE.mergeDiscarded, mergeDiscardedCollection);
    setSourceData(map, EDITOR_SOURCE.mergeAnchors, mergeAnchorCollection);
  }, [
    backgroundCollection,
    correctionMasks,
    correctionSelectionCollection,
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
  }, [effectiveLayerId, isReady, map]);

  // 白黒はタイルの彩度だけを落とす。線の色はそのまま残る
  // biome-ignore lint/correctness/useExhaustiveDependencies: Google タイルは後から足されるので、背景が替わるたびに当て直す
  useEffect(() => {
    if (!map || !isReady) return;
    for (const id of ALL_TILE_IDS) {
      const target = tileLayerId(id);
      if (!map.getLayer(target)) continue;
      map.setPaintProperty(target, "raster-saturation", monochrome ? -1 : 0);
    }
  }, [effectiveLayerId, googleTileUrl, isReady, map, monochrome]);

  // 指で操作する端末では、点を大きく描き、つかめる範囲も広げる
  useEffect(() => {
    if (!map || !isReady) return;
    map.setPaintProperty(
      EDITOR_LAYER.vertex,
      "circle-radius",
      isTouch
        ? TOUCH_VERTEX_RADIUS
        : [
            "match",
            ["get", "kind"],
            "last",
            RADIUS.lastVertex,
            "split",
            RADIUS.splitVertex,
            RADIUS.vertex,
          ],
    );
    map.setPaintProperty(
      EDITOR_LAYER.vertexHit,
      "circle-radius",
      isTouch ? TOUCH_VERTEX_HIT_RADIUS : HIT_RADIUS.vertex,
    );
    map.setPaintProperty(
      EDITOR_LAYER.midpoint,
      "circle-radius",
      isTouch ? TOUCH_MIDPOINT_RADIUS : RADIUS.midpoint,
    );
    map.setPaintProperty(
      EDITOR_LAYER.midpointHit,
      "circle-radius",
      isTouch ? TOUCH_MIDPOINT_HIT_RADIUS : HIT_RADIUS.midpoint,
    );
  }, [isReady, isTouch, map]);

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
    const points = (
      fitBoundsToBackground ? [...courses, ...backgroundLines] : courses
    ).flatMap(course => course.coordinates);
    if (points.length === 0) return;
    const bounds = getCoordinateBounds(points);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: 40 });
  }, [fitBoundsKey, isReady, map]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: focusActiveKey の変更時のみ選択中の線へ寄せる
  useEffect(() => {
    if (!map || !isReady || focusActiveKey === 0) return;
    const bounds = getCoordinateBounds(activeCourse?.coordinates ?? []);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: 56, maxZoom: 17, duration: 400 });
  }, [focusActiveKey, isReady, map]);

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

      // 中間駅の配置中は、線や頂点の選択よりクリック位置への配置を優先する。
      if (current.mode === "midstation") {
        current.onPlaceMidstation?.(lngLat);
        return;
      }

      const vertex = pickFeature(map, event.point, [EDITOR_LAYER.vertexHit]);
      if (vertex) {
        const index = Number(vertex.properties?.index);
        if (current.mode === "split") current.onSplitVertex?.(index);
        else if (current.mode === "draw" && vertex.properties?.kind === "last")
          current.onFinishDraw?.();
        // 編集中は点を選ぶ。もう一度押すと選択を外す
        else if (current.mode === "edit")
          setSelectedVertex(selected => (selected === index ? null : index));
        return;
      }

      // 作図中は既存の線を選ばず、クリックした位置に続きを描く。
      if (current.mode === "draw") {
        current.onAppendVertex?.(lngLat);
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
        if (current.readOnlyPick || current.mode === "merge") {
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

    /** 押した位置に点や中間駅があれば、つかんで動かし始める */
    const beginDrag = (event: MapMouseEvent | MapTouchEvent) => {
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

    const handleMouseDown = (event: MapMouseEvent) => {
      // 右クリック（コンテキストメニュー）や中クリックはドラッグ開始として扱わない
      if (event.originalEvent.button !== 0) return;
      beginDrag(event);
    };

    // 指1本で点に触れたときだけつかむ。2本目が触れたら拡大・縮小に譲る
    const handleTouchStart = (event: MapTouchEvent) => {
      if (event.points.length !== 1) {
        stopDrag();
        return;
      }
      dragMovedRef.current = false;
      beginDrag(event);
    };

    const handleDragMove = (event: MapMouseEvent | MapTouchEvent) => {
      const target = draggingRef.current;
      if (!target) return;
      // 点を動かしている間は、ページのスクロールや地図の移動を起こさない
      if (event.originalEvent.cancelable) event.originalEvent.preventDefault();
      if (!dragMovedRef.current && target.kind === "vertex")
        setSelectedVertex(target.index);
      dragMovedRef.current = true;
      const lngLat: LngLat = [event.lngLat.lng, event.lngLat.lat];
      if (target.kind === "midstation") {
        latest.current.onMoveMidstation?.(lngLat);
      } else {
        latest.current.onMoveVertex?.(target.index, lngLat);
      }
    };

    function stopDrag() {
      if (!draggingRef.current) return;
      draggingRef.current = null;
      map?.dragPan.enable();
      if (map) map.getCanvas().style.cursor = "";
    }

    map.on("click", handleClick);
    map.on("contextmenu", handleContextMenu);
    map.on("mousedown", handleMouseDown);
    map.on("touchstart", handleTouchStart);
    map.on("mousemove", handleDragMove);
    map.on("touchmove", handleDragMove);
    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("touchend", stopDrag);
    document.addEventListener("touchcancel", stopDrag);

    return () => {
      map.off("click", handleClick);
      map.off("contextmenu", handleContextMenu);
      map.off("mousedown", handleMouseDown);
      map.off("touchstart", handleTouchStart);
      map.off("mousemove", handleDragMove);
      map.off("touchmove", handleDragMove);
      document.removeEventListener("mouseup", stopDrag);
      document.removeEventListener("touchend", stopDrag);
      document.removeEventListener("touchcancel", stopDrag);
    };
  }, [isReady, map]);

  // --- ホバーの吹き出しとカーソル -----------------------------------------
  useEffect(() => {
    if (!map || !isReady) return;
    map.getCanvas().style.cursor =
      mode === "draw" || mode === "midstation" ? "crosshair" : "";

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

      if (current.mode === "midstation") {
        popup.remove();
        canvas.style.cursor = "crosshair";
        setHovered(null);
        setInsertHint(null);
        hoveredVertexRef.current = null;
        return;
      }

      if (
        current.mode !== "draw" &&
        pickFeature(map, event.point, [EDITOR_LAYER.midstationHit])
      ) {
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

      if (current.mode === "draw") {
        popup.remove();
        canvas.style.cursor = "crosshair";
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
            : current.readOnlyPick
              ? "タップして区間の端点を選択"
              : current.mode === "merge"
                ? `ここでつなぐ: ${hovered?.name || "（名前未入力）"}`
                : hovered?.name || "（名前未入力）",
        );
        canvas.style.cursor = "pointer";
        setHovered(isActiveLine ? null : line.lineId);
        setInsertHint(canInsert ? line.lngLat : null);
        return;
      }

      setHovered(null);
      setInsertHint(null);
      canvas.style.cursor = "";

      // 参照用リフトの名前は、描画中を除きコースの操作より優先度を下げて表示する。
      if (current.backgroundLineAppearance === "lift") {
        const lift = pickNearestLine(
          map,
          event.point,
          queryLineCandidateIds(map, event.point, EDITOR_LAYER.backgroundLine),
          current.backgroundLines,
          LINE_TOLERANCE_PX,
        );
        if (lift) {
          const hovered = current.backgroundLines.find(
            item => item.id === lift.lineId,
          );
          show(hovered?.name || "（名前未入力）");
          return;
        }
      }

      popup.remove();
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
      // 地図自体が破棄された後はソースを更新しない。
      if (mapRef.current === map) handleOut();
      else popup.remove();
    };
  }, [isReady, map, mode]);

  const showDrawToolbar =
    mode === "draw" && (drawToolbar === "always" || isTouch) && !!activeCourse;
  const showVertexToolbar =
    mode === "edit" && selectedVertex !== null && !!activeCourse;

  return (
    // isolate で重なりの文脈を閉じ、地図の上の要素がダイアログより前へ出ないようにする
    <div className="relative isolate h-full w-full" data-editor-map="true">
      <div ref={containerRef} className="h-full w-full" />
      {(showDrawToolbar || showVertexToolbar) && (
        // 指が届きやすい地図の下端に置く。著作権表示（右下）とは重ねない
        <div className="pointer-events-none absolute inset-x-0 bottom-7 z-20 flex justify-center gap-2 px-2">
          {showDrawToolbar && (
            <>
              <Button
                type="button"
                variant="outline"
                className="pointer-events-auto h-9 bg-white px-3 text-sm font-semibold shadow-md"
                disabled={vertexCount === 0}
                onClick={() => onDeleteVertex?.(vertexCount - 1)}
              >
                <Undo2 aria-hidden="true" />
                1点戻す
              </Button>
              <Button
                type="button"
                className="pointer-events-auto h-9 px-3 text-sm font-semibold shadow-md"
                disabled={vertexCount < 2}
                onClick={() => onFinishDraw?.()}
              >
                描き終える
              </Button>
            </>
          )}
          {showVertexToolbar && (
            <Button
              type="button"
              variant="outline"
              className="pointer-events-auto h-9 border-red-300 bg-white px-3 text-sm font-semibold text-red-700 shadow-md hover:bg-red-50 hover:text-red-800"
              disabled={vertexCount <= 2}
              onClick={() => {
                if (selectedVertex === null) return;
                onDeleteVertex?.(selectedVertex);
                setSelectedVertex(null);
              }}
            >
              <Trash2 aria-hidden="true" />
              この点を削除
            </Button>
          )}
        </div>
      )}
      {showTileSwitcher && (
        <EditorTileSwitcher
          layerId={layerId}
          onLayerIdChange={setLayerId}
          googleMapsApiKey={googleMapsApiKey}
          googleUnavailable={googleUnavailable}
        />
      )}
    </div>
  );
}
