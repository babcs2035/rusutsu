"use client";

import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import {
  type FinalizedCourseFeature,
  type FinalizedLiftFeature,
  getCoordinatesElevationDrop,
  getLiftClass,
  LIFT_CLASS_LABEL_WEIGHT,
} from "@/lib/finalizedResortGeojsonShared";
import {
  COURSE_LABEL_MIN_ZOOM,
  DIRECTION_MARK_HALF_WIDTH,
  DIRECTION_MARK_LENGTH,
  DIRECTION_MARK_MIN_ZOOM,
  DIRECTION_MARK_SPACING_BY_ZOOM,
  FINALIZED_LABEL_PANE,
  LIFT_LABEL_MIN_ZOOM,
  LIFT_LABEL_MIN_ZOOM_BY_CLASS,
  LINE_LABEL_TWO_LABEL_MIN_LENGTH_PX,
} from "../constants";
import type { FinalizedFeatureStatus, SelectedMapFeature } from "../types";
import {
  getFeatureStatusKind,
  getLiftDisplayCoordinates,
  toLatLngTuple,
} from "../utils/finalizedMapData";
import { measureCanvasTextWidth } from "../utils/leafletIcons";
import { getMapInternals } from "../utils/leafletInternals";
import type { LayoutPoint, OrientedRect } from "../utils/lineLayout";
import {
  collectDirectionMarks,
  collectLabelCandidates,
  type DirectionMark,
  getCourseLabelName,
  getDirectionMarkPath,
  getLabelCollisionPadding,
  getLabelFont,
  type LabelPlacement,
  type LabelSource,
  placeLabelCandidates,
  shouldSkipCourseLabel,
} from "../utils/lineOverlayLayout";
import { hasLiftFlow } from "../utils/lineStyle";

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_BOUNDS_PADDING = 0.4;
const LABEL_FADE_IN_MS = 150;
const DIRECTION_MARK_MIN_ELEVATION_DROP_M = 5;
const DIRECTION_MARK_MAX_PER_LINE = 10;
const SELECTED_MARK_SCALE = 1.35;
/**
 * 配置済みの 1 要素。
 *
 * 位置は緯度経度でも持つ。ズームが変わったときは、衝突判定をやり直さずに
 * この座標を投影し直すだけで正しい位置に戻せる。
 */
type PositionedItem = {
  element: SVGGElement | SVGPathElement;
  latLng: L.LatLng;
  angle: number;
  /** 現在のレイヤー座標 */
  layerPoint: L.Point;
};

const measureWidth = (text: string, fontSize: number) =>
  measureCanvasTextWidth(text, getLabelFont(fontSize));

const getDirectionSpacing = (zoom: number) => {
  const rounded = Math.round(zoom);
  return (
    DIRECTION_MARK_SPACING_BY_ZOOM[rounded] ??
    (rounded < DIRECTION_MARK_MIN_ZOOM ? 200 : 95)
  );
};

const getDirectionMarkScale = (zoom: number) => {
  if (zoom >= 17) return 1.1;
  if (zoom <= 14) return 0.88;
  return 1;
};

const getItemTransform = (item: PositionedItem) =>
  `translate(${item.layerPoint.x.toFixed(1)} ${item.layerPoint.y.toFixed(1)}) rotate(${item.angle.toFixed(1)})`;

const appendLabelText = (group: SVGGElement, placement: LabelPlacement) => {
  const stateClass = placement.isSelected
    ? " is-selected"
    : placement.isMuted
      ? " is-muted"
      : "";
  const baseClass = `finalized-line-label-text finalized-line-label-${placement.kind}${stateClass}`;

  for (const variant of ["halo", "fill"] as const) {
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", `${baseClass} finalized-line-label-${variant}`);
    text.setAttribute("x", "0");
    text.setAttribute("y", "0");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("font-size", `${placement.fontSize}`);
    text.textContent = placement.name;
    group.append(text);
  }
};

/**
 * コース名・リフト名と、進行方向の矢羽をまとめて描く 1 枚の SVG。
 *
 * ラベルと矢羽は同じ衝突判定を共有する必要があるため（矢羽をラベルの下に
 * 潜らせない / FR-4.2）、別コンポーネントに分けずここで両方を組み立てる。
 * 描画順は矢羽 → ラベルで、ラベルが常に上に来る。
 *
 * ズーム中はペインごと拡大されるに任せ（要素ごとに逆スケールを書き戻すと
 * 1 フレームあたり数百回の DOM 書き込みになって重い）、ズームが確定した時点で
 * その場で組み直す。
 */
export const FinalizedLineOverlay = ({
  courses,
  lifts,
  selectedFeature,
  onSelectFeature,
  showOpenOnly,
}: {
  /** 滑走方向（標高降順）に正規化済みのコース */
  courses: FinalizedCourseFeature[];
  lifts: FinalizedLiftFeature[];
  selectedFeature: SelectedMapFeature | null;
  onSelectFeature: (feature: SelectedMapFeature) => void;
  showOpenOnly: boolean;
}) => {
  const map = useMap();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const itemsRef = useRef<PositionedItem[]>([]);
  const layoutZoomRef = useRef<number | null>(null);
  const boundsCenterRef = useRef<L.LatLng | null>(null);
  const boundsZoomRef = useRef<number | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const courseLabelGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        name: string;
        sourceIds: string[];
        statuses: FinalizedFeatureStatus[];
        lines: FinalizedCourseFeature[];
      }
    >();

    for (const course of courses) {
      const name = getCourseLabelName(course.displayName);
      if (shouldSkipCourseLabel(name)) continue;

      const group = groups.get(name) ?? {
        name,
        sourceIds: [],
        statuses: [],
        lines: [],
      };
      group.sourceIds.push(course.groupId);
      group.statuses.push(getFeatureStatusKind(course.properties.status));
      group.lines.push(course);
      groups.set(name, group);
    }

    return [...groups.values()];
  }, [courses]);

  const renderOverlay = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const zoom = map.getZoom();
    const project = (coordinates: FinalizedCourseFeature["coordinates"]) =>
      coordinates.map<LayoutPoint>(coordinate => {
        const point = map.latLngToLayerPoint(toLatLngTuple(coordinate));
        return { x: point.x, y: point.y };
      });
    const isSelectedId = (kind: "course" | "lift", ids: string[]) =>
      selectedFeature?.kind === kind && ids.includes(selectedFeature.id);
    const hasSelection = selectedFeature !== null;

    const labelPadding = getLabelCollisionPadding(zoom);
    const placedRects: OrientedRect[] = [];
    const labelPlacements: LabelPlacement[] = [];
    const liftPoints = new Map<string, LayoutPoint[]>();

    for (const lift of lifts) {
      liftPoints.set(lift.id, project(getLiftDisplayCoordinates(lift)));
    }

    // 何かを選択しているときは名前を出さない。名前はパネル側に出ているので、
    // 地図は選択した線そのものを見せることに集中させる。
    // リフトを先に置き、その矩形をコースの衝突判定に渡す（既存の優先順を踏襲）
    if (!hasSelection && zoom >= LIFT_LABEL_MIN_ZOOM) {
      const liftSources = lifts.flatMap<LabelSource>(lift => {
        if (lift.name.length === 0) return [];

        const status = getFeatureStatusKind(lift.properties.status);
        const isSelected = isSelectedId("lift", [lift.id]);
        const liftClass = getLiftClass(lift);
        if (!isSelected && zoom < LIFT_LABEL_MIN_ZOOM_BY_CLASS[liftClass]) {
          return [];
        }

        return [
          {
            kind: "lift",
            sourceIds: [lift.id],
            primaryId: lift.id,
            name: lift.name,
            status,
            weight: LIFT_CLASS_LABEL_WEIGHT[liftClass],
            // 表示用の座標は下→上なので、名前は山頂側から始まるよう反転する
            points: [...(liftPoints.get(lift.id) ?? [])].reverse(),
            isSelected,
            isMuted: showOpenOnly && status !== "open" && !isSelected,
          },
        ];
      });

      labelPlacements.push(
        ...placeLabelCandidates(
          collectLabelCandidates({
            sources: liftSources,
            zoom,
            twoLabelMinLength: LINE_LABEL_TWO_LABEL_MIN_LENGTH_PX,
            measureWidth,
          }),
          placedRects,
          labelPadding,
        ),
      );
    }

    const coursePoints = new Map<string, LayoutPoint[]>();
    for (const course of courses) {
      coursePoints.set(course.id, project(course.coordinates));
    }

    if (!hasSelection && zoom >= COURSE_LABEL_MIN_ZOOM) {
      const courseSources = courseLabelGroups.flatMap<LabelSource>(group => {
        const isSelected = isSelectedId("course", group.sourceIds);
        const status = group.statuses.includes("open")
          ? "open"
          : (group.statuses[0] ?? "unknown");

        // 同名のコースが複数線に分かれている場合はもっとも長い線に名前を置く
        const longest = group.lines
          .map(course => {
            const points = coursePoints.get(course.id) ?? [];
            let length = 0;
            for (let index = 1; index < points.length; index += 1) {
              const previous = points[index - 1];
              const current = points[index];
              if (!previous || !current) continue;
              length += Math.hypot(
                current.x - previous.x,
                current.y - previous.y,
              );
            }
            return { course, points, length };
          })
          .sort((a, b) => b.length - a.length)[0];
        if (!longest || longest.length <= 0) return [];

        return [
          {
            kind: "course",
            sourceIds: group.sourceIds,
            primaryId: longest.course.groupId,
            name: group.name,
            status,
            weight: 1,
            points: longest.points,
            isSelected,
            isMuted: showOpenOnly && status !== "open" && !isSelected,
          },
        ];
      });

      labelPlacements.push(
        ...placeLabelCandidates(
          collectLabelCandidates({
            sources: courseSources,
            zoom,
            twoLabelMinLength: LINE_LABEL_TWO_LABEL_MIN_LENGTH_PX,
            measureWidth,
          }),
          placedRects,
          labelPadding,
        ),
      );
    }

    const directionMarks: DirectionMark[] = [];
    if (zoom >= DIRECTION_MARK_MIN_ZOOM) {
      const spacing = getDirectionSpacing(zoom);
      const scale = getDirectionMarkScale(zoom);
      const markLength = DIRECTION_MARK_LENGTH * scale;

      for (const course of courses) {
        const status = getFeatureStatusKind(course.properties.status);
        const isSelected = isSelectedId("course", [course.groupId]);
        // 沈ませた線の上の矢羽はノイズにしかならないので出さない
        if (!isSelected && showOpenOnly && status !== "open") continue;

        const drop = getCoordinatesElevationDrop(course.coordinates);
        if (drop == null || drop < DIRECTION_MARK_MIN_ELEVATION_DROP_M) {
          continue;
        }

        directionMarks.push(
          ...collectDirectionMarks({
            id: `course:${course.id}`,
            points: coursePoints.get(course.id) ?? [],
            spacing,
            markLength,
            maxCount: DIRECTION_MARK_MAX_PER_LINE,
            avoidRects: placedRects,
            isSelected,
            scale: isSelected ? scale * SELECTED_MARK_SCALE : scale,
          }),
        );
      }

      for (const lift of lifts) {
        const status = getFeatureStatusKind(lift.properties.status);
        const isSelected = isSelectedId("lift", [lift.id]);
        // 営業中のリフトは流れる破線が方向を示すので矢羽は不要。
        // ただし動きを止める設定では方向情報が失われるため矢羽を出す（FR-4.6）。
        if (hasLiftFlow(status) && !prefersReducedMotion) continue;
        if (!isSelected && showOpenOnly && status !== "open") continue;

        directionMarks.push(
          ...collectDirectionMarks({
            id: `lift:${lift.id}`,
            points: liftPoints.get(lift.id) ?? [],
            spacing: spacing * 1.15,
            markLength: markLength * 0.92,
            maxCount: DIRECTION_MARK_MAX_PER_LINE,
            avoidRects: placedRects,
            isSelected,
            scale: isSelected ? scale * SELECTED_MARK_SCALE : scale,
          }),
        );
      }
    }

    while (svg.firstChild) svg.firstChild.remove();
    const items: PositionedItem[] = [];
    const addItem = (
      element: SVGGElement | SVGPathElement,
      x: number,
      y: number,
      angle: number,
    ) => {
      const layerPoint = L.point(x, y);
      items.push({
        element,
        angle,
        layerPoint,
        latLng: map.layerPointToLatLng(layerPoint),
      });
    };

    const markGroup = document.createElementNS(SVG_NS, "g");
    markGroup.setAttribute("class", "finalized-direction-marks");
    const markPathCache = new Map<number, string>();
    for (const mark of directionMarks) {
      const cached = markPathCache.get(mark.scale);
      const path =
        cached ??
        getDirectionMarkPath(
          DIRECTION_MARK_LENGTH * mark.scale,
          DIRECTION_MARK_HALF_WIDTH * mark.scale,
        );
      markPathCache.set(mark.scale, path);

      const element = document.createElementNS(SVG_NS, "path");
      element.setAttribute(
        "class",
        [
          "finalized-direction-mark",
          mark.isSelected ? "is-selected" : "",
          hasSelection && !mark.isSelected ? "is-dimmed" : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      element.setAttribute("d", path);
      markGroup.append(element);
      addItem(element, mark.x, mark.y, mark.angle);
    }
    svg.append(markGroup);

    const labelGroup = document.createElementNS(SVG_NS, "g");
    labelGroup.setAttribute("class", "finalized-line-labels");
    for (const placement of labelPlacements) {
      const group = document.createElementNS(SVG_NS, "g");
      if (hasSelection && !placement.isSelected) {
        group.setAttribute("class", "is-dimmed");
      }
      appendLabelText(group, placement);

      // ラベル自体をタップ可能にする（細い線より狙いやすい / FR-3.13）
      const hit = document.createElementNS(SVG_NS, "rect");
      const hitWidth = placement.boxWidth + 8;
      const hitHeight = placement.boxHeight + 8;
      hit.setAttribute("class", "finalized-line-label-hit");
      hit.setAttribute("x", (-hitWidth / 2).toFixed(1));
      hit.setAttribute("y", (-hitHeight / 2).toFixed(1));
      hit.setAttribute("width", hitWidth.toFixed(1));
      hit.setAttribute("height", hitHeight.toFixed(1));
      hit.addEventListener("click", event => {
        event.stopPropagation();
        onSelectFeature({ kind: placement.kind, id: placement.selectId });
      });
      group.append(hit);
      labelGroup.append(group);
      addItem(group, placement.x, placement.y, placement.angle);
    }
    svg.append(labelGroup);

    for (const item of items) {
      item.element.setAttribute("transform", getItemTransform(item));
    }
    itemsRef.current = items;
    layoutZoomRef.current = zoom;

    svg.style.opacity = "0";
    window.requestAnimationFrame(() => {
      svg.style.opacity = "1";
    });
  }, [
    courseLabelGroups,
    courses,
    lifts,
    map,
    onSelectFeature,
    prefersReducedMotion,
    selectedFeature,
    showOpenOnly,
  ]);

  /** ズーム確定後の再配置。衝突判定はやり直さず、投影し直すだけ */
  const repositionItems = useCallback(() => {
    for (const item of itemsRef.current) {
      item.layerPoint = map.latLngToLayerPoint(item.latLng);
      item.element.setAttribute("transform", getItemTransform(item));
    }
    layoutZoomRef.current = map.getZoom();
  }, [map]);

  const updateBounds = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const size = map.getSize();
    const min = map
      .containerPointToLayerPoint(size.multiplyBy(-SVG_BOUNDS_PADDING))
      .round();
    const boundsSize = size.multiplyBy(1 + SVG_BOUNDS_PADDING * 2).round();

    L.DomUtil.setPosition(svg as unknown as HTMLElement, min);
    boundsCenterRef.current = map.getCenter();
    boundsZoomRef.current = map.getZoom();
    svg.setAttribute("width", `${boundsSize.x}`);
    svg.setAttribute("height", `${boundsSize.y}`);
    svg.setAttribute(
      "viewBox",
      `${min.x} ${min.y} ${boundsSize.x} ${boundsSize.y}`,
    );
  }, [map]);

  /**
   * ズーム中の追従。
   *
   * Leaflet はズーム中、地図ペイン全体を transform で拡大する。各レンダラは
   * zoom / zoomanim を受けて自分側の transform を打ち消すことで正しい位置を保つ。
   * この SVG は Leaflet のレンダラではないので、同じ計算を自前で行う。
   * （これをしないとズームのたびにラベルの位置がずれる）
   */
  const applyZoomTransform = useCallback(
    (center?: L.LatLng, zoom?: number) => {
      const svg = svgRef.current;
      const boundsCenter = boundsCenterRef.current;
      const boundsZoom = boundsZoomRef.current;
      if (!svg || !boundsCenter || boundsZoom == null) return;

      const targetZoom = zoom ?? map.getZoom();
      const targetCenter = center ?? map.getCenter();
      const scale = map.getZoomScale(targetZoom, boundsZoom);
      const viewHalf = map.getSize().multiplyBy(0.5 + SVG_BOUNDS_PADDING);
      const topLeftOffset = viewHalf
        .multiplyBy(-scale)
        .add(map.project(boundsCenter, targetZoom))
        .subtract(
          getMapInternals(map)._getNewPixelOrigin(targetCenter, targetZoom),
        );

      L.DomUtil.setTransform(
        svg as unknown as HTMLElement,
        topLeftOffset,
        scale,
      );
    },
    [map],
  );

  useEffect(() => {
    if (!map.getPane(FINALIZED_LABEL_PANE)) {
      map.createPane(FINALIZED_LABEL_PANE);
    }
    const pane = map.getPane(FINALIZED_LABEL_PANE);
    if (!pane) return;

    const svg = document.createElementNS(SVG_NS, "svg");
    // Leaflet のズームアニメーションと同じトランジションを効かせる
    svg.setAttribute(
      "class",
      "finalized-line-overlay-svg leaflet-zoom-animated",
    );
    svg.style.transition = `opacity ${LABEL_FADE_IN_MS}ms ease-out`;
    pane.append(svg);
    svgRef.current = svg;

    return () => {
      svg.remove();
      svgRef.current = null;
      itemsRef.current = [];
      layoutZoomRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const handleZoom = () => applyZoomTransform();
    const handleZoomAnim = (event: L.ZoomAnimEvent) => {
      applyZoomTransform(event.center, event.zoom);
    };
    // ズームが確定したらその場で組み直す。
    // 位置合わせだけ先に行って後から作り直すと、
    // 「前のズームのラベルが一瞬見えてから入れ替わる」動きになる。
    const handleZoomEnd = () => {
      updateBounds();
      renderOverlay();
    };
    const handleViewReset = () => {
      updateBounds();
      repositionItems();
    };
    const handleMoveEnd = () => {
      updateBounds();
    };

    updateBounds();
    renderOverlay();
    map.on("zoom", handleZoom);
    map.on("zoomanim", handleZoomAnim);
    map.on("zoomend", handleZoomEnd);
    map.on("viewreset", handleViewReset);
    map.on("moveend resize", handleMoveEnd);
    return () => {
      map.off("zoom", handleZoom);
      map.off("zoomanim", handleZoomAnim);
      map.off("zoomend", handleZoomEnd);
      map.off("viewreset", handleViewReset);
      map.off("moveend resize", handleMoveEnd);
    };
  }, [applyZoomTransform, map, renderOverlay, repositionItems, updateBounds]);

  return null;
};
