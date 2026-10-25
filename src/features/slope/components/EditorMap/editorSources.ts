import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import {
  calculateCoordinateSlopes,
  getSlopeColor,
} from "@/lib/finalizedResortGeojsonShared";
import {
  normalizePropertySegments,
  propertyAt,
  sliceLineByFraction,
} from "@/shared/course-lift/segments";
import type { LngLat } from "../../types";
import type { EditorMapLine, EditorMapMode, EditorMergePreview } from "./types";

export const EMPTY_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export const buildCorrectionMaskCollection = (
  lines: EditorMapLine[],
  activeLineId: string | null = null,
): FeatureCollection => ({
  type: "FeatureCollection",
  features: lines.flatMap(line => {
    if (line.kind !== "slope") return [];
    const segments = normalizePropertySegments(line.properties?.pisteSegments);
    const boundaries = [
      ...new Set([0, 1, ...segments.flatMap(item => [item.from, item.to])]),
    ]
      .filter(value => Number.isFinite(value) && value >= 0 && value <= 1)
      .sort((a, b) => a - b);
    return boundaries.slice(0, -1).flatMap((from, index) => {
      const to = boundaries[index + 1];
      if (to === undefined || from >= to) return [];
      const fallback = line.properties?.piste;
      const value = propertyAt(
        segments,
        (from + to) / 2,
        typeof fallback === "string" ? fallback : null,
      );
      const grooming =
        value === "×" ? "ungroomed" : value === "△" ? "variable" : null;
      if (!grooming) return [];
      const coordinates =
        boundaries.length === 2
          ? line.coordinates
          : sliceLineByFraction(line.coordinates, from, to);
      if (coordinates.length < 2) return [];
      return [
        lineFeature(coordinates as LngLat[], {
          lineId: line.id,
          grooming,
          active: line.id === activeLineId,
        }),
      ];
    });
  }),
});

export const buildCorrectionSelectionCollection = (
  lines: EditorMapLine[],
  selection?: { lineId: string; from: number; to: number },
): FeatureCollection => {
  if (
    !selection ||
    !Number.isFinite(selection.from) ||
    !Number.isFinite(selection.to)
  )
    return EMPTY_COLLECTION;
  const line = lines.find(item => item.id === selection.lineId);
  if (!line) return EMPTY_COLLECTION;
  const from = Math.max(0, Math.min(1, Math.min(selection.from, selection.to)));
  const to = Math.max(0, Math.min(1, Math.max(selection.from, selection.to)));
  const coordinates = sliceLineByFraction(line.coordinates, from, to);
  return coordinates.length < 2
    ? EMPTY_COLLECTION
    : {
        type: "FeatureCollection",
        features: [lineFeature(coordinates as LngLat[], { lineId: line.id })],
      };
};

const lineFeature = (
  coordinates: LngLat[],
  properties: Record<string, unknown>,
): Feature<LineString> => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates },
  properties,
});

const pointFeature = (
  coordinate: LngLat,
  properties: Record<string, unknown>,
): Feature<Point> => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: coordinate },
  properties,
});

/** 点が 1 つしかない線は描かない（Leaflet 版も同じ） */
const isDrawable = (line: EditorMapLine) => line.coordinates.length >= 2;

export const buildLineCollection = (
  lines: EditorMapLine[],
  activeLineId: string | null,
  hoveredLineId: string | null = null,
  highlightedLineIds?: ReadonlySet<string>,
  correctionPreview = false,
): FeatureCollection => ({
  type: "FeatureCollection",
  features: lines.filter(isDrawable).flatMap(line => {
    const base = {
      lineId: line.id,
      name: line.name,
      active: line.id === activeLineId,
      hovered: line.id === hoveredLineId && line.id !== activeLineId,
      highlighted: highlightedLineIds?.has(line.id) ?? false,
      kind: line.kind,
      ...(line.properties ?? {}),
    };
    if (!correctionPreview || line.kind !== "slope")
      return [lineFeature(line.coordinates, base)];
    const previewCoordinates = line.properties?._previewCoordinates;
    const elevationCoordinates = Array.isArray(previewCoordinates)
      ? (previewCoordinates as number[][])
      : line.coordinates;
    const hasElevation = elevationCoordinates.some(
      coordinate =>
        typeof coordinate[2] === "number" && Number.isFinite(coordinate[2]),
    );
    if (hasElevation && elevationCoordinates.length >= 2) {
      const slopes = calculateCoordinateSlopes(
        elevationCoordinates as [number, number, number][],
      );
      const divisions = Math.min(slopes.length - 1, 512);
      if (divisions > 0) {
        return Array.from({ length: divisions }, (_, index) => {
          const startIndex = Math.floor(
            (index * (slopes.length - 1)) / divisions,
          );
          const endIndex = Math.max(
            startIndex + 1,
            Math.floor(((index + 1) * (slopes.length - 1)) / divisions),
          );
          const values = slopes
            .slice(startIndex, endIndex + 1)
            .filter((value): value is number => value !== null);
          const value = values.length
            ? values.reduce((sum, slope) => sum + slope, 0) / values.length
            : null;
          const coordinates = sliceLineByFraction(
            line.coordinates,
            index / divisions,
            (index + 1) / divisions,
          );
          return lineFeature(coordinates as LngLat[], {
            ...base,
            previewColor: getSlopeColor(value),
          });
        }).filter(feature => feature.geometry.coordinates.length >= 2);
      }
    }
    const average = line.properties?.avg_slope_deg_map;
    const previewColor =
      typeof average === "number" && Number.isFinite(average)
        ? getSlopeColor(average)
        : undefined;
    return [
      lineFeature(line.coordinates, {
        ...base,
        ...(previewColor ? { previewColor } : {}),
      }),
    ];
  }),
});

export const buildBackgroundCollection = (
  lines: EditorMapLine[],
): FeatureCollection => ({
  type: "FeatureCollection",
  features: lines
    .filter(isDrawable)
    .map(line => lineFeature(line.coordinates, { lineId: line.id })),
});

/** 頂点を出すモードか。view と midstation では触らせない */
const showsVertices = (mode: EditorMapMode) =>
  mode === "draw" || mode === "edit" || mode === "split" || mode === "grouping";

export const buildVertexCollection = (
  activeLine: EditorMapLine | null,
  mode: EditorMapMode,
): FeatureCollection => {
  if (!activeLine || !showsVertices(mode)) return EMPTY_COLLECTION;

  const lastIndex = activeLine.coordinates.length - 1;
  const features = activeLine.coordinates.flatMap((coordinate, index) => {
    // 分割は「線の途中で切る」操作なので、端の頂点は出さない
    const isInner = index > 0 && index < lastIndex;
    if (mode === "split" && !isInner) return [];
    if (mode === "grouping" && isInner) return [];

    const kind =
      mode === "split"
        ? "split"
        : mode === "draw" && index === lastIndex
          ? "last"
          : "vertex";
    return [pointFeature(coordinate, { index, kind })];
  });

  return { type: "FeatureCollection", features };
};

/**
 * 頂点と頂点のあいだに出す、挿入用の点。
 * 位置は単純な平均（Leaflet 版と同じ。球面補間はしない）。
 *
 * 線のどこをクリックしても点は足せるが、この点があると
 * 「ここを押せば足せる」ことが見て分かる。
 */
export const buildMidpointCollection = (
  activeLine: EditorMapLine | null,
  mode: EditorMapMode,
): FeatureCollection => {
  if (!activeLine || mode !== "edit") return EMPTY_COLLECTION;

  return {
    type: "FeatureCollection",
    features: activeLine.coordinates.slice(0, -1).map((coordinate, index) => {
      const next = activeLine.coordinates[index + 1];
      const middle: LngLat = [
        (coordinate[0] + next[0]) / 2,
        (coordinate[1] + next[1]) / 2,
      ];
      return pointFeature(middle, { insertIndex: index + 1 });
    }),
  };
};

/** カーソルが線の上にある間だけ出す、点を足す位置の予告 */
export const buildInsertHintCollection = (
  hint: LngLat | null,
): FeatureCollection =>
  hint === null
    ? EMPTY_COLLECTION
    : { type: "FeatureCollection", features: [pointFeature(hint, {})] };

export const buildMidstationCollection = (
  activeLine: EditorMapLine | null,
  midstation: LngLat | null,
): FeatureCollection => {
  if (!activeLine || !midstation) return EMPTY_COLLECTION;
  return {
    type: "FeatureCollection",
    features: [pointFeature(midstation, {})],
  };
};

export const buildMergePreviewCollection = (
  preview: EditorMergePreview | null,
): FeatureCollection =>
  preview === null || preview.coordinates.length < 2
    ? EMPTY_COLLECTION
    : {
        type: "FeatureCollection",
        features: [lineFeature(preview.coordinates, {})],
      };

export const buildMergeDiscardedCollection = (
  preview: EditorMergePreview | null,
): FeatureCollection =>
  preview === null
    ? EMPTY_COLLECTION
    : {
        type: "FeatureCollection",
        features: preview.discarded
          .filter(part => part.length >= 2)
          .map(part => lineFeature(part, {})),
      };

export const buildMergeAnchorCollection = (
  preview: EditorMergePreview | null,
): FeatureCollection =>
  preview === null
    ? EMPTY_COLLECTION
    : {
        type: "FeatureCollection",
        features: preview.anchors.map((anchor, index) =>
          pointFeature(anchor, { order: index + 1 }),
        ),
      };
