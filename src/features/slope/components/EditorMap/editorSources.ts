import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { LngLat } from "../../types";
import type { EditorMapLine, EditorMapMode, EditorMergePreview } from "./types";

export const EMPTY_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
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
): FeatureCollection => ({
  type: "FeatureCollection",
  features: lines.filter(isDrawable).map(line =>
    lineFeature(line.coordinates, {
      lineId: line.id,
      name: line.name,
      active: line.id === activeLineId,
      hovered: line.id === hoveredLineId && line.id !== activeLineId,
    }),
  ),
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
  mode === "draw" || mode === "edit" || mode === "split";

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
