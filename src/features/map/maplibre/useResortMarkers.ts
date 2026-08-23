"use client";

import {
  type GeoJSONSource,
  type Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { MapSkiResort } from "@/types/skiResorts";
import type { LabelLayout, MapTileVariant } from "../types";
import { getResortPriority } from "../utils/resortMarkerPriority";
import {
  EMPTY_RESORT_POINTS,
  RESORT_POINT_COLOR,
  RESORT_POINT_SOURCE,
  type ResortPointCollection,
} from "./resortPointLayers";

type ResortMarkerState = {
  resorts: MapSkiResort[];
  labelLayouts: Record<string, LabelLayout>;
  displayNameById: Map<string, string>;
  selectedResortIdSet: Set<string>;
  filteredResortIdSet?: Set<string>;
  isFilterActive: boolean;
  tileVariant: MapTileVariant;
  interactionMode: "default" | "detail" | "compare";
  mapZoom: number;
  labelShowZoom: number;
  shouldHideLabels: boolean;
  shouldShowCompareActions: boolean;
  openActionPopupResortId: string | null;
  onSelectResort: (id: string) => void;
  onOpenActionPopup: (id: string) => void;
};

const getLeaderColor = (tileVariant: MapTileVariant, isSelected: boolean) => {
  if (tileVariant === "photo") return isSelected ? "#fde047" : "#f8fafc";
  return isSelected ? "#c2410c" : "#334155";
};

/**
 * ラベルと引き出し線をひとまとめにした、点に貼り付く要素を作る。
 *
 * 中身は点からの px のずれで置く。緯度経度に変換して置くと、
 * ズームの途中でずれが実距離として効いてしまい、ラベルだけが
 * 点から離れていってしまう。
 */
const createLabelElement = ({
  name,
  layout,
  isSelected,
  isDimmed,
  tileVariant,
  onSelect,
}: {
  name: string;
  layout: LabelLayout;
  isSelected: boolean;
  isDimmed: boolean;
  tileVariant: MapTileVariant;
  onSelect: () => void;
}) => {
  // 大きさを持たない入れ物にして、anchor: center でも点の真上に来るようにする
  const root = document.createElement("div");
  root.className = "resort-label-anchor";

  if (layout.showLeaderLine) {
    const leader = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    leader.setAttribute("class", "resort-leader-line");
    leader.setAttribute("overflow", "visible");
    leader.setAttribute("width", "0");
    leader.setAttribute("height", "0");

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "0");
    line.setAttribute("x2", `${layout.leaderEndOffsetPx.x}`);
    line.setAttribute("y2", `${layout.leaderEndOffsetPx.y}`);
    line.setAttribute("stroke", getLeaderColor(tileVariant, isSelected));
    line.setAttribute("stroke-width", tileVariant === "photo" ? "1.5" : "1.25");
    line.setAttribute(
      "stroke-opacity",
      tileVariant === "photo" ? "0.92" : "0.78",
    );
    leader.append(line);
    root.append(leader);
  }

  const label = document.createElement("div");
  label.className = [
    "resort-name-label",
    isSelected ? "is-selected" : "",
    isDimmed ? "is-dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  label.style.width = `${layout.labelWidth}px`;
  label.style.left = `${layout.labelOffsetPx.x}px`;
  label.style.top = `${layout.labelOffsetPx.y}px`;
  label.textContent = name;
  label.addEventListener("click", event => {
    event.stopPropagation();
    onSelect();
  });
  root.append(label);

  return root;
};

/**
 * スキー場の点（円レイヤー）と名前ラベル（DOM）。
 *
 * 点は数百個あるので地図側に描かせ、ラベルだけを DOM で持つ。
 * どこに置くかは useJapanMapLabelLayout が計算した結果を使う。
 */
export const useResortMarkers = ({
  map,
  isReady,
  state,
}: {
  map: MapLibreMap | null;
  isReady: boolean;
  state: ResortMarkerState;
}) => {
  const markersRef = useRef<Map<string, Marker>>(new Map());

  useEffect(() => {
    if (!map || !isReady) return;

    const markers = markersRef.current;
    const nextIds = new Set<string>();
    const palette = RESORT_POINT_COLOR[state.tileVariant];
    const points: ResortPointCollection = {
      type: "FeatureCollection",
      features: [],
    };

    for (const resort of state.resorts) {
      const layout = state.labelLayouts[resort.id];
      const priority = getResortPriority({
        resortId: resort.id,
        filteredResortIdSet: state.filteredResortIdSet,
        isFilterActive: state.isFilterActive,
        selectedResortIdSet: state.selectedResortIdSet,
      });
      const isSelected = priority === "selected";
      const isFilterMatch =
        state.isFilterActive &&
        state.filteredResortIdSet?.has(resort.id) === true;
      const hasOpenActionPopup = state.openActionPopupResortId === resort.id;
      const hasLabel =
        !state.shouldHideLabels &&
        Boolean(layout) &&
        !(state.shouldShowCompareActions && hasOpenActionPopup);
      const isDimmedByFilter =
        state.isFilterActive &&
        priority === "normal" &&
        state.filteredResortIdSet?.has(resort.id) !== true;
      // 比較モードで引きの絵のときは、選んでいない点を沈ませる
      const isDimmedPoint =
        isDimmedByFilter ||
        (state.interactionMode === "compare" &&
          state.mapZoom < state.labelShowZoom &&
          !isSelected);

      points.features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [resort.longitude, resort.latitude],
        },
        properties: {
          resortId: resort.id,
          color: isFilterMatch ? palette.filterMatch : palette.normal,
          opacity: isDimmedPoint ? 0.48 : 0.95,
          selected: isSelected,
          interactive: hasLabel,
        },
      });

      if (!hasLabel || !layout) continue;

      nextIds.add(resort.id);
      markers.get(resort.id)?.remove();
      const element = createLabelElement({
        name: state.displayNameById.get(resort.id) ?? resort.nameJa,
        layout,
        isSelected,
        isDimmed: isDimmedByFilter,
        tileVariant: state.tileVariant,
        onSelect: () => {
          if (state.shouldShowCompareActions) {
            state.onOpenActionPopup(resort.id);
            return;
          }
          state.onSelectResort(resort.id);
        },
      });
      markers.set(
        resort.id,
        new Marker({ element, anchor: "center" })
          .setLngLat([resort.longitude, resort.latitude])
          .addTo(map),
      );
    }

    for (const [id, marker] of markers) {
      if (nextIds.has(id)) continue;
      marker.remove();
      markers.delete(id);
    }

    const source = map.getSource(RESORT_POINT_SOURCE) as
      | GeoJSONSource
      | undefined;
    source?.setData(points);

    return () => {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      (
        map.getSource(RESORT_POINT_SOURCE) as GeoJSONSource | undefined
      )?.setData(EMPTY_RESORT_POINTS);
    };
  }, [isReady, map, state]);
};
