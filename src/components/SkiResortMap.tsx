"use client";

import { Box, Button, Flex } from "@chakra-ui/react";
import L from "leaflet";
import { Home } from "lucide-react";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CircleMarker,
  MapContainer,
  Marker,
  Pane,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

const INITIAL_CENTER: L.LatLngTuple = [38.25, 139.0];
const INITIAL_ZOOM = 6;
const LABEL_SHOW_ZOOM = 8;
const LABEL_ADVANCED_LAYOUT_ZOOM = 11;

const FALLBACK_LABEL_HEIGHT = 24;
const LABEL_POINT_GAP = 4;
const ADVANCED_NEAR_POINT_DISTANCE = 40;
const LABEL_COLLISION_PADDING = 4;
const LABEL_MARGIN = 6;

const LABEL_POINT_CLEARANCE = 8;
const LEADER_POINT_CLEARANCE = 8;

const BASE_MARKER_PANE = "resort-markers-base";
const FRONT_MARKER_PANE = "resort-markers-front";
const FILTER_MATCH_MARKER_PANE = "resort-markers-filter-match";
const SELECTED_MARKER_PANE = "resort-markers-selected";
const DETAIL_PANEL_MAX_WIDTH = 720;
const COMPARE_PANEL_MAX_WIDTH = 860;
const SIDE_PANEL_WIDTH_RATIO = 0.7;
const SIDE_PANEL_BREAKPOINT_WIDTH = 1024;

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

  aliasByIdPromise = import("@/data/SkiResortNameAliases.json")
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
}: {
  point: L.Point;
  labelWidth: number;
  labelHeight: number;
}): CandidatePlacement[] => [
  {
    left: point.x - labelWidth / 2,
    top: point.y - labelHeight - LABEL_POINT_GAP,
  },
  {
    left: point.x - labelWidth / 2,
    top: point.y + LABEL_POINT_GAP,
  },
];

const createPrimaryCandidates = ({
  point,
  labelWidth,
  labelHeight,
  mapSize,
  useAdvancedLayout,
  shouldForceLeaderLine,
}: {
  point: L.Point;
  labelWidth: number;
  labelHeight: number;
  mapSize: L.Point;
  useAdvancedLayout: boolean;
  shouldForceLeaderLine: boolean;
}): CandidatePlacement[] => {
  const candidates: CandidatePlacement[] = [];

  if (!shouldForceLeaderLine) {
    candidates.push(
      {
        left: point.x - labelWidth / 2,
        top: point.y - labelHeight - LABEL_POINT_GAP,
      },
      {
        left: point.x - labelWidth / 2,
        top: point.y + LABEL_POINT_GAP,
      },
    );

    if (useAdvancedLayout) {
      candidates.push(
        {
          left: point.x + LABEL_POINT_GAP,
          top: point.y - labelHeight / 2,
          forceLeaderLine: true,
        },
        {
          left: point.x - labelWidth - LABEL_POINT_GAP,
          top: point.y - labelHeight / 2,
          forceLeaderLine: true,
        },
      );
    }
  }

  if (useAdvancedLayout) {
    const maxRadius = Math.max(mapSize.x, mapSize.y) * 0.38;
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
  const maxRadius = Math.max(mapSize.x, mapSize.y) * 0.9;
  const angles = [
    0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240,
    255, 270, 285, 300, 315, 330, 345,
  ];

  for (let radius = 28; radius <= maxRadius; radius += 14) {
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

const createViewportScanCandidates = ({
  labelWidth,
  labelHeight,
  mapSize,
}: {
  labelWidth: number;
  labelHeight: number;
  mapSize: L.Point;
}): CandidatePlacement[] => {
  const candidates: CandidatePlacement[] = [];
  const stepX = 12;
  const stepY = labelHeight + 6;

  for (
    let top = LABEL_MARGIN;
    top <= mapSize.y - labelHeight - LABEL_MARGIN;
    top += stepY
  ) {
    for (
      let left = LABEL_MARGIN;
      left <= mapSize.x - labelWidth - LABEL_MARGIN;
      left += stepX
    ) {
      candidates.push({
        left,
        top,
        forceLeaderLine: true,
      });
    }
  }

  return candidates;
};

const isRectInsideViewport = (rect: Rect, mapSize: L.Point): boolean =>
  rect.left >= LABEL_MARGIN &&
  rect.right <= mapSize.x - LABEL_MARGIN &&
  rect.top >= LABEL_MARGIN &&
  rect.bottom <= mapSize.y - LABEL_MARGIN;

const getResortDisplayName = (
  resort: MapResort,
  displayNameById: Map<string, string>,
): string => displayNameById.get(resort.id) ?? resort.nameJa;

const getResortLabelWidth = (
  resort: MapResort,
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

// コンパクトな地図表示用リゾート型
type MapResort = {
  id: string;
  nameJa: string;
  latitude: number;
  longitude: number;
  numberOfCourses: number;
  yukiMagiId: string | null;
};

const MapEventsHandler = ({
  onBoundsChange,
}: {
  onBoundsChange: (bounds: L.LatLngBounds) => void;
}) => {
  const map = useMap();

  useMapEvents({
    zoomend: () => onBoundsChange(map.getBounds()),
    moveend: () => onBoundsChange(map.getBounds()),
  });

  useEffect(() => {
    onBoundsChange(map.getBounds());
  }, [map, onBoundsChange]);

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
    zoom: scheduleLayout,
    zoomend: scheduleLayout,
    move: scheduleLayout,
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

const MapControls = () => {
  const map = useMap();
  return (
    <Flex
      position="absolute"
      top={4}
      right={4}
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
          onClick={() => map.zoomIn()}
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
          onClick={() => map.zoomOut()}
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
        onClick={() => map.setView(INITIAL_CENTER, INITIAL_ZOOM)}
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
  resorts: MapResort[];
  filteredResortIdSet?: Set<string>;
  isFilterActive?: boolean;
  selectedResortId: string | null;
  onSelectResort: (id: string) => void;
  interactionMode?: "default" | "detail" | "compare";
  selectedCompareIdSet?: Set<string>;
  onToggleCompare?: (id: string, selected: boolean) => void;
  onBoundsChange: (bounds: L.LatLngBounds) => void;
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

const getSidePanelWidth = (mode: "default" | "detail" | "compare"): number => {
  if (typeof window === "undefined") return 0;
  if (mode === "default" || window.innerWidth < SIDE_PANEL_BREAKPOINT_WIDTH) {
    return 0;
  }

  const maxWidth =
    mode === "compare" ? COMPARE_PANEL_MAX_WIDTH : DETAIL_PANEL_MAX_WIDTH;
  return Math.min(maxWidth, window.innerWidth * SIDE_PANEL_WIDTH_RATIO);
};

const MapViewportController = ({
  resorts,
  selectedResortId,
  selectedCompareIdSet,
  interactionMode,
  onViewportChange,
  skipCompareRecenterRef,
}: {
  resorts: MapResort[];
  selectedResortId: string | null;
  selectedCompareIdSet: Set<string>;
  interactionMode: "default" | "detail" | "compare";
  onViewportChange: (map: L.Map) => void;
  skipCompareRecenterRef?: React.MutableRefObject<boolean>;
}) => {
  const map = useMap();

  useEffect(() => {
    map.setMinZoom(INITIAL_ZOOM);
  }, [map]);

  useEffect(() => {
    if (interactionMode === "detail" && selectedResortId) {
      const resort = resorts.find(resort => resort.id === selectedResortId);
      if (!resort) return;

      map.setView([resort.latitude, resort.longitude], map.getZoom(), {
        animate: true,
      });
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

      const bounds = L.latLngBounds(
        selectedResorts.map(resort => [resort.latitude, resort.longitude]),
      );

      if (selectedResorts.length === 1) {
        map.setView(
          [selectedResorts[0].latitude, selectedResorts[0].longitude],
          Math.max(map.getZoom(), INITIAL_ZOOM),
          { animate: true },
        );
      } else {
        map.fitBounds(bounds, {
          animate: true,
          paddingTopLeft: [24, 24],
          paddingBottomRight: [getSidePanelWidth(interactionMode) + 24, 24],
        });
      }
      onViewportChange(map);
    }
  }, [
    interactionMode,
    map,
    onViewportChange,
    resorts,
    selectedCompareIdSet,
    selectedResortId,
    skipCompareRecenterRef,
  ]);

  return null;
};

export const SkiResortMap = memo(function SkiResortMap({
  resorts,
  filteredResortIdSet,
  isFilterActive = false,
  selectedResortId,
  onSelectResort,
  interactionMode = "default",
  selectedCompareIdSet,
  onToggleCompare,
  onBoundsChange,
}: Props) {
  const [labelLayouts, setLabelLayouts] = useState<Record<string, LabelLayout>>(
    {},
  );
  const [aliasById, setAliasById] = useState<Map<string, string>>(new Map());
  const [openActionPopupResortId, setOpenActionPopupResortId] = useState<
    string | null
  >(null);
  const [mapZoom, setMapZoom] = useState(INITIAL_ZOOM);
  const skipCompareRecenterRef = useRef(false);

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
          ? (selectedCompareIdSet ?? new Set<string>())
          : selectedResortId
            ? new Set([selectedResortId])
            : new Set<string>();
      const shouldShowLabelsBelowDefaultZoom =
        interactionMode !== "default" && selectedResortIdSet.size > 0;

      if (currentZoom < LABEL_SHOW_ZOOM && !shouldShowLabelsBelowDefaultZoom) {
        setLabelLayouts(previousLayouts =>
          Object.keys(previousLayouts).length === 0 ? previousLayouts : {},
        );
        return;
      }

      const isSimpleVerticalLayout = currentZoom < LABEL_ADVANCED_LAYOUT_ZOOM;
      const useAdvancedLayout = currentZoom >= LABEL_ADVANCED_LAYOUT_ZOOM;

      const mapBounds = map.getBounds();
      const mapSize = map.getSize();
      const labelHeight = measureLabelHeight();

      const placedCollisionRects: Rect[] = [];
      const placedActualRects: Rect[] = [];
      const placedLeaderSegments: Segment[] = [];

      const visibleCandidates = resorts.filter(resort =>
        mapBounds.contains([
          resort.latitude,
          resort.longitude,
        ] as L.LatLngTuple),
      );
      const labelCandidates = visibleCandidates.filter(resort => {
        if (currentZoom < LABEL_SHOW_ZOOM) {
          return selectedResortIdSet.has(resort.id);
        }

        if (isFilterActive && currentZoom < LABEL_ADVANCED_LAYOUT_ZOOM) {
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

          const candidates = createSimpleVerticalCandidates({
            point,
            labelWidth,
            labelHeight,
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

            const inViewport = isRectInsideViewport(collisionRect, mapSize);

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

            const inViewport = isRectInsideViewport(collisionRect, mapSize);

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
              distancePointToRect(point, rect) < LABEL_POINT_GAP;
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
                leaderLength > LABEL_POINT_GAP + 4);

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
        });

        const denseFallbackCandidates = useAdvancedLayout
          ? createDenseFallbackCandidates({
              point,
              labelWidth,
              labelHeight,
              mapSize,
            })
          : [];

        const viewportCandidates = useAdvancedLayout
          ? createViewportScanCandidates({
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
          }) ??
          evaluateCandidates(viewportCandidates, { allowLineCrossing: true });

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
      resorts,
      selectedCompareIdSet,
      selectedResortId,
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
    if (interactionMode === "compare") {
      return selectedCompareIdSet ?? new Set<string>();
    }
    return selectedResortId ? new Set([selectedResortId]) : new Set<string>();
  }, [interactionMode, selectedCompareIdSet, selectedResortId]);
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

  return (
    <MapContainer
      center={INITIAL_CENTER}
      zoom={INITIAL_ZOOM}
      minZoom={INITIAL_ZOOM}
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
        const markerRadius = isSelected ? 6 : 4;
        const shouldDimUnselectedComparePoint =
          interactionMode === "compare" &&
          mapZoom < LABEL_SHOW_ZOOM &&
          !isSelected &&
          !isFilterMatch;
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
        const markerEventHandlers = {
          ...(shouldShowCompareActions
            ? { click: () => setOpenActionPopupResortId(resort.id) }
            : { click: () => onSelectResort(resort.id) }),
          ...(shouldDimPoint
            ? {
                mouseout: (event: L.LeafletMouseEvent) => {
                  event.target.setStyle({
                    fillOpacity: 0.48,
                    opacity: 0.58,
                  });
                },
                mouseover: (event: L.LeafletMouseEvent) => {
                  event.target.setStyle({
                    fillOpacity: 0.95,
                    opacity: 1,
                  });
                },
              }
            : {}),
          ...(!shouldDimPoint && !isSelected
            ? {
                mouseout: (event: L.LeafletMouseEvent) => {
                  event.target.setStyle({
                    fillOpacity: 0.95,
                    opacity: 1,
                    weight: 1,
                  });
                },
                mouseover: (event: L.LeafletMouseEvent) => {
                  event.target.setStyle({
                    fillOpacity: 1,
                    opacity: 1,
                    weight: 2,
                  });
                },
              }
            : {}),
        };

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

            <CircleMarker
              center={[resort.latitude, resort.longitude]}
              radius={markerRadius}
              pane={markerPane}
              pathOptions={{
                color: "#ffffff",
                weight: isSelected ? 2 : 1,
                fillColor: isFilterMatch ? "#dc2626" : "#0284c7",
                fillOpacity: shouldDimPoint ? 0.48 : 0.95,
                opacity: shouldDimPoint ? 0.58 : 1,
              }}
              eventHandlers={markerEventHandlers}
            />

            {hasVisibleLabel && (
              <Marker
                pane={markerPane}
                position={labelLayout.labelPosition}
                icon={nameLabelIconsByResortId.get(resort.id)}
                eventHandlers={
                  shouldShowCompareActions
                    ? { click: () => setOpenActionPopupResortId(resort.id) }
                    : { click: () => onSelectResort(resort.id) }
                }
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

      <MapControls />
      <MapViewportController
        resorts={resorts}
        selectedResortId={selectedResortId}
        selectedCompareIdSet={selectedCompareIdSet ?? new Set<string>()}
        interactionMode={interactionMode}
        onViewportChange={updateLabelLayout}
        skipCompareRecenterRef={skipCompareRecenterRef}
      />
      <LabelLayoutWatcher onLayout={updateLabelLayout} />
      <MapEventsHandler onBoundsChange={onBoundsChange} />
    </MapContainer>
  );
});

const ResortActionPopup = ({
  resort,
  isCompareSelected,
  onClose,
  onSelectResort,
  onToggleCompare,
}: {
  resort: MapResort;
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
    <Flex flexDirection="column" gap={2} minW="160px">
      <Box color="gray.900" fontSize="sm" fontWeight="800" lineHeight="1.35">
        {resort.nameJa}
      </Box>
      <Flex gap={2}>
        <Button
          size="xs"
          flex="1"
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
            flex="1"
            variant="outline"
            fontWeight="800"
            onClick={() => {
              onToggleCompare(resort.id, !isCompareSelected);
              onClose();
            }}
          >
            {isCompareSelected ? "比較から外す" : "比較に追加"}
          </Button>
        )}
      </Flex>
    </Flex>
  </Popup>
);
