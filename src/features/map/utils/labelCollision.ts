import {
  DENSE_LABEL_SEARCH_MAX_RADIUS_PX,
  LABEL_MARGIN,
  LABEL_PREFETCH_MIN_PADDING_PX,
  LABEL_PREFETCH_PADDING_RATIO,
  PRIMARY_LABEL_SEARCH_MAX_RADIUS_PX,
} from "../constants";
import type { CandidatePlacement, MapPoint, Rect, Segment } from "../types";

const pointInRect = (x: number, y: number, rect: Rect) =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

export const rectsOverlap = (a: Rect, b: Rect) =>
  a.left <= b.right &&
  a.right >= b.left &&
  a.top <= b.bottom &&
  a.bottom >= b.top;

export const expandRect = (rect: Rect, padding: number): Rect => ({
  left: rect.left - padding,
  right: rect.right + padding,
  top: rect.top - padding,
  bottom: rect.bottom + padding,
});

export const rectContainsPoint = (
  rect: Rect,
  point: MapPoint,
  padding = 0,
): boolean => {
  const expanded = expandRect(rect, padding);
  return pointInRect(point.x, point.y, expanded);
};

export const distancePointToRect = (point: MapPoint, rect: Rect): number => {
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

export const segmentsIntersect = (a: Segment, b: Segment) => {
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

export const segmentIntersectsRect = (segment: Segment, rect: Rect) => {
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

export const distancePointToSegment = (
  point: MapPoint,
  segment: Segment,
): number => {
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

export const getLeaderEndPoint = (point: MapPoint, rect: Rect): MapPoint => {
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  const dx = centerX - point.x;
  const dy = centerY - point.y;

  if (Math.abs(dx) < 1e-7 && Math.abs(dy) < 1e-7) {
    return { x: centerX, y: centerY };
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
    return { x: best.x, y: best.y };
  }

  return {
    x: Math.max(rect.left, Math.min(point.x, rect.right)),
    y: Math.max(rect.top, Math.min(point.y, rect.bottom)),
  };
};

export const createSimpleVerticalCandidates = ({
  point,
  labelWidth,
  labelHeight,
  pointGap,
}: {
  point: MapPoint;
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

export const createPrimaryCandidates = ({
  point,
  labelWidth,
  labelHeight,
  mapSize,
  useAdvancedLayout,
  shouldForceLeaderLine,
  pointGap,
}: {
  point: MapPoint;
  labelWidth: number;
  labelHeight: number;
  mapSize: MapPoint;
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

export const createDenseFallbackCandidates = ({
  point,
  labelWidth,
  labelHeight,
  mapSize,
}: {
  point: MapPoint;
  labelWidth: number;
  labelHeight: number;
  mapSize: MapPoint;
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

export const createExpandedLabelViewport = (mapSize: MapPoint): Rect => {
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

export const isRectInsideLabelViewport = (
  rect: Rect,
  layoutViewport: Rect,
): boolean =>
  rect.left >= layoutViewport.left + LABEL_MARGIN &&
  rect.right <= layoutViewport.right - LABEL_MARGIN &&
  rect.top >= layoutViewport.top + LABEL_MARGIN &&
  rect.bottom <= layoutViewport.bottom - LABEL_MARGIN;
