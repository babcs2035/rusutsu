"use client";

import { type Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import {
  type FinalizedCourseFeature,
  type FinalizedLiftFeature,
  getLiftClass,
  LIFT_CLASS_LABEL_WEIGHT,
} from "@/lib/finalizedResortGeojsonShared";
import {
  COURSE_LABEL_MIN_ZOOM,
  LIFT_LABEL_MIN_ZOOM,
  LIFT_LABEL_MIN_ZOOM_BY_CLASS,
  LINE_LABEL_TWO_LABEL_MIN_LENGTH_PX,
} from "../constants";
import type { FinalizedFeatureStatus, SelectedMapFeature } from "../types";
import {
  getFeatureStatusKind,
  getLiftDisplayCoordinates,
} from "../utils/finalizedMapData";
import { measureCanvasTextWidth } from "../utils/leafletIcons";
import type { LayoutPoint, OrientedRect } from "../utils/lineLayout";
import {
  collectLabelCandidates,
  getCourseLabelName,
  getLabelCollisionPadding,
  getLabelFont,
  type LabelPlacement,
  type LabelSource,
  placeLabelCandidates,
  shouldSkipCourseLabel,
} from "../utils/lineOverlayLayout";

const measureWidth = (text: string, fontSize: number) =>
  measureCanvasTextWidth(text, getLabelFont(fontSize));

type ManagedMarker = {
  marker: Marker;
  element: HTMLDivElement;
};

const createLabelElement = (
  placement: LabelPlacement,
  onSelect: (feature: SelectedMapFeature) => void,
) => {
  const element = document.createElement("div");
  element.className = [
    "finalized-line-label",
    `finalized-line-label-${placement.kind}`,
    placement.isSelected ? "is-selected" : "",
    placement.isMuted ? "is-muted" : "",
  ]
    .filter(Boolean)
    .join(" ");
  element.textContent = placement.name;
  element.style.fontSize = `${placement.fontSize}px`;
  element.addEventListener("click", event => {
    event.stopPropagation();
    onSelect({ kind: placement.kind, id: placement.selectId });
  });
  return element;
};

/**
 * コース名・リフト名のラベル。
 *
 * MapLibre の Marker に載せることで、毎フレームの位置追従と地図の回転追従を
 * MapLibre 側に任せる。回転角は「線から求めた角度 − 現在の bearing」を渡し、
 * rotationAlignment: "map" で地図に貼り付ける。これで地図を回しても
 * 「標高の高い方から低い方へ」という向きが保たれる。
 */
export const useLineLabelMarkers = ({
  map,
  isReady,
  courses,
  lifts,
  selectedFeature,
  showOpenOnly,
  onSelectFeature,
}: {
  map: MapLibreMap | null;
  isReady: boolean;
  courses: FinalizedCourseFeature[];
  lifts: FinalizedLiftFeature[];
  selectedFeature: SelectedMapFeature | null;
  showOpenOnly: boolean;
  onSelectFeature: (feature: SelectedMapFeature) => void;
}) => {
  const markersRef = useRef<ManagedMarker[]>([]);

  useEffect(() => {
    if (!map || !isReady) return;

    const clearMarkers = () => {
      for (const managed of markersRef.current) managed.marker.remove();
      markersRef.current = [];
    };

    const render = () => {
      clearMarkers();

      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const hasSelection = selectedFeature !== null;
      // 選択中は名前を出さない。名前はパネル側に出ているので、
      // 地図は選択した線そのものを見せることに集中させる。
      if (hasSelection) return;

      const project = (coordinates: number[][]): LayoutPoint[] =>
        coordinates.map(coordinate => {
          const point = map.project([coordinate[0], coordinate[1]]);
          return { x: point.x, y: point.y };
        });

      const placedRects: OrientedRect[] = [];
      const placements: LabelPlacement[] = [];
      const padding = getLabelCollisionPadding(zoom);

      if (zoom >= LIFT_LABEL_MIN_ZOOM) {
        const liftSources = lifts.flatMap<LabelSource>(lift => {
          if (lift.name.length === 0) return [];

          const status = getFeatureStatusKind(lift.properties.status);
          if (showOpenOnly && status !== "open") return [];

          const liftClass = getLiftClass(lift);
          if (zoom < LIFT_LABEL_MIN_ZOOM_BY_CLASS[liftClass]) return [];

          return [
            {
              kind: "lift",
              sourceIds: [lift.id],
              primaryId: lift.id,
              name: lift.name,
              status,
              weight: LIFT_CLASS_LABEL_WEIGHT[liftClass],
              // 表示用の座標は下→上なので、名前は山頂側から始まるよう反転する
              points: project(
                getLiftDisplayCoordinates(lift) as number[][],
              ).reverse(),
              isSelected: false,
              isMuted: false,
            },
          ];
        });

        placements.push(
          ...placeLabelCandidates(
            collectLabelCandidates({
              sources: liftSources,
              zoom,
              twoLabelMinLength: LINE_LABEL_TWO_LABEL_MIN_LENGTH_PX,
              measureWidth,
            }),
            placedRects,
            padding,
          ),
        );
      }

      if (zoom >= COURSE_LABEL_MIN_ZOOM) {
        const groups = new Map<
          string,
          {
            name: string;
            statuses: FinalizedFeatureStatus[];
            lines: FinalizedCourseFeature[];
          }
        >();
        for (const course of courses) {
          const name = getCourseLabelName(course.displayName);
          if (shouldSkipCourseLabel(name)) continue;

          const group = groups.get(name) ?? { name, statuses: [], lines: [] };
          group.statuses.push(getFeatureStatusKind(course.properties.status));
          group.lines.push(course);
          groups.set(name, group);
        }

        const courseSources = [...groups.values()].flatMap<LabelSource>(
          group => {
            const status = group.statuses.includes("open")
              ? "open"
              : (group.statuses[0] ?? "unknown");
            if (showOpenOnly && status !== "open") return [];

            // 同名のコースが複数線に分かれている場合はもっとも長い線に名前を置く
            const longest = group.lines
              .map(course => {
                const points = project(course.coordinates as number[][]);
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
                sourceIds: [longest.course.groupId],
                primaryId: longest.course.groupId,
                name: group.name,
                status,
                weight: 1,
                points: longest.points,
                isSelected: false,
                isMuted: false,
              },
            ];
          },
        );

        placements.push(
          ...placeLabelCandidates(
            collectLabelCandidates({
              sources: courseSources,
              zoom,
              twoLabelMinLength: LINE_LABEL_TWO_LABEL_MIN_LENGTH_PX,
              measureWidth,
            }),
            placedRects,
            padding,
          ),
        );
      }

      for (const placement of placements) {
        const lngLat = map.unproject([placement.x, placement.y]);
        const element = createLabelElement(placement, onSelectFeature);
        const marker = new Marker({
          element,
          anchor: "center",
          rotationAlignment: "map",
          pitchAlignment: "map",
          // MapLibre は map 合わせのとき rotation から bearing を引いて描くので、
          // 画面上で出したい角度に bearing を足して地図基準の角度に直す
          rotation: placement.angle + bearing,
        })
          .setLngLat(lngLat)
          .addTo(map);
        markersRef.current.push({ marker, element });
      }
    };

    render();
    map.on("moveend", render);
    map.on("zoomend", render);
    return () => {
      map.off("moveend", render);
      map.off("zoomend", render);
      clearMarkers();
    };
  }, [
    courses,
    isReady,
    lifts,
    map,
    onSelectFeature,
    selectedFeature,
    showOpenOnly,
  ]);
};
