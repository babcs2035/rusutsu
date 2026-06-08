"use client";

import { Box, Button, Flex } from "@chakra-ui/react";
import L from "leaflet";
import { Check, Home, Plus } from "lucide-react";
import {
  Fragment,
  memo,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  MapContainer,
  Marker,
  Pane,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { MapSkiResort } from "@/types/skiResorts";

const INITIAL_CENTER: L.LatLngTuple = [38.25, 138.0];
const MOBILE_INITIAL_ZOOM = 5;
const DESKTOP_INITIAL_ZOOM = 6;
const MOBILE_MAP_MEDIA_QUERY = "(max-width: 47.999em)";
const MOBILE_LABEL_SHOW_ZOOM = 7;
const DESKTOP_LABEL_SHOW_ZOOM = 8;
const MOBILE_LABEL_ADVANCED_LAYOUT_ZOOM = 11;
const DESKTOP_LABEL_ADVANCED_LAYOUT_ZOOM = 11;
const LABEL_PREFETCH_PADDING_RATIO = 0.2;
const LABEL_PREFETCH_MIN_PADDING_PX = 150;
const VIEWPORT_PADDING_RATIO_CHANGE_THRESHOLD = 0.001;

const FALLBACK_LABEL_HEIGHT = 24;
const ADVANCED_NEAR_POINT_DISTANCE = 40;
const PRIMARY_LABEL_SEARCH_MAX_RADIUS_PX = 180;
const DENSE_LABEL_SEARCH_MAX_RADIUS_PX = 260;
const LABEL_COLLISION_PADDING = 4;
const LABEL_MARGIN = 6;

const LABEL_POINT_CLEARANCE = 8;
const LEADER_POINT_CLEARANCE = 8;
const RESORT_POINT_RADIUS = 4;
const SELECTED_MARKER_RING_WIDTH = 3;

const BASE_MARKER_PANE = "resort-markers-base";
const FRONT_MARKER_PANE = "resort-markers-front";
const FILTER_MATCH_MARKER_PANE = "resort-markers-filter-match";
const SELECTED_MARKER_PANE = "resort-markers-selected";
const COMPARE_PANEL_ATTRIBUTE = "data-ski-resort-compare-panel";
const DETAIL_PANEL_ATTRIBUTE = "data-ski-resort-detail-panel";
const MOBILE_ZOOM_SETTINGS = {
  zoomSnap: 0,
  zoomDelta: 0.5,
};
const DESKTOP_ZOOM_SETTINGS = {
  zoomSnap: 1,
  zoomDelta: 1,
};

let cachedLabelMeasureElement: HTMLDivElement | undefined;
const LABEL_MEASURE_ELEMENT_ATTRIBUTE = "data-resort-label-measure-probe";

const cleanupLabelMeasureElement = () => {
  if (cachedLabelMeasureElement?.parentNode) {
    cachedLabelMeasureElement.parentNode.removeChild(cachedLabelMeasureElement);
  }
  cachedLabelMeasureElement = undefined;
};
const cleanupOrphanedLabelMeasureElements = () => {
  if (typeof document === "undefined") {
    return;
  }
  document
    .querySelectorAll<HTMLDivElement>(
      `div[${LABEL_MEASURE_ELEMENT_ATTRIBUTE}="true"]`,
    )
    .forEach(element => {
      if (element !== cachedLabelMeasureElement) {
        element.remove();
      }
    });
};

let aliasByIdPromise: Promise<Map<string, string>> | null = null;

type ResortNameAliasesData = {
  resorts: Array<{
    id: string;
    shortName: string;
  }>;
};

type Rect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type LabelLayout = {
  labelPosition: L.LatLngTuple;
  leaderEndPosition: L.LatLngTuple;
  showLeaderLine: boolean;
  labelWidth: number;
};

type CandidatePlacement = {
  left: number;
  top: number;
  forceLeaderLine?: boolean;
};

type CandidateEvaluation = {
  rect: Rect;
  collisionRect: Rect;
  leaderSegment: Segment;
  showLeaderLine: boolean;
  score: number;
};

type MapPointEntry = {
  id: string;
  point: L.Point;
};

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getLabelMeasureElement = () => {
  if (typeof window === "undefined") {
    return undefined;
  }

  if (cachedLabelMeasureElement?.isConnected) {
    return cachedLabelMeasureElement;
  }

  if (cachedLabelMeasureElement && !cachedLabelMeasureElement.isConnected) {
    cleanupLabelMeasureElement();
  }
  cleanupOrphanedLabelMeasureElements();

  const probe = document.createElement("div");
  probe.className = "resort-name-label";
  probe.setAttribute(LABEL_MEASURE_ELEMENT_ATTRIBUTE, "true");
  probe.style.position = "absolute";
  probe.style.left = "-100000px";
  probe.style.top = "-100000px";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.whiteSpace = "nowrap";
  probe.style.width = "fit-content";

  document.body.appendChild(probe);
  cachedLabelMeasureElement = probe;
  return probe;
};

const measureTextWidth = (text: string): number => {
  const probe = getLabelMeasureElement();
  if (!probe) return text.length * 8;
  probe.textContent = text;
  return Math.ceil(probe.getBoundingClientRect().width);
};

const measureLabelHeight = (): number => {
  const probe = getLabelMeasureElement();
  if (!probe) {
    return FALLBACK_LABEL_HEIGHT;
  }

  probe.textContent = "Hg";
  const measuredHeight = Math.ceil(probe.getBoundingClientRect().height);
  return measuredHeight > 0 ? measuredHeight : FALLBACK_LABEL_HEIGHT;
};

const removeSkiResortWord = (name: string): string =>
  name.replaceAll("スキー場", "").trim();

const loadAliasById = async (): Promise<Map<string, string>> => {
  if (aliasByIdPromise) {
    return aliasByIdPromise;
  }

  aliasByIdPromise = import("@/private/data/SkiResortNameAliases.json")
    .then(module => {
      const data = (module.default ?? module) as ResortNameAliasesData;
      const entries = data.resorts.map(
        resort => [resort.id, resort.shortName] as const,
      );
      return new Map<string, string>(entries);
    })
    .catch(() => new Map<string, string>());

  return aliasByIdPromise;
};

const createNameLabelIcon = (
  name: string,
  width: number,
  height: number,
  isSelected: boolean,
  isDimmed: boolean,
) =>
  L.divIcon({
    className: "resort-name-label-icon",
    html: `<div class="resort-name-label${isSelected ? " is-selected" : ""}${isDimmed ? " is-dimmed" : ""}" style="width:${width}px">${escapeHtml(name)}</div>`,
    iconSize: [width, height],
    iconAnchor: [0, 0],
  });

const createResortPointIcon = ({
  radius,
  isSelected,
  isFilterMatch,
  isDimmed,
}: {
  radius: number;
  isSelected: boolean;
  isFilterMatch: boolean;
  isDimmed: boolean;
}) => {
  const selectedRingWidth = isSelected ? SELECTED_MARKER_RING_WIDTH : 0;
  const size = radius * 2;
  const iconSize = size + selectedRingWidth * 2;
  const markerStyle = [
    `width:${size}px`,
    `height:${size}px`,
    selectedRingWidth > 0
      ? `margin:${selectedRingWidth}px;--selected-ring-width:${selectedRingWidth}px`
      : "",
  ]
    .filter(Boolean)
    .join(";");

  return L.divIcon({
    className: "resort-point-marker-icon",
    html: `<div class="resort-point-marker${isSelected ? " is-selected" : ""}${isFilterMatch ? " is-filter-match" : ""}${isDimmed ? " is-dimmed" : ""}" style="${markerStyle}"></div>`,
    iconSize: [iconSize, iconSize],
    iconAnchor: [iconSize / 2, iconSize / 2],
  });
};

const pointInRect = (x: number, y: number, rect: Rect) =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

const rectsOverlap = (a: Rect, b: Rect) =>
  a.left <= b.right &&
  a.right >= b.left &&
  a.top <= b.bottom &&
  a.bottom >= b.top;

const expandRect = (rect: Rect, padding: number): Rect => ({
  left: rect.left - padding,
  right: rect.right + padding,
  top: rect.top - padding,
  bottom: rect.bottom + padding,
});

const rectContainsPoint = (
  rect: Rect,
  point: L.Point,
  padding = 0,
): boolean => {
  const expanded = expandRect(rect, padding);
  return pointInRect(point.x, point.y, expanded);
};

const distancePointToRect = (point: L.Point, rect: Rect): number => {
  const dx =
    point.x < rect.left
      ? rect.left - point.x
      : point.x > rect.right
        ? point.x - rect.right
        : 0;
  const dy =
    point.y < rect.top
      ? rect.top - point.y
      : point.y > rect.bottom
        ? point.y - rect.bottom
        : 0;

  return Math.hypot(dx, dy);
};

const segmentsIntersect = (a: Segment, b: Segment) => {
  const orient = (
    px: number,
    py: number,
    qx: number,
    qy: number,
    rx: number,
    ry: number,
  ) => {
    const value = (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
    if (Math.abs(value) < 1e-7) return 0;
    return value > 0 ? 1 : -1;
  };

  const onSegment = (
    px: number,
    py: number,
    qx: number,
    qy: number,
    rx: number,
    ry: number,
  ) =>
    qx <= Math.max(px, rx) + 1e-7 &&
    qx + 1e-7 >= Math.min(px, rx) &&
    qy <= Math.max(py, ry) + 1e-7 &&
    qy + 1e-7 >= Math.min(py, ry);

  const o1 = orient(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const o2 = orient(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const o3 = orient(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const o4 = orient(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && onSegment(a.x1, a.y1, b.x1, b.y1, a.x2, a.y2)) return true;
  if (o2 === 0 && onSegment(a.x1, a.y1, b.x2, b.y2, a.x2, a.y2)) return true;
  if (o3 === 0 && onSegment(b.x1, b.y1, a.x1, a.y1, b.x2, b.y2)) return true;
  if (o4 === 0 && onSegment(b.x1, b.y1, a.x2, a.y2, b.x2, b.y2)) return true;

  return false;
};

const segmentIntersectsRect = (segment: Segment, rect: Rect) => {
  if (
    pointInRect(segment.x1, segment.y1, rect) ||
    pointInRect(segment.x2, segment.y2, rect)
  ) {
    return true;
  }

  const edges: Segment[] = [
    { x1: rect.left, y1: rect.top, x2: rect.right, y2: rect.top },
    { x1: rect.right, y1: rect.top, x2: rect.right, y2: rect.bottom },
    { x1: rect.right, y1: rect.bottom, x2: rect.left, y2: rect.bottom },
    { x1: rect.left, y1: rect.bottom, x2: rect.left, y2: rect.top },
  ];

  return edges.some(edge => segmentsIntersect(segment, edge));
};

const distancePointToSegment = (point: L.Point, segment: Segment): number => {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;

  if (Math.abs(dx) < 1e-7 && Math.abs(dy) < 1e-7) {
    return Math.hypot(point.x - segment.x1, point.y - segment.y1);
  }

  const t =
    ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) /
    (dx * dx + dy * dy);
  const clampedT = Math.max(0, Math.min(1, t));

  const projX = segment.x1 + dx * clampedT;
  const projY = segment.y1 + dy * clampedT;

  return Math.hypot(point.x - projX, point.y - projY);
};

const getLeaderEndPoint = (point: L.Point, rect: Rect): L.Point => {
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  const dx = centerX - point.x;
  const dy = centerY - point.y;

  if (Math.abs(dx) < 1e-7 && Math.abs(dy) < 1e-7) {
    return L.point(centerX, centerY);
  }

  const candidates: Array<{ t: number; x: number; y: number }> = [];

  if (Math.abs(dx) > 1e-7) {
    const boundaryX = dx > 0 ? rect.left : rect.right;
    const t = (boundaryX - point.x) / dx;
    if (t >= 0 && t <= 1) {
      const y = point.y + dy * t;
      if (y >= rect.top - 1e-7 && y <= rect.bottom + 1e-7) {
        candidates.push({ t, x: boundaryX, y });
      }
    }
  }

  if (Math.abs(dy) > 1e-7) {
    const boundaryY = dy > 0 ? rect.top : rect.bottom;
    const t = (boundaryY - point.y) / dy;
    if (t >= 0 && t <= 1) {
      const x = point.x + dx * t;
      if (x >= rect.left - 1e-7 && x <= rect.right + 1e-7) {
        candidates.push({ t, x, y: boundaryY });
      }
    }
  }

  if (candidates.length > 0) {
    const best = candidates.reduce((prev, current) =>
      current.t < prev.t ? current : prev,
    );
    return L.point(best.x, best.y);
  }

  return L.point(
    Math.max(rect.left, Math.min(point.x, rect.right)),
    Math.max(rect.top, Math.min(point.y, rect.bottom)),
  );
};

const createSimpleVerticalCandidates = ({
  point,
  labelWidth,
  labelHeight,
  pointGap,
}: {
  point: L.Point;
  labelWidth: number;
  labelHeight: number;
  pointGap: number;
}): CandidatePlacement[] => [
  {
    left: point.x - labelWidth / 2,
    top: point.y - labelHeight - pointGap,
  },
  {
    left: point.x - labelWidth / 2,
    top: point.y + pointGap,
  },
];

const createPrimaryCandidates = ({
  point,
  labelWidth,
  labelHeight,
  mapSize,
  useAdvancedLayout,
  shouldForceLeaderLine,
  pointGap,
}: {
  point: L.Point;
  labelWidth: number;
  labelHeight: number;
  mapSize: L.Point;
  useAdvancedLayout: boolean;
  shouldForceLeaderLine: boolean;
  pointGap: number;
}): CandidatePlacement[] => {
  const candidates: CandidatePlacement[] = [];

  if (!shouldForceLeaderLine) {
    candidates.push(
      {
        left: point.x - labelWidth / 2,
        top: point.y - labelHeight - pointGap,
      },
      {
        left: point.x - labelWidth / 2,
        top: point.y + pointGap,
      },
    );

    if (useAdvancedLayout) {
      candidates.push(
        {
          left: point.x + pointGap,
          top: point.y - labelHeight / 2,
          forceLeaderLine: true,
        },
        {
          left: point.x - labelWidth - pointGap,
          top: point.y - labelHeight / 2,
          forceLeaderLine: true,
        },
      );
    }
  }

  if (useAdvancedLayout) {
    const maxRadius = Math.min(
      Math.max(mapSize.x, mapSize.y) * 0.26,
      PRIMARY_LABEL_SEARCH_MAX_RADIUS_PX,
    );
    const angles = [300, 240, 60, 120, 330, 210, 30, 150, 0, 180, 270, 90];

    for (let radius = 30; radius <= maxRadius; radius += 18) {
      for (const angle of angles) {
        const rad = (angle * Math.PI) / 180;
        const cx = point.x + Math.cos(rad) * radius;
        const cy = point.y + Math.sin(rad) * radius;

        candidates.push({
          left: cx - labelWidth / 2,
          top: cy - labelHeight / 2,
          forceLeaderLine: true,
        });
      }
    }
  }

  return candidates;
};

const createDenseFallbackCandidates = ({
  point,
  labelWidth,
  labelHeight,
  mapSize,
}: {
  point: L.Point;
  labelWidth: number;
  labelHeight: number;
  mapSize: L.Point;
}): CandidatePlacement[] => {
  const candidates: CandidatePlacement[] = [];
  const maxRadius = Math.min(
    Math.max(mapSize.x, mapSize.y) * 0.34,
    DENSE_LABEL_SEARCH_MAX_RADIUS_PX,
  );
  const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  for (let radius = 28; radius <= maxRadius; radius += 22) {
    for (const angle of angles) {
      const rad = (angle * Math.PI) / 180;
      const cx = point.x + Math.cos(rad) * radius;
      const cy = point.y + Math.sin(rad) * radius;

      candidates.push({
        left: cx - labelWidth / 2,
        top: cy - labelHeight / 2,
        forceLeaderLine: true,
      });
    }
  }

  return candidates;
};

const createExpandedLabelViewport = (mapSize: L.Point): Rect => {
  const paddingX = Math.max(
    mapSize.x * LABEL_PREFETCH_PADDING_RATIO,
    LABEL_PREFETCH_MIN_PADDING_PX,
  );
  const paddingY = Math.max(
    mapSize.y * LABEL_PREFETCH_PADDING_RATIO,
    LABEL_PREFETCH_MIN_PADDING_PX,
  );

  return {
    left: -paddingX,
    right: mapSize.x + paddingX,
    top: -paddingY,
    bottom: mapSize.y + paddingY,
  };
};

const createLabelCandidateBounds = (
  map: L.Map,
  labelViewport: Rect,
): L.LatLngBounds =>
  L.latLngBounds(
    map.containerPointToLatLng(L.point(labelViewport.left, labelViewport.top)),
    map.containerPointToLatLng(
      L.point(labelViewport.right, labelViewport.bottom),
    ),
  );

const isRectInsideLabelViewport = (rect: Rect, layoutViewport: Rect): boolean =>
  rect.left >= layoutViewport.left + LABEL_MARGIN &&
  rect.right <= layoutViewport.right - LABEL_MARGIN &&
  rect.top >= layoutViewport.top + LABEL_MARGIN &&
  rect.bottom <= layoutViewport.bottom - LABEL_MARGIN;

const getResortDisplayName = (
  resort: MapSkiResort,
  displayNameById: Map<string, string>,
): string => displayNameById.get(resort.id) ?? resort.nameJa;

const getResortPointLabelGap = (isSelected: boolean): number =>
  RESORT_POINT_RADIUS + (isSelected ? SELECTED_MARKER_RING_WIDTH : 0);

const getResortLabelWidth = (
  resort: MapSkiResort,
  displayNameById: Map<string, string>,
): number =>
  Math.max(measureTextWidth(getResortDisplayName(resort, displayNameById)), 1);

const detectCrowdedPointIds = (
  pointEntries: MapPointEntry[],
  nearDistance: number,
): Set<string> => {
  const crowdedPointIds = new Set<string>();

  if (pointEntries.length <= 1) {
    return crowdedPointIds;
  }

  const cellSize = nearDistance;
  const grid = new Map<string, MapPointEntry[]>();

  const getCellKey = (cellX: number, cellY: number) => `${cellX}:${cellY}`;

  for (const entry of pointEntries) {
    const cellX = Math.floor(entry.point.x / cellSize);
    const cellY = Math.floor(entry.point.y / cellSize);

    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const neighborKey = getCellKey(cellX + offsetX, cellY + offsetY);
        const neighborEntries = grid.get(neighborKey);
        if (!neighborEntries) {
          continue;
        }

        for (const other of neighborEntries) {
          const distance = Math.hypot(
            entry.point.x - other.point.x,
            entry.point.y - other.point.y,
          );

          if (distance <= nearDistance) {
            crowdedPointIds.add(entry.id);
            crowdedPointIds.add(other.id);
          }
        }
      }
    }

    const ownCellKey = getCellKey(cellX, cellY);
    const ownCellEntries = grid.get(ownCellKey);
    if (ownCellEntries) {
      ownCellEntries.push(entry);
    } else {
      grid.set(ownCellKey, [entry]);
    }
  }

  return crowdedPointIds;
};

const MapEventsHandler = ({
  onBoundsChange,
  onViewChange,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: {
  onBoundsChange: (bounds: L.LatLngBounds) => void;
  onViewChange?: (view: MapViewSnapshot) => void;
  onUserMapInteraction?: () => void;
  onUserMapZoomInteraction?: () => void;
}) => {
  const map = useMap();
  const hasUserZoomInteractionRef = useRef(false);
  const zoomInteractionFallbackTimeoutRef = useRef<number | null>(null);
  const notifyViewportChange = useCallback(() => {
    const center = map.getCenter();
    onBoundsChange(map.getBounds());
    onViewChange?.({
      center: { lat: center.lat, lng: center.lng },
      zoom: map.getZoom(),
    });
  }, [map, onBoundsChange, onViewChange]);
  const clearZoomInteractionFallback = useCallback(() => {
    if (zoomInteractionFallbackTimeoutRef.current === null) return;

    window.clearTimeout(zoomInteractionFallbackTimeoutRef.current);
    zoomInteractionFallbackTimeoutRef.current = null;
  }, []);
  const completeUserZoomInteraction = useCallback(() => {
    clearZoomInteractionFallback();
    if (!hasUserZoomInteractionRef.current) return;

    hasUserZoomInteractionRef.current = false;
    onUserMapZoomInteraction?.();
  }, [clearZoomInteractionFallback, onUserMapZoomInteraction]);
  const markUserZoomInteraction = useCallback(() => {
    hasUserZoomInteractionRef.current = true;
  }, []);

  useMapEvents({
    dragstart: () => {
      onUserMapInteraction?.();
    },
    zoomstart: () => {
      clearZoomInteractionFallback();
    },
    zoomend: () => {
      notifyViewportChange();
      completeUserZoomInteraction();
    },
    moveend: notifyViewportChange,
  });

  useEffect(() => {
    const container = map.getContainer();
    const scheduleFallback = () => {
      clearZoomInteractionFallback();
      zoomInteractionFallbackTimeoutRef.current = window.setTimeout(() => {
        zoomInteractionFallbackTimeoutRef.current = null;
        completeUserZoomInteraction();
      }, 180);
    };
    const handleWheel = () => {
      markUserZoomInteraction();
      completeUserZoomInteraction();
    };
    const handleDoubleClick = () => {
      markUserZoomInteraction();
      completeUserZoomInteraction();
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;

      markUserZoomInteraction();
      completeUserZoomInteraction();
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!hasUserZoomInteractionRef.current || event.touches.length > 0) {
        return;
      }

      scheduleFallback();
    };

    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("dblclick", handleDoubleClick);
    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    container.addEventListener("touchcancel", handleTouchEnd, {
      passive: true,
    });

    return () => {
      clearZoomInteractionFallback();
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("dblclick", handleDoubleClick);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [
    clearZoomInteractionFallback,
    completeUserZoomInteraction,
    map,
    markUserZoomInteraction,
  ]);

  useEffect(() => {
    notifyViewportChange();
  }, [notifyViewportChange]);

  return null;
};

const MapZoomSettingsController = ({
  initialZoom,
  zoomSnap,
  zoomDelta,
}: {
  initialZoom: number;
  zoomSnap: number;
  zoomDelta: number;
}) => {
  const map = useMap();

  useEffect(() => {
    map.options.zoomSnap = zoomSnap;
    map.options.zoomDelta = zoomDelta;

    if (zoomSnap >= 1) {
      const roundedZoom = Math.max(initialZoom, Math.round(map.getZoom()));
      if (Math.abs(map.getZoom() - roundedZoom) > 0.001) {
        map.setZoom(roundedZoom);
      }
    }
  }, [initialZoom, map, zoomDelta, zoomSnap]);

  return null;
};

const RestoreViewportController = ({
  restoreViewRequest,
  onViewportChange,
}: {
  restoreViewRequest: MapViewRestoreRequest | null;
  onViewportChange: (map: L.Map) => void;
}) => {
  const map = useMap();
  const lastRestoreKeyRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      !restoreViewRequest ||
      restoreViewRequest.key === lastRestoreKeyRef.current
    ) {
      return;
    }

    lastRestoreKeyRef.current = restoreViewRequest.key;
    map.setView(
      [restoreViewRequest.center.lat, restoreViewRequest.center.lng],
      restoreViewRequest.zoom,
      { animate: true },
    );
    onViewportChange(map);
  }, [map, onViewportChange, restoreViewRequest]);

  return null;
};

const LabelLayoutWatcher = ({
  onLayout,
}: {
  onLayout: (map: L.Map) => void;
}) => {
  const map = useMap();
  const layoutFrameRef = useRef<number | null>(null);
  const scheduleLayout = useCallback(() => {
    if (layoutFrameRef.current !== null) {
      return;
    }
    layoutFrameRef.current = window.requestAnimationFrame(() => {
      layoutFrameRef.current = null;
      onLayout(map);
    });
  }, [map, onLayout]);

  useMapEvents({
    zoomend: scheduleLayout,
    moveend: scheduleLayout,
    resize: scheduleLayout,
  });

  useEffect(() => {
    scheduleLayout();
    return () => {
      if (layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = null;
      }
    };
  }, [scheduleLayout]);

  return null;
};

const MapControls = ({
  initialZoom,
  bottomPaddingRatio,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: {
  initialZoom: number;
  bottomPaddingRatio: number;
  onUserMapInteraction?: () => void;
  onUserMapZoomInteraction?: () => void;
}) => {
  const map = useMap();
  const mobileBottomOffset =
    bottomPaddingRatio > 0
      ? `clamp(1rem, calc(${bottomPaddingRatio * 100}dvh + 1rem), calc(100dvh - 11rem))`
      : "1rem";

  return (
    <Flex
      position="absolute"
      top={{ base: "auto", md: 4 }}
      right={4}
      bottom={{ base: mobileBottomOffset, md: "auto" }}
      zIndex={1000}
      flexDirection="column"
      gap={2}
    >
      <Flex
        flexDirection="column"
        borderRadius="lg"
        bg="white"
        boxShadow="md"
        overflow="hidden"
        border="1px solid"
        borderColor="gray.200"
      >
        <Button
          onClick={() => {
            map.zoomIn();
            window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
          }}
          p={2}
          color="gray.700"
          bg="transparent"
          _hover={{ bg: "gray.50" }}
          borderRadius="0"
          fontSize="xl"
          fontWeight="700"
          minW="auto"
          h={{ base: 10, sm: 12 }}
          w={{ base: 10, sm: 12 }}
        >
          +
        </Button>
        <Box h="1px" w="100%" bg="gray.100" />
        <Button
          onClick={() => {
            map.zoomOut();
            window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
          }}
          p={2}
          color="gray.700"
          bg="transparent"
          _hover={{ bg: "gray.50" }}
          borderRadius="0"
          fontSize="xl"
          fontWeight="700"
          minW="auto"
          h={{ base: 10, sm: 12 }}
          w={{ base: 10, sm: 12 }}
        >
          -
        </Button>
      </Flex>
      <Button
        onClick={() => {
          onUserMapInteraction?.();
          map.setView(INITIAL_CENTER, initialZoom);
        }}
        borderRadius="lg"
        bg="white"
        p={2}
        color="gray.700"
        boxShadow="md"
        border="1px solid"
        borderColor="gray.200"
        _hover={{ bg: "gray.50" }}
        minW="auto"
        h={{ base: 10, sm: 12 }}
        w={{ base: 10, sm: 12 }}
      >
        <Home size={20} />
      </Button>
    </Flex>
  );
};

type Props = {
  resorts: MapSkiResort[];
  filteredResortIdSet?: Set<string>;
  isFilterActive?: boolean;
  searchResultResortIds?: string[];
  searchViewportRequestKey?: number;
  searchViewportBottomPaddingRatio?: number;
  mapControlBottomPaddingRatio?: number;
  selectedResortId: string | null;
  selectedViewportBottomPaddingRatio?: number;
  hoveredResortId?: string | null;
  onSelectResort: (id: string) => void;
  interactionMode?: "default" | "detail" | "compare";
  selectedCompareIdSet?: Set<string>;
  onToggleCompare?: (id: string, selected: boolean) => void;
  onBoundsChange: (bounds: L.LatLngBounds) => void;
  onViewChange?: (view: MapViewSnapshot) => void;
  onUserMapInteraction?: () => void;
  onUserMapZoomInteraction?: () => void;
  restoreViewRequest?: MapViewRestoreRequest | null;
};

type MapViewSnapshot = {
  center: { lat: number; lng: number };
  zoom: number;
};

type MapViewRestoreRequest = MapViewSnapshot & {
  key: number;
};

type ResortPriority = "selected" | "filter-match" | "normal";

const getResortPriority = ({
  resortId,
  filteredResortIdSet,
  isFilterActive,
  selectedResortIdSet,
}: {
  resortId: string;
  filteredResortIdSet?: Set<string>;
  isFilterActive: boolean;
  selectedResortIdSet: Set<string>;
}): ResortPriority => {
  if (selectedResortIdSet.has(resortId)) return "selected";
  if (isFilterActive && filteredResortIdSet?.has(resortId)) {
    return "filter-match";
  }
  return "normal";
};

const getResortPriorityRank = (priority: ResortPriority): number => {
  if (priority === "selected") return 2;
  if (priority === "filter-match") return 1;
  return 0;
};

const getMarkerZIndexOffset = (priority: ResortPriority): number => {
  if (priority === "selected") return 10000;
  if (priority === "filter-match") return 5000;
  return 0;
};

const getPanelOverlapRightWidth = (
  map: L.Map,
  panelAttribute: string,
): number => {
  if (typeof document === "undefined") return 0;

  const panel = document.querySelector<HTMLElement>(
    `[${panelAttribute}="true"]`,
  );
  if (!panel) return 0;

  const mapRect = map.getContainer().getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const overlapsVertically =
    panelRect.bottom > mapRect.top && panelRect.top < mapRect.bottom;
  if (!overlapsVertically || panelRect.width >= mapRect.width) return 0;

  const overlapRight = mapRect.right - Math.max(mapRect.left, panelRect.left);
  return Math.max(0, Math.min(mapRect.width, overlapRight));
};

const getComparePanelOverlapRightWidth = (map: L.Map): number =>
  getPanelOverlapRightWidth(map, COMPARE_PANEL_ATTRIBUTE);

const getDetailPanelOverlapRightWidth = (map: L.Map): number =>
  getPanelOverlapRightWidth(map, DETAIL_PANEL_ATTRIBUTE);

const getPanelAdjustedCenter = (
  map: L.Map,
  latLng: L.LatLngExpression,
  rightPanelWidth: number,
  bottomPanelHeight: number,
  zoom = map.getZoom(),
): L.LatLng => {
  if (rightPanelWidth <= 0 && bottomPanelHeight <= 0) return L.latLng(latLng);

  const point = map.project(latLng, zoom);
  return map.unproject(
    point.add([rightPanelWidth / 2, bottomPanelHeight / 2]),
    zoom,
  );
};

const getSafeFitPadding = (
  map: L.Map,
  rightPanelWidth: number,
  bottomPanelHeight: number,
): {
  paddingTopLeft: L.PointExpression;
  paddingBottomRight: L.PointExpression;
} => {
  const mapSize = map.getSize();
  const basePadding = 32;
  const maxRightPadding = Math.max(basePadding, mapSize.x - basePadding * 3);
  const maxBottomPadding = Math.max(basePadding, mapSize.y - basePadding * 3);
  const rightPadding = Math.min(rightPanelWidth + basePadding, maxRightPadding);
  const bottomPadding = Math.min(
    bottomPanelHeight + basePadding,
    maxBottomPadding,
  );

  return {
    paddingTopLeft: [basePadding, basePadding],
    paddingBottomRight: [rightPadding, bottomPadding],
  };
};

const fitResortsInViewport = ({
  map,
  resorts,
  rightPanelWidth = 0,
  bottomPanelHeight = 0,
  labelShowZoom = DESKTOP_LABEL_SHOW_ZOOM,
}: {
  map: L.Map;
  resorts: MapSkiResort[];
  rightPanelWidth?: number;
  bottomPanelHeight?: number;
  labelShowZoom?: number;
}) => {
  if (resorts.length === 0) return;

  const fitPadding = getSafeFitPadding(map, rightPanelWidth, bottomPanelHeight);

  if (resorts.length === 1) {
    const resortLatLng: L.LatLngTuple = [
      resorts[0].latitude,
      resorts[0].longitude,
    ];
    const targetZoom = Math.max(map.getZoom(), labelShowZoom);
    map.setView(
      getPanelAdjustedCenter(
        map,
        resortLatLng,
        rightPanelWidth,
        bottomPanelHeight,
        targetZoom,
      ),
      targetZoom,
      { animate: true },
    );
    return;
  }

  const bounds = L.latLngBounds(
    resorts.map(resort => [resort.latitude, resort.longitude]),
  );

  map.fitBounds(bounds, {
    animate: true,
    ...fitPadding,
  });
};

const SearchViewportController = ({
  enabled,
  resorts,
  searchResultResortIds,
  searchViewportRequestKey,
  searchViewportBottomPaddingRatio,
  labelShowZoom,
  onViewportChange,
}: {
  enabled: boolean;
  resorts: MapSkiResort[];
  searchResultResortIds: string[];
  searchViewportRequestKey: number;
  searchViewportBottomPaddingRatio: number;
  labelShowZoom: number;
  onViewportChange: (map: L.Map) => void;
}) => {
  const map = useMap();
  const lastRequestKeyRef = useRef(searchViewportRequestKey);
  const lastBottomPaddingRatioRef = useRef(searchViewportBottomPaddingRatio);

  useEffect(() => {
    const hasNewSearchRequest =
      searchViewportRequestKey !== lastRequestKeyRef.current;
    const hasBottomPaddingChanged =
      Math.abs(
        searchViewportBottomPaddingRatio - lastBottomPaddingRatioRef.current,
      ) > VIEWPORT_PADDING_RATIO_CHANGE_THRESHOLD;

    if (
      !enabled ||
      searchViewportRequestKey === 0 ||
      (!hasNewSearchRequest && !hasBottomPaddingChanged)
    ) {
      return;
    }
    lastRequestKeyRef.current = searchViewportRequestKey;
    lastBottomPaddingRatioRef.current = searchViewportBottomPaddingRatio;

    const searchResultResortIdSet = new Set(searchResultResortIds);
    const searchResultResorts = resorts.filter(resort =>
      searchResultResortIdSet.has(resort.id),
    );

    fitResortsInViewport({
      map,
      resorts: searchResultResorts,
      bottomPanelHeight: map.getSize().y * searchViewportBottomPaddingRatio,
      labelShowZoom,
    });
    onViewportChange(map);
  }, [
    map,
    enabled,
    onViewportChange,
    resorts,
    searchResultResortIds,
    searchViewportRequestKey,
    searchViewportBottomPaddingRatio,
    labelShowZoom,
  ]);

  return null;
};

const MapViewportController = ({
  initialZoom,
  resorts,
  selectedResortId,
  selectedCompareIdSet,
  interactionMode,
  selectedViewportBottomPaddingRatio,
  labelShowZoom,
  onViewportChange,
  skipCompareRecenterRef,
}: {
  initialZoom: number;
  resorts: MapSkiResort[];
  selectedResortId: string | null;
  selectedCompareIdSet: Set<string>;
  interactionMode: "default" | "detail" | "compare";
  selectedViewportBottomPaddingRatio: number;
  labelShowZoom: number;
  onViewportChange: (map: L.Map) => void;
  skipCompareRecenterRef?: React.MutableRefObject<boolean>;
}) => {
  const map = useMap();

  useEffect(() => {
    map.setMinZoom(initialZoom);
  }, [initialZoom, map]);

  useEffect(() => {
    if (interactionMode === "detail" && selectedResortId) {
      const resort = resorts.find(resort => resort.id === selectedResortId);
      if (!resort) return;

      const resortLatLng: L.LatLngTuple = [resort.latitude, resort.longitude];
      const sidePanelWidth = getDetailPanelOverlapRightWidth(map);
      const bottomPanelHeight =
        map.getSize().y * selectedViewportBottomPaddingRatio;
      const targetZoom = Math.max(map.getZoom(), labelShowZoom);
      map.setView(
        getPanelAdjustedCenter(
          map,
          resortLatLng,
          sidePanelWidth,
          bottomPanelHeight,
          targetZoom,
        ),
        targetZoom,
        { animate: true },
      );
      onViewportChange(map);
      return;
    }

    if (interactionMode === "compare" && selectedCompareIdSet.size > 0) {
      if (skipCompareRecenterRef?.current) {
        skipCompareRecenterRef.current = false;
        return;
      }
      const selectedResorts = resorts.filter(resort =>
        selectedCompareIdSet.has(resort.id),
      );
      if (selectedResorts.length === 0) return;

      const sidePanelWidth = getComparePanelOverlapRightWidth(map);
      fitResortsInViewport({
        map,
        resorts: selectedResorts,
        rightPanelWidth: sidePanelWidth,
        labelShowZoom,
      });
      onViewportChange(map);
    }
  }, [
    interactionMode,
    labelShowZoom,
    map,
    onViewportChange,
    resorts,
    selectedCompareIdSet,
    selectedResortId,
    selectedViewportBottomPaddingRatio,
    skipCompareRecenterRef,
  ]);

  return null;
};

export const SkiResortMap = memo(function SkiResortMap({
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
}: Props) {
  const [labelLayouts, setLabelLayouts] = useState<Record<string, LabelLayout>>(
    {},
  );
  const [aliasById, setAliasById] = useState<Map<string, string>>(new Map());
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
  const [mapZoom, setMapZoom] = useState(initialZoom);
  const skipCompareRecenterRef = useRef(false);
  const mapZoomSurfaceRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (resorts.length === 0) {
      return;
    }

    let cancelled = false;

    loadAliasById().then(map => {
      if (!cancelled) {
        setAliasById(map);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [resorts.length]);

  const displayNameById = useMemo(() => {
    const entries: Array<[string, string]> = resorts.map(resort => {
      const customAlias = aliasById.get(resort.id)?.trim();
      const baseName =
        customAlias && customAlias.length > 0 ? customAlias : resort.nameJa;
      const displayName = removeSkiResortWord(baseName);

      return [resort.id, displayName.length > 0 ? displayName : resort.nameJa];
    });

    return new Map<string, string>(entries);
  }, [aliasById, resorts]);

  const updateLabelLayout = useCallback(
    (map: L.Map) => {
      const currentZoom = map.getZoom();
      setMapZoom(currentZoom);
      const selectedResortIdSet =
        interactionMode === "compare"
          ? new Set(selectedCompareIdSet ?? [])
          : selectedResortId
            ? new Set([selectedResortId])
            : new Set<string>();
      if (hoveredResortId) {
        selectedResortIdSet.add(hoveredResortId);
      }
      const shouldShowLabelsBelowDefaultZoom = selectedResortIdSet.size > 0;

      if (currentZoom < labelShowZoom && !shouldShowLabelsBelowDefaultZoom) {
        setLabelLayouts(previousLayouts =>
          Object.keys(previousLayouts).length === 0 ? previousLayouts : {},
        );
        return;
      }

      const isSimpleVerticalLayout = currentZoom < labelAdvancedLayoutZoom;
      const useAdvancedLayout = currentZoom >= labelAdvancedLayoutZoom;

      const mapSize = map.getSize();
      const labelViewport = createExpandedLabelViewport(mapSize);
      const labelCandidateBounds = createLabelCandidateBounds(
        map,
        labelViewport,
      );
      const labelHeight = measureLabelHeight();

      const placedCollisionRects: Rect[] = [];
      const placedActualRects: Rect[] = [];
      const placedLeaderSegments: Segment[] = [];

      const visibleCandidates = resorts.filter(resort =>
        labelCandidateBounds.contains([
          resort.latitude,
          resort.longitude,
        ] as L.LatLngTuple),
      );
      const labelCandidates = visibleCandidates.filter(resort => {
        if (currentZoom < labelShowZoom) {
          return selectedResortIdSet.has(resort.id);
        }

        if (isFilterActive && currentZoom < labelAdvancedLayoutZoom) {
          return (
            selectedResortIdSet.has(resort.id) ||
            filteredResortIdSet?.has(resort.id) === true
          );
        }

        return true;
      });

      const sortedCandidates = labelCandidates.sort((a, b) => {
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
          getResortPriorityRank(bPriority) - getResortPriorityRank(aPriority);

        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return b.numberOfCourses - a.numberOfCourses;
      });

      const pointById = new Map<string, L.Point>(
        sortedCandidates.map(resort => [
          resort.id,
          map.latLngToContainerPoint([
            resort.latitude,
            resort.longitude,
          ] as L.LatLngTuple),
        ]),
      );

      const pointEntries: MapPointEntry[] = sortedCandidates
        .map(resort => {
          const point = pointById.get(resort.id);
          return point ? { id: resort.id, point } : null;
        })
        .filter((value): value is MapPointEntry => value !== null);

      const nextLayouts: Record<string, LabelLayout> = {};

      if (isSimpleVerticalLayout) {
        for (const resort of sortedCandidates) {
          const point = pointById.get(resort.id);
          if (!point) continue;

          const labelWidth = getResortLabelWidth(resort, displayNameById);
          const pointGap = getResortPointLabelGap(
            selectedResortIdSet.has(resort.id),
          );

          const candidates = createSimpleVerticalCandidates({
            point,
            labelWidth,
            labelHeight,
            pointGap,
          });

          let acceptedRect: Rect | undefined;
          let acceptedCollisionRect: Rect | undefined;

          for (const candidate of candidates) {
            const rect: Rect = {
              left: candidate.left,
              right: candidate.left + labelWidth,
              top: candidate.top,
              bottom: candidate.top + labelHeight,
            };

            const collisionRect = expandRect(rect, LABEL_COLLISION_PADDING);

            const inViewport = isRectInsideLabelViewport(
              collisionRect,
              labelViewport,
            );

            if (!inViewport) {
              continue;
            }

            const overlapsPlacedLabel = placedCollisionRects.some(placed =>
              rectsOverlap(collisionRect, placed),
            );
            if (overlapsPlacedLabel) {
              continue;
            }

            acceptedRect = rect;
            acceptedCollisionRect = collisionRect;
            break;
          }

          if (!acceptedRect || !acceptedCollisionRect) {
            continue;
          }

          placedCollisionRects.push(acceptedCollisionRect);
          placedActualRects.push(acceptedRect);

          const labelTopLeftLatLng = map.containerPointToLatLng(
            L.point(acceptedRect.left, acceptedRect.top),
          );

          nextLayouts[resort.id] = {
            labelPosition: [labelTopLeftLatLng.lat, labelTopLeftLatLng.lng],
            leaderEndPosition: [resort.latitude, resort.longitude],
            showLeaderLine: false,
            labelWidth,
          };
        }

        setLabelLayouts(nextLayouts);
        return;
      }

      const crowdedPointIds = useAdvancedLayout
        ? detectCrowdedPointIds(pointEntries, ADVANCED_NEAR_POINT_DISTANCE)
        : new Set<string>();

      for (const resort of sortedCandidates) {
        const point = pointById.get(resort.id);
        if (!point) continue;

        const shouldForceLeaderLine =
          useAdvancedLayout && crowdedPointIds.has(resort.id);

        const labelWidth = getResortLabelWidth(resort, displayNameById);
        const pointGap = getResortPointLabelGap(
          selectedResortIdSet.has(resort.id),
        );

        const evaluateCandidates = (
          candidates: CandidatePlacement[],
          options: { allowLineCrossing: boolean },
        ): CandidateEvaluation | undefined => {
          let best: CandidateEvaluation | undefined;

          for (const candidate of candidates) {
            const rect: Rect = {
              left: candidate.left,
              right: candidate.left + labelWidth,
              top: candidate.top,
              bottom: candidate.top + labelHeight,
            };

            const collisionRect = expandRect(rect, LABEL_COLLISION_PADDING);

            const inViewport = isRectInsideLabelViewport(
              collisionRect,
              labelViewport,
            );

            if (!inViewport) {
              continue;
            }

            const overlapsPlacedLabel = placedCollisionRects.some(placed =>
              rectsOverlap(collisionRect, placed),
            );
            if (overlapsPlacedLabel) {
              continue;
            }

            const coversOtherPoint = pointEntries.some(
              ({ id, point: otherPoint }) =>
                id !== resort.id &&
                rectContainsPoint(rect, otherPoint, LABEL_POINT_CLEARANCE),
            );
            if (coversOtherPoint) {
              continue;
            }

            const overlapsOwnPoint =
              distancePointToRect(point, rect) < pointGap;
            if (overlapsOwnPoint) {
              continue;
            }

            const leaderEndPoint = getLeaderEndPoint(point, rect);
            const leaderSegment: Segment = {
              x1: point.x,
              y1: point.y,
              x2: leaderEndPoint.x,
              y2: leaderEndPoint.y,
            };

            const leaderLength = Math.hypot(
              leaderSegment.x2 - leaderSegment.x1,
              leaderSegment.y2 - leaderSegment.y1,
            );

            const showLeaderLine =
              useAdvancedLayout &&
              (candidate.forceLeaderLine ||
                shouldForceLeaderLine ||
                leaderLength > pointGap + 4);

            if (showLeaderLine) {
              const intersectsExistingLabel = placedActualRects.some(
                existingRect =>
                  segmentIntersectsRect(leaderSegment, existingRect),
              );
              if (intersectsExistingLabel) {
                continue;
              }

              const existingLineCrossesNewLabel = placedLeaderSegments.some(
                existingSegment => segmentIntersectsRect(existingSegment, rect),
              );
              if (existingLineCrossesNewLabel) {
                continue;
              }

              const intersectsOtherPoint = pointEntries.some(
                ({ id, point: otherPoint }) =>
                  id !== resort.id &&
                  distancePointToSegment(otherPoint, leaderSegment) <
                    LEADER_POINT_CLEARANCE,
              );
              if (intersectsOtherPoint) {
                continue;
              }

              if (!options.allowLineCrossing) {
                const crossesExistingLeader = placedLeaderSegments.some(
                  existingSegment =>
                    segmentsIntersect(existingSegment, leaderSegment),
                );
                if (crossesExistingLeader) {
                  continue;
                }
              }
            }

            let score = 0;

            score += leaderLength;
            if (showLeaderLine) score += 18;

            const nearestOtherPointDistance = pointEntries
              .filter(({ id }) => id !== resort.id)
              .reduce((minDistance, { point: otherPoint }) => {
                const distance = distancePointToRect(otherPoint, rect);
                return Math.min(minDistance, distance);
              }, Number.POSITIVE_INFINITY);

            if (nearestOtherPointDistance < 28) {
              score += (28 - nearestOtherPointDistance) * 3;
            }

            if (best === undefined || score < best.score) {
              best = {
                rect,
                collisionRect,
                leaderSegment,
                showLeaderLine,
                score,
              };
            }
          }

          return best;
        };

        const primaryCandidates = createPrimaryCandidates({
          point,
          labelWidth,
          labelHeight,
          mapSize,
          useAdvancedLayout,
          shouldForceLeaderLine,
          pointGap,
        });

        const denseFallbackCandidates = useAdvancedLayout
          ? createDenseFallbackCandidates({
              point,
              labelWidth,
              labelHeight,
              mapSize,
            })
          : [];

        const accepted =
          evaluateCandidates(primaryCandidates, { allowLineCrossing: false }) ??
          evaluateCandidates(denseFallbackCandidates, {
            allowLineCrossing: false,
          }) ??
          evaluateCandidates(denseFallbackCandidates, {
            allowLineCrossing: true,
          });

        if (!accepted) {
          continue;
        }

        placedCollisionRects.push(accepted.collisionRect);
        placedActualRects.push(accepted.rect);

        if (accepted.showLeaderLine) {
          placedLeaderSegments.push(accepted.leaderSegment);
        }

        const labelTopLeftLatLng = map.containerPointToLatLng(
          L.point(accepted.rect.left, accepted.rect.top),
        );
        const leaderEndLatLng = map.containerPointToLatLng(
          L.point(accepted.leaderSegment.x2, accepted.leaderSegment.y2),
        );

        nextLayouts[resort.id] = {
          labelPosition: [labelTopLeftLatLng.lat, labelTopLeftLatLng.lng],
          leaderEndPosition: [leaderEndLatLng.lat, leaderEndLatLng.lng],
          showLeaderLine: accepted.showLeaderLine,
          labelWidth,
        };
      }

      setLabelLayouts(nextLayouts);
    },
    [
      displayNameById,
      filteredResortIdSet,
      interactionMode,
      isFilterActive,
      labelAdvancedLayoutZoom,
      labelShowZoom,
      resorts,
      selectedCompareIdSet,
      selectedResortId,
      hoveredResortId,
    ],
  );

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
  const pendingWrapperZoomInteractionRef = useRef(false);
  const wrapperZoomInteractionTimeoutRef = useRef<number | null>(null);
  const clearWrapperZoomInteractionTimeout = useCallback(() => {
    if (wrapperZoomInteractionTimeoutRef.current === null) return;

    window.clearTimeout(wrapperZoomInteractionTimeoutRef.current);
    wrapperZoomInteractionTimeoutRef.current = null;
  }, []);
  const completeWrapperZoomInteraction = useCallback(() => {
    clearWrapperZoomInteractionTimeout();
    if (!pendingWrapperZoomInteractionRef.current) return;

    pendingWrapperZoomInteractionRef.current = false;
    onUserMapZoomInteraction?.();
  }, [clearWrapperZoomInteractionTimeout, onUserMapZoomInteraction]);
  const scheduleWrapperZoomInteraction = useCallback(() => {
    pendingWrapperZoomInteractionRef.current = true;
    clearWrapperZoomInteractionTimeout();
    completeWrapperZoomInteraction();
  }, [clearWrapperZoomInteractionTimeout, completeWrapperZoomInteraction]);
  const handleMapWheelCapture = useCallback(
    (_event: ReactWheelEvent<HTMLDivElement>) => {
      scheduleWrapperZoomInteraction();
    },
    [scheduleWrapperZoomInteraction],
  );
  const handleMapDoubleClickCapture = useCallback(() => {
    scheduleWrapperZoomInteraction();
  }, [scheduleWrapperZoomInteraction]);
  const handleMapTouchStartCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (event.touches.length < 2) return;

      scheduleWrapperZoomInteraction();
    },
    [scheduleWrapperZoomInteraction],
  );
  const handleMapTouchEndCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (
        !pendingWrapperZoomInteractionRef.current ||
        event.touches.length > 0
      ) {
        return;
      }

      scheduleWrapperZoomInteraction();
    },
    [scheduleWrapperZoomInteraction],
  );

  useEffect(() => {
    const surface = mapZoomSurfaceRef.current;
    if (!surface) return;

    const handleWheel = () => {
      scheduleWrapperZoomInteraction();
    };
    const handleDoubleClick = () => {
      scheduleWrapperZoomInteraction();
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;

      scheduleWrapperZoomInteraction();
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (
        !pendingWrapperZoomInteractionRef.current ||
        event.touches.length > 0
      ) {
        return;
      }

      scheduleWrapperZoomInteraction();
    };

    surface.addEventListener("wheel", handleWheel, { passive: true });
    surface.addEventListener("dblclick", handleDoubleClick);
    surface.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    surface.addEventListener("touchend", handleTouchEnd, { passive: true });
    surface.addEventListener("touchcancel", handleTouchEnd, {
      passive: true,
    });

    return () => {
      surface.removeEventListener("wheel", handleWheel);
      surface.removeEventListener("dblclick", handleDoubleClick);
      surface.removeEventListener("touchstart", handleTouchStart);
      surface.removeEventListener("touchend", handleTouchEnd);
      surface.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [scheduleWrapperZoomInteraction]);

  useEffect(() => {
    return () => {
      clearWrapperZoomInteractionTimeout();
    };
  }, [clearWrapperZoomInteractionTimeout]);

  return (
    <Box
      ref={mapZoomSurfaceRef}
      data-map-zoom-surface="true"
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
        minZoom={initialZoom}
        zoomSnap={zoomSettings.zoomSnap}
        zoomDelta={zoomSettings.zoomDelta}
        zoomControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.jp/styles/maptiler-basic-ja/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Pane name={BASE_MARKER_PANE} style={{ zIndex: 430 }} />
        <Pane name={FRONT_MARKER_PANE} style={{ zIndex: 470 }} />
        <Pane name={FILTER_MATCH_MARKER_PANE} style={{ zIndex: 520 }} />
        <Pane name={SELECTED_MARKER_PANE} style={{ zIndex: 560 }} />

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
            Boolean(labelLayout) &&
            !(shouldShowCompareActions && hasOpenActionPopup);
          const markerRadius = RESORT_POINT_RADIUS;
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
            ? { click: () => setOpenActionPopupResortId(resort.id) }
            : { click: () => onSelectResort(resort.id) };
          const markerZIndexOffset = getMarkerZIndexOffset(priority);
          const pointIcon = createResortPointIcon({
            radius: markerRadius,
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
                    color: isSelected ? "#ca8a04" : "#64748b",
                    opacity: 0.7,
                    weight: 1,
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
                  icon={nameLabelIconsByResortId.get(resort.id)}
                  interactive={hasVisibleLabel}
                  zIndexOffset={markerZIndexOffset}
                  eventHandlers={markerClickEventHandlers}
                />
              )}
            </Fragment>
          );
        })}

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
          onUserMapInteraction={onUserMapInteraction}
          onUserMapZoomInteraction={onUserMapZoomInteraction}
        />
        <MapViewportController
          initialZoom={initialZoom}
          resorts={resorts}
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
    </Box>
  );
});

const ResortActionPopup = ({
  resort,
  isCompareSelected,
  onClose,
  onSelectResort,
  onToggleCompare,
}: {
  resort: MapSkiResort;
  isCompareSelected: boolean;
  onClose: () => void;
  onSelectResort: (id: string) => void;
  onToggleCompare?: (id: string, selected: boolean) => void;
}) => (
  <Popup
    position={[resort.latitude, resort.longitude]}
    closeButton={false}
    autoPan={false}
    eventHandlers={{ remove: onClose }}
  >
    <Flex flexDirection="column" gap={2} minW="190px">
      <Box color="gray.900" fontSize="sm" fontWeight="800" lineHeight="1.35">
        {resort.nameJa}
      </Box>
      <Flex gap={2}>
        <Button
          size="xs"
          flex="1 1 0"
          minW={0}
          variant="outline"
          fontWeight="800"
          onClick={() => {
            onSelectResort(resort.id);
            onClose();
          }}
        >
          詳細を見る
        </Button>
        {onToggleCompare && (
          <Button
            size="xs"
            flex="1 1 0"
            minW={0}
            variant="outline"
            gap={1}
            fontWeight="800"
            color={isCompareSelected ? "white" : "brand.600"}
            bg={isCompareSelected ? "brand.500" : "white"}
            borderColor="brand.500"
            aria-pressed={isCompareSelected}
            _hover={{
              bg: isCompareSelected ? "brand.600" : "brand.50",
            }}
            onClick={() => {
              onToggleCompare(resort.id, !isCompareSelected);
              onClose();
            }}
          >
            <Box
              as={isCompareSelected ? Check : Plus}
              boxSize="14px"
              strokeWidth={3}
            />
            {isCompareSelected ? "比較から外す" : "比較に追加"}
          </Button>
        )}
      </Flex>
    </Flex>
  </Popup>
);
