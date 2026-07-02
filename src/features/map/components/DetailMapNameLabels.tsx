"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
} from "@/lib/finalizedResortGeojsonShared";
import {
  COURSE_LABEL_MIN_ZOOM,
  FINALIZED_SELECTED_PANE,
  LIFT_LABEL_MIN_ZOOM,
} from "../constants";
import type { Rect, SelectedMapFeature } from "../types";
import { toLatLngTuple } from "../utils/finalizedMapData";
import { expandRect, rectsOverlap } from "../utils/labelCollision";

type LabelPlacement = {
  point: L.Point;
  angle: number;
  width: number;
  height: number;
  lineLength: number;
  pathD: string;
  pathPoints: L.Point[];
};

type CourseLabelLine = {
  displayName: string;
  groupId: string;
  status: string | null;
  coordinates: FinalizedCourseFeature["coordinates"];
};

type ProjectedLine = {
  points: L.Point[];
  segmentLengths: number[];
  lineLength: number;
};

type StraightPlacementOptions = {
  maxDeviationPx?: number;
  minChordRatio?: number;
  visibleLineRatio?: number;
};

const COURSE_SECTION_SUFFIX_RE = /_#?(上部|中部|下部)$/u;
const liftLabelRectsByMap = new WeakMap<L.Map, Rect[]>();
const COURSE_TO_LIFT_COLLISION_RELAX_PX = 6;

const normalizeLabelAngle = (angle: number) =>
  angle > 90 || angle < -90 ? angle + 180 : angle;

const getCourseLabelName = (course: FinalizedCourseFeature) =>
  course.displayName.replace(COURSE_SECTION_SUFFIX_RE, "");

const isSectionedCourse = (course: FinalizedCourseFeature) =>
  COURSE_SECTION_SUFFIX_RE.test(course.name);

const shouldSkipCourseLabel = (
  course: FinalizedCourseFeature,
  labelName: string,
) =>
  (!isSectionedCourse(course) && course.name.includes("_")) ||
  labelName.includes("_") ||
  labelName.startsWith("無名") ||
  labelName.length === 0;

const hasMixedCourseStatuses = (lines: CourseLabelLine[]) =>
  new Set(lines.map(line => line.status ?? "")).size > 1;

const shrinkRect = (rect: Rect, amount: number): Rect => {
  const maxX = Math.max(0, (rect.right - rect.left) / 2);
  const maxY = Math.max(0, (rect.bottom - rect.top) / 2);
  const x = Math.min(amount, maxX);
  const y = Math.min(amount, maxY);

  return {
    left: rect.left + x,
    right: rect.right - x,
    top: rect.top + y,
    bottom: rect.bottom - y,
  };
};

const getLabelCollisionPadding = (zoom: number) => {
  if (zoom >= 16) return 4;
  if (zoom >= 15) return 7;
  return 14;
};

const getMinimumLineLength = (
  zoom: number,
  width: number,
  kind: "course" | "lift",
) => {
  if (zoom >= 16) return Math.min(width * 0.48, kind === "course" ? 68 : 74);
  if (zoom >= 15) return Math.min(width * 0.7, kind === "course" ? 92 : 100);
  return Math.min(width * 0.95, kind === "course" ? 126 : 138);
};

const getCourseStraightnessLimit = (zoom: number) => {
  if (zoom >= 17) return 10;
  if (zoom >= 16) return 10;
  return 10;
};

const getProjectedLine = (
  map: L.Map,
  coordinates: FinalizedCourseFeature["coordinates"],
): ProjectedLine | null => {
  const points = coordinates.map(coordinate =>
    map.latLngToContainerPoint(toLatLngTuple(coordinate)),
  );
  if (points.length < 2) return null;

  const segmentLengths = points.slice(0, -1).map((point, index) => {
    const nextPoint = points[index + 1];
    return nextPoint ? point.distanceTo(nextPoint) : 0;
  });
  const lineLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  if (lineLength <= 0) return null;

  return { points, segmentLengths, lineLength };
};

const getPathD = (points: L.Point[]) =>
  points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");

const getPointAtDistance = (
  line: ProjectedLine,
  targetDistance: number,
): L.Point | null => {
  const distance = Math.max(0, Math.min(line.lineLength, targetDistance));
  let walkedDistance = 0;

  for (let index = 0; index < line.segmentLengths.length; index += 1) {
    const length = line.segmentLengths[index] ?? 0;
    const start = line.points[index];
    const end = line.points[index + 1];
    if (!start || !end || length <= 0) continue;

    if (walkedDistance + length >= distance) {
      const ratio = (distance - walkedDistance) / length;
      return L.point(
        start.x + (end.x - start.x) * ratio,
        start.y + (end.y - start.y) * ratio,
      );
    }

    walkedDistance += length;
  }

  return line.points.at(-1) ?? null;
};

const getSubpathPoints = (
  line: ProjectedLine,
  startDistance: number,
  endDistance: number,
) => {
  const start = Math.max(0, Math.min(line.lineLength, startDistance));
  const end = Math.max(start, Math.min(line.lineLength, endDistance));
  const points: L.Point[] = [];
  const startPoint = getPointAtDistance(line, start);
  const endPoint = getPointAtDistance(line, end);
  if (!startPoint || !endPoint) return points;

  points.push(startPoint);

  let walkedDistance = 0;
  for (let index = 0; index < line.segmentLengths.length; index += 1) {
    walkedDistance += line.segmentLengths[index] ?? 0;
    const point = line.points[index + 1];
    if (!point) continue;
    if (walkedDistance > start && walkedDistance < end) {
      points.push(point);
    }
  }

  points.push(endPoint);
  return points;
};

const getDistanceToLine = (point: L.Point, start: L.Point, end: L.Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) return 0;

  return (
    Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) /
    length
  );
};

const getReadablePathPoints = (points: L.Point[]) => {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return points;

  const angle =
    (Math.atan2(last.y - first.y, last.x - first.x) * 180) / Math.PI;
  return angle > 90 || angle < -90 ? [...points].reverse() : points;
};

const getStraightestLinePlacement = (
  map: L.Map,
  coordinates: FinalizedCourseFeature["coordinates"],
  width: number,
  height: number,
  options: StraightPlacementOptions = {},
): LabelPlacement | null => {
  const line = getProjectedLine(map, coordinates);
  if (!line) return null;

  const targetLength = Math.min(line.lineLength, Math.max(width * 1.14, 86));
  if (
    options.visibleLineRatio != null &&
    targetLength > line.lineLength * options.visibleLineRatio
  ) {
    return null;
  }

  const maxStart = Math.max(0, line.lineLength - targetLength);
  const step = Math.max(14, targetLength / 4);
  const starts =
    maxStart === 0
      ? [0]
      : Array.from({ length: Math.floor(maxStart / step) + 1 }, (_, index) =>
          Math.min(maxStart, index * step),
        );
  if (maxStart > 0 && starts.at(-1) !== maxStart) starts.push(maxStart);

  let best: {
    points: L.Point[];
    point: L.Point;
    angle: number;
    straightnessPenalty: number;
  } | null = null;

  for (const startDistance of starts) {
    const endDistance = startDistance + targetLength;
    const points = getSubpathPoints(line, startDistance, endDistance);
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last || points.length < 2) continue;

    const chordLength = first.distanceTo(last);
    const minChordRatio = options.minChordRatio ?? 0.58;
    if (chordLength < targetLength * minChordRatio) continue;

    const maxDeviation = Math.max(
      ...points.map(point => getDistanceToLine(point, first, last)),
    );
    if (
      options.maxDeviationPx != null &&
      maxDeviation > options.maxDeviationPx
    ) {
      continue;
    }

    const midpoint = getPointAtDistance(line, startDistance + targetLength / 2);
    if (!midpoint) continue;

    const lineCenterDistance = Math.abs(
      startDistance + targetLength / 2 - line.lineLength / 2,
    );
    const angle =
      (Math.atan2(last.y - first.y, last.x - first.x) * 180) / Math.PI;
    const straightnessPenalty =
      maxDeviation * 9 +
      (targetLength - chordLength) * 2 +
      (lineCenterDistance / Math.max(line.lineLength, 1)) * 16;

    if (!best || straightnessPenalty < best.straightnessPenalty) {
      best = {
        points: getReadablePathPoints(points),
        point: midpoint,
        angle: normalizeLabelAngle(angle),
        straightnessPenalty,
      };
    }
  }

  if (!best) return null;

  return {
    point: best.point,
    angle: best.angle,
    width,
    height,
    lineLength: line.lineLength,
    pathD: getPathD(best.points),
    pathPoints: best.points,
  };
};

const getParallelOffsetPlacement = (
  placement: LabelPlacement,
  offset: number,
): LabelPlacement => {
  const angleRad = (placement.angle * Math.PI) / 180;
  const offsetPoint = (point: L.Point) =>
    L.point(
      point.x - Math.sin(angleRad) * offset,
      point.y + Math.cos(angleRad) * offset,
    );
  const pathPoints = placement.pathPoints.map(offsetPoint);

  return {
    ...placement,
    point: offsetPoint(placement.point),
    pathD: getPathD(pathPoints),
    pathPoints,
  };
};

const getStraightLiftLabelPlacement = (
  map: L.Map,
  coordinates: FinalizedLiftFeature["coordinates"],
  width: number,
  height: number,
) => {
  const placement = getStraightestLinePlacement(
    map,
    coordinates,
    width,
    height,
  );
  if (!placement) return null;

  const first = placement.pathPoints[0];
  const last = placement.pathPoints.at(-1);
  if (!first || !last) return placement;

  const readablePoints = getReadablePathPoints([first, last]);
  return {
    ...placement,
    point: L.point((first.x + last.x) / 2, (first.y + last.y) / 2),
    angle: normalizeLabelAngle(
      (Math.atan2(last.y - first.y, last.x - first.x) * 180) / Math.PI,
    ),
    pathPoints: readablePoints,
    pathD: getPathD(readablePoints),
  };
};

const getPlacementRect = (placement: LabelPlacement): Rect => ({
  left: placement.point.x - placement.width / 2,
  right: placement.point.x + placement.width / 2,
  top: placement.point.y - placement.height / 2,
  bottom: placement.point.y + placement.height / 2,
});

const shouldUseVerticalLabel = (placement: LabelPlacement) =>
  Math.abs(normalizeLabelAngle(getPlacementLineAngle(placement))) >= 45;

const getCollisionPlacement = (placement: LabelPlacement): LabelPlacement =>
  shouldUseVerticalLabel(placement)
    ? {
        ...placement,
        width: placement.height,
        height: placement.width,
      }
    : placement;

const getPlacementLineAngle = (placement: LabelPlacement) => {
  const first = placement.pathPoints[0];
  const last = placement.pathPoints.at(-1);
  if (!first || !last) return placement.angle;

  return (Math.atan2(last.y - first.y, last.x - first.x) * 180) / Math.PI;
};

const shouldUseVerticalLiftLabel = (placement: LabelPlacement) =>
  shouldUseVerticalLabel(placement);

const getVerticalLiftLabelRotation = (placement: LabelPlacement) => {
  const first = placement.pathPoints[0];
  const last = placement.pathPoints.at(-1);
  if (!first || !last) return normalizeLabelAngle(placement.angle) - 90;

  let angle = getPlacementLineAngle(placement);
  if (last.y < first.y) angle += 180;

  return angle - 90;
};

const VERTICAL_COMBINED_TOKEN_RE = /^[0-9A-Za-z]+$/u;
const VERTICAL_LONG_VOWEL_CHARS = new Set([
  "ー",
  "ｰ",
  "-",
  "−",
  "—",
  "―",
  "－",
]);

const getVerticalLabelAdvance = (classPrefix: string) =>
  classPrefix.includes("course") ? 14 : 13;

const normalizeVerticalText = (label: string) =>
  Array.from(label)
    .map(character =>
      VERTICAL_LONG_VOWEL_CHARS.has(character) ? "ー" : character,
    )
    .join("");

const splitVerticalLabelTokens = (label: string) => {
  const tokens: { text: string; rotate: boolean }[] = [];
  let buffer = "";

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    tokens.push({ text: buffer, rotate: false });
    buffer = "";
  };

  for (const character of Array.from(normalizeVerticalText(label))) {
    if (VERTICAL_COMBINED_TOKEN_RE.test(character)) {
      buffer += character;
      continue;
    }

    flushBuffer();
    tokens.push({
      text: character,
      rotate: character === "ー",
    });
  }

  flushBuffer();
  return tokens;
};

const addVerticalLiftText = ({
  classPrefix,
  isSelected,
  label,
  svgNamespace,
  textGroup,
  variant,
}: {
  classPrefix: string;
  isSelected: boolean;
  label: { name: string; placement: LabelPlacement };
  svgNamespace: string;
  textGroup: SVGGElement;
  variant: "halo" | "fill";
}) => {
  const group = document.createElementNS(svgNamespace, "g");
  const center = label.placement.point;

  group.setAttribute(
    "transform",
    `translate(${center.x.toFixed(1)} ${center.y.toFixed(1)}) rotate(${getVerticalLiftLabelRotation(label.placement).toFixed(1)})`,
  );

  const tokens = splitVerticalLabelTokens(label.name);
  const advance = getVerticalLabelAdvance(classPrefix);
  const startY = -((tokens.length - 1) * advance) / 2;
  tokens.forEach((token, index) => {
    const y = startY + index * advance;
    const text = document.createElementNS(svgNamespace, "text");
    text.setAttribute(
      "class",
      `${classPrefix}-text-${variant} ${classPrefix}-text-vertical${isSelected ? ` ${classPrefix}-text-selected` : ""}`,
    );
    text.setAttribute("x", "0");
    text.setAttribute("y", y.toFixed(1));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    if (token.rotate) {
      text.setAttribute("transform", `rotate(90 0 ${y.toFixed(1)})`);
    }
    text.textContent = token.text;
    group.append(text);
  });

  textGroup.append(group);
};

const addStraightText = ({
  classPrefix,
  isSelected,
  label,
  svgNamespace,
  textGroup,
  variant,
}: {
  classPrefix: string;
  isSelected: boolean;
  label: { name: string; placement: LabelPlacement };
  svgNamespace: string;
  textGroup: SVGGElement;
  variant: "halo" | "fill";
}) => {
  const text = document.createElementNS(svgNamespace, "text");
  const center = label.placement.point;
  text.setAttribute(
    "class",
    `${classPrefix}-text-${variant} ${classPrefix}-text-horizontal${isSelected ? ` ${classPrefix}-text-selected` : ""}`,
  );
  text.setAttribute("x", center.x.toFixed(1));
  text.setAttribute("y", center.y.toFixed(1));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.setAttribute(
    "transform",
    `rotate(${normalizeLabelAngle(getPlacementLineAngle(label.placement)).toFixed(1)} ${center.x.toFixed(1)} ${center.y.toFixed(1)})`,
  );
  text.textContent = label.name;
  textGroup.append(text);
};

const createLineLabelSvgLayer = (
  map: L.Map,
  kind: "course" | "lift",
  labels: {
    id: string;
    name: string;
    placement: LabelPlacement;
    isSelected: boolean;
  }[],
) => {
  const layer = new L.Layer();
  const svgNamespace = "http://www.w3.org/2000/svg";
  const xlinkNamespace = "http://www.w3.org/1999/xlink";
  const svg = document.createElementNS(svgNamespace, "svg");
  const defs = document.createElementNS(svgNamespace, "defs");
  const textGroup = document.createElementNS(svgNamespace, "g");
  const mapSize = map.getSize();
  const classPrefix =
    kind === "course"
      ? "finalized-course-name-label"
      : "finalized-lift-name-label";

  svg.setAttribute("class", `${classPrefix}-svg`);
  svg.setAttribute("width", `${mapSize.x}`);
  svg.setAttribute("height", `${mapSize.y}`);
  svg.setAttribute("viewBox", `0 0 ${mapSize.x} ${mapSize.y}`);
  svg.style.pointerEvents = "none";
  svg.style.position = "absolute";

  for (const label of labels) {
    if (
      (kind === "course" && shouldUseVerticalLabel(label.placement)) ||
      (kind === "lift" && shouldUseVerticalLiftLabel(label.placement))
    ) {
      for (const variant of ["halo", "fill"] as const) {
        addVerticalLiftText({
          classPrefix,
          isSelected: label.isSelected,
          label,
          svgNamespace,
          textGroup,
          variant,
        });
      }
      continue;
    }

    if (kind === "course") {
      for (const variant of ["halo", "fill"] as const) {
        addStraightText({
          classPrefix,
          isSelected: label.isSelected,
          label,
          svgNamespace,
          textGroup,
          variant,
        });
      }
      continue;
    }

    // Horizontal labels stay as one text node. The vertical mobile fix splits
    // glyphs for digits and long vowels, but doing that here makes the SVG
    // halo look like separate white blobs around each character.
    const path = document.createElementNS(svgNamespace, "path");
    const pathId = `finalized-${kind}-label-path-${label.id}`;
    path.setAttribute("id", pathId);
    path.setAttribute("d", label.placement.pathD);
    defs.append(path);

    const text = document.createElementNS(svgNamespace, "text");
    text.setAttribute(
      "class",
      `${classPrefix}-text ${classPrefix}-text-horizontal${label.isSelected ? ` ${classPrefix}-text-selected` : ""}`,
    );

    const halo = document.createElementNS(svgNamespace, "textPath");
    halo.setAttribute(
      "class",
      `${classPrefix}-text-halo ${classPrefix}-text-horizontal${label.isSelected ? ` ${classPrefix}-text-selected` : ""}`,
    );
    halo.setAttribute("startOffset", "50%");
    halo.setAttribute("text-anchor", "middle");
    halo.setAttributeNS(xlinkNamespace, "href", `#${pathId}`);
    halo.textContent = label.name;
    text.append(halo);

    const fill = document.createElementNS(svgNamespace, "text");
    fill.setAttribute(
      "class",
      `${classPrefix}-text-fill ${classPrefix}-text-horizontal${label.isSelected ? ` ${classPrefix}-text-selected` : ""}`,
    );
    const fillPath = document.createElementNS(svgNamespace, "textPath");
    fillPath.setAttribute("startOffset", "50%");
    fillPath.setAttribute("text-anchor", "middle");
    fillPath.setAttributeNS(xlinkNamespace, "href", `#${pathId}`);
    fillPath.textContent = label.name;
    fill.append(fillPath);

    textGroup.append(text, fill);
  }

  svg.append(defs, textGroup);

  layer.onAdd = () => {
    const pane = map.getPane(FINALIZED_SELECTED_PANE);
    if (!pane) return layer;

    const topLeft = map.containerPointToLayerPoint(L.point(0, 0));
    L.DomUtil.setPosition(svg as unknown as HTMLElement, topLeft);
    pane.append(svg);
    return layer;
  };
  layer.onRemove = () => {
    svg.remove();
    return layer;
  };

  return layer;
};

export const FinalizedCourseNameLabels = ({
  courses,
  selectedFeature,
}: {
  courses: FinalizedCourseFeature[];
  selectedFeature: SelectedMapFeature | null;
}) => {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const renderLabels = () => {
      if (groupRef.current) {
        groupRef.current.removeFrom(map);
        groupRef.current = null;
      }

      const zoom = map.getZoom();
      if (zoom < COURSE_LABEL_MIN_ZOOM) return;

      const group = L.layerGroup();
      const placedRects: Rect[] = (liftLabelRectsByMap.get(map) ?? []).map(
        rect => shrinkRect(rect, COURSE_TO_LIFT_COLLISION_RELAX_PX),
      );
      const svgLabels: {
        id: string;
        name: string;
        placement: LabelPlacement;
        isSelected: boolean;
      }[] = [];
      const collisionPadding = getLabelCollisionPadding(zoom);
      const labelCourseGroups = new Map<string, CourseLabelLine[]>();
      for (const course of courses) {
        const displayName = getCourseLabelName(course);
        if (shouldSkipCourseLabel(course, displayName)) continue;

        const groupCourses = labelCourseGroups.get(displayName) ?? [];
        groupCourses.push({
          displayName,
          groupId: course.groupId,
          status: course.properties.status,
          coordinates: course.coordinates,
        });
        labelCourseGroups.set(displayName, groupCourses);
      }
      const labelCourses = [...labelCourseGroups.entries()].map(
        ([displayName, lines]) => ({
          displayName,
          hasMixedStatuses: hasMixedCourseStatuses(lines),
          sourceGroupIds: new Set(lines.map(line => line.groupId)),
          lines,
          pointCount: lines.reduce(
            (sum, line) => sum + line.coordinates.length,
            0,
          ),
        }),
      );
      const sortedCourses = labelCourses.sort((a, b) => {
        const aSelected =
          selectedFeature?.kind === "course" &&
          a.sourceGroupIds.has(selectedFeature.id);
        const bSelected =
          selectedFeature?.kind === "course" &&
          b.sourceGroupIds.has(selectedFeature.id);
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        return b.pointCount - a.pointCount;
      });

      for (const course of sortedCourses) {
        if (course.hasMixedStatuses) continue;

        const width = Math.max(58, course.displayName.length * 13 + 18);
        const height = 24;
        const isSelected =
          selectedFeature?.kind === "course" &&
          course.sourceGroupIds.has(selectedFeature.id);
        if (isSelected) continue;

        const minimumLineLength = getMinimumLineLength(zoom, width, "course");
        const best = course.lines
          .map(line =>
            getStraightestLinePlacement(map, line.coordinates, width, height, {
              maxDeviationPx: getCourseStraightnessLimit(zoom),
              minChordRatio: 0.9,
              visibleLineRatio: 0.9,
            }),
          )
          .filter((placement): placement is LabelPlacement =>
            Boolean(placement),
          )
          .sort((a, b) => b.lineLength - a.lineLength)[0];

        if (!best) continue;
        if (best.lineLength < minimumLineLength) continue;

        const collisionRect = expandRect(
          getPlacementRect(getCollisionPlacement(best)),
          collisionPadding,
        );
        if (placedRects.some(placed => rectsOverlap(collisionRect, placed))) {
          continue;
        }

        placedRects.push(collisionRect);
        svgLabels.push({
          id: `${svgLabels.length}`,
          name: course.displayName,
          placement: best,
          isSelected,
        });
      }

      if (svgLabels.length > 0) {
        group.addLayer(createLineLabelSvgLayer(map, "course", svgLabels));
      }

      group.addTo(map);
      groupRef.current = group;
    };

    renderLabels();
    map.on("zoomend moveend resize", renderLabels);
    return () => {
      map.off("zoomend moveend resize", renderLabels);
      if (groupRef.current) {
        groupRef.current.removeFrom(map);
        groupRef.current = null;
      }
    };
  }, [courses, map, selectedFeature]);

  return null;
};

export const FinalizedLiftNameLabels = ({
  lifts,
  selectedFeature,
}: {
  lifts: FinalizedLiftFeature[];
  selectedFeature: SelectedMapFeature | null;
}) => {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const renderLabels = () => {
      if (groupRef.current) {
        groupRef.current.removeFrom(map);
        groupRef.current = null;
      }

      const zoom = map.getZoom();
      if (zoom < LIFT_LABEL_MIN_ZOOM) return;

      const group = L.layerGroup();
      const placedRects: Rect[] = [];
      const svgLabels: {
        id: string;
        name: string;
        placement: LabelPlacement;
        isSelected: boolean;
      }[] = [];
      const collisionPadding = getLabelCollisionPadding(zoom);
      const sortedLifts = [...lifts].sort((a, b) => {
        const aSelected =
          selectedFeature?.kind === "lift" && selectedFeature.id === a.id;
        const bSelected =
          selectedFeature?.kind === "lift" && selectedFeature.id === b.id;
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        return b.coordinates.length - a.coordinates.length;
      });

      for (const lift of sortedLifts) {
        const width = Math.max(64, lift.name.length * 12 + 16);
        const height = 22;
        const isSelected =
          selectedFeature?.kind === "lift" && selectedFeature.id === lift.id;
        const basePlacement = getStraightLiftLabelPlacement(
          map,
          lift.coordinates,
          width,
          height,
        );

        if (!basePlacement) continue;
        if (
          !isSelected &&
          basePlacement.lineLength < getMinimumLineLength(zoom, width, "lift")
        ) {
          continue;
        }

        const liftOffset = 0;
        const placementCandidates = [
          getParallelOffsetPlacement(basePlacement, liftOffset),
          getParallelOffsetPlacement(basePlacement, -liftOffset),
        ];
        const best =
          placementCandidates.find(placement => {
            const collisionRect = expandRect(
              getPlacementRect(getCollisionPlacement(placement)),
              collisionPadding,
            );
            return !placedRects.some(placed =>
              rectsOverlap(collisionRect, placed),
            );
          }) ?? placementCandidates[0];
        const collisionRect = expandRect(
          getPlacementRect(getCollisionPlacement(best)),
          collisionPadding,
        );
        if (placedRects.some(placed => rectsOverlap(collisionRect, placed))) {
          continue;
        }

        placedRects.push(collisionRect);
        svgLabels.push({
          id: `${svgLabels.length}`,
          name: lift.name,
          placement: best,
          isSelected,
        });
      }

      liftLabelRectsByMap.set(map, placedRects);
      if (svgLabels.length > 0) {
        group.addLayer(createLineLabelSvgLayer(map, "lift", svgLabels));
      }

      group.addTo(map);
      groupRef.current = group;
    };

    renderLabels();
    map.on("zoomend moveend resize", renderLabels);
    return () => {
      map.off("zoomend moveend resize", renderLabels);
      if (groupRef.current) {
        groupRef.current.removeFrom(map);
        groupRef.current = null;
      }
      liftLabelRectsByMap.delete(map);
    };
  }, [lifts, map, selectedFeature]);

  return null;
};
