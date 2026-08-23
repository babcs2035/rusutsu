"use client";

import { type Map as MapLibreMap, Marker } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { createConnectedCourseElevationProfile } from "@/features/resort-detail/utils/detailMetrics";
import type { FinalizedCourseFeature } from "@/lib/finalizedResortGeojsonShared";
import type { ElevationProfileMapPoint } from "../types";

type NearestPoint = {
  coordinate: [number, number, number];
  distance: number;
  elevation: number;
  slope: number | null;
  /** 線が画面上で下向きか上向きか。吹き出しを線とは反対側に置くのに使う */
  segmentDy: number;
};

const createMarkerElement = () => {
  const element = document.createElement("div");
  element.className = "course-profile-marker";
  element.dataset.placement = "top";

  const ring = document.createElement("div");
  ring.className = "course-profile-marker-ring";
  element.append(ring);

  const label = document.createElement("div");
  label.className = "course-profile-label";
  element.append(label);

  return { element, label };
};

/**
 * 断面図と連動する地図上の点。
 *
 * 掴んで動かすとコースの線の上を滑る。線からいちばん近い位置を
 * 画面座標で探すので、ズームしていても手元の感覚と合う。
 */
export const useElevationProfileMarker = ({
  map,
  isReady,
  point,
  selectedCourses,
  onPointChange,
}: {
  map: MapLibreMap | null;
  isReady: boolean;
  point: ElevationProfileMapPoint | null;
  selectedCourses: FinalizedCourseFeature[];
  onPointChange?: (point: ElevationProfileMapPoint | null) => void;
}) => {
  const markerRef = useRef<{ marker: Marker; label: HTMLDivElement } | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);

  const profilePoints = useRef(selectedCourses);
  profilePoints.current = selectedCourses;

  const getNearestPoint = useCallback(
    (lngLat: { lng: number; lat: number }): NearestPoint | null => {
      if (!map) return null;

      const points = createConnectedCourseElevationProfile(
        profilePoints.current,
      );
      const first = points[0];
      if (!first) return null;
      if (points.length === 1) {
        return {
          coordinate: [
            first.coordinate[0],
            first.coordinate[1],
            first.elevation,
          ],
          distance: first.distance,
          elevation: first.elevation,
          slope: first.slope,
          segmentDy: 0,
        };
      }

      const dragged = map.project([lngLat.lng, lngLat.lat]);
      let nearest: (NearestPoint & { screenDistance: number }) | null = null;

      for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1];
        const end = points[index];
        if (!start || !end) continue;

        const startPoint = map.project([
          start.coordinate[0],
          start.coordinate[1],
        ]);
        const endPoint = map.project([end.coordinate[0], end.coordinate[1]]);
        const segmentX = endPoint.x - startPoint.x;
        const segmentY = endPoint.y - startPoint.y;
        const lengthSquared = segmentX ** 2 + segmentY ** 2;
        const rawT =
          lengthSquared === 0
            ? 0
            : ((dragged.x - startPoint.x) * segmentX +
                (dragged.y - startPoint.y) * segmentY) /
              lengthSquared;
        const t = Math.min(1, Math.max(0, rawT));
        const projectedX = startPoint.x + segmentX * t;
        const projectedY = startPoint.y + segmentY * t;
        const screenDistance = Math.hypot(
          projectedX - dragged.x,
          projectedY - dragged.y,
        );
        if (nearest !== null && screenDistance >= nearest.screenDistance) {
          continue;
        }

        const projected = map.unproject([projectedX, projectedY]);
        const elevation =
          start.elevation + (end.elevation - start.elevation) * t;
        nearest = {
          coordinate: [projected.lng, projected.lat, elevation],
          distance: start.distance + (end.distance - start.distance) * t,
          elevation,
          slope: t < 0.5 ? start.slope : end.slope,
          segmentDy: segmentY,
          screenDistance,
        };
      }

      return nearest;
    },
    [map],
  );

  // 位置と吹き出しの中身を更新する。要素は作り直さない（掴んでいる最中に
  // 差し替わると、そこで操作が切れてしまうため）
  useEffect(() => {
    if (!map || !isReady) return;
    if (!point) {
      markerRef.current?.marker.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const { element, label } = createMarkerElement();
      element.addEventListener("mousedown", event => {
        event.stopPropagation();
        event.preventDefault();
        setIsDragging(true);
      });
      const marker = new Marker({ element, anchor: "center" })
        .setLngLat([point.coordinate[0], point.coordinate[1]])
        .addTo(map);
      markerRef.current = { marker, label };
    }

    const { marker, label } = markerRef.current;
    marker.setLngLat([point.coordinate[0], point.coordinate[1]]);
    label.textContent = "";
    const slopeText = document.createElement("span");
    slopeText.textContent =
      point.slope == null ? "--" : `${Math.round(point.slope)}°`;
    const elevationText = document.createElement("span");
    elevationText.textContent = `${Math.round(point.elevation).toLocaleString()}m`;
    label.append(slopeText, elevationText);

    const nearest = getNearestPoint({
      lng: point.coordinate[0],
      lat: point.coordinate[1],
    });
    marker.getElement().dataset.placement =
      nearest && nearest.segmentDy < 0 ? "bottom" : "top";
  }, [getNearestPoint, isReady, map, point]);

  useEffect(
    () => () => {
      markerRef.current?.marker.remove();
      markerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!map || !isDragging || !onPointChange || !point) return;

    map.dragPan.disable();
    const moveTo = (lngLat: { lng: number; lat: number }) => {
      const nearest = getNearestPoint(lngLat);
      if (!nearest) return;

      onPointChange({
        courseGroupId: point.courseGroupId,
        courseName: point.courseName,
        coordinate: nearest.coordinate,
        distance: nearest.distance,
        elevation: nearest.elevation,
        slope: nearest.slope,
      });
    };
    const handleMouseMove = (event: { lngLat: { lng: number; lat: number } }) =>
      moveTo(event.lngLat);
    const handleMouseUp = () => setIsDragging(false);

    map.on("mousemove", handleMouseMove);
    map.on("touchmove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchend", handleMouseUp);
    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("touchmove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchend", handleMouseUp);
      map.dragPan.enable();
    };
  }, [getNearestPoint, isDragging, map, onPointChange, point]);
};
