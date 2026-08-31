"use client";

import type { MapLayerMouseEvent } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  DESKTOP_INITIAL_ZOOM,
  DESKTOP_LABEL_ADVANCED_LAYOUT_ZOOM,
  RESORT_PICKER_LABEL_SHOW_ZOOM,
} from "./constants";
import { useJapanMapLabelLayout } from "./hooks/useJapanMapLabelLayout";
import { getRasterTone } from "./maplibre/baseStyle";
import { MapLibreControls } from "./maplibre/MapLibreControls";
import { RESORT_POINT_LAYER } from "./maplibre/resortPointLayers";
import { useMapLibreMap } from "./maplibre/useMapLibreMap";
import { useResortMarkers } from "./maplibre/useResortMarkers";
import type { MapProjection } from "./types";

/** 管理画面のスキー場選択で点を塗り分ける色。既存データの有無を表す */
export const RESORT_PICKER_POINT_COLOR = {
  hasData: "#3182CE",
  empty: "#718096",
} as const;

/**
 * 点の色の凡例。
 * 塗り＝入力済みか、リング＝選択中か、と軸が分かれているので一言で示す。
 */
export const ResortPickerLegend = () => (
  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
    {(
      [
        ["既存データあり", RESORT_PICKER_POINT_COLOR.hasData],
        ["未作成", RESORT_PICKER_POINT_COLOR.empty],
      ] as const
    ).map(([label, color]) => (
      <span key={label} className="inline-flex items-center gap-1">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full border border-white ring-1 ring-gray-400"
          style={{ background: color }}
        />
        {label}
      </span>
    ))}
    <span>太いリング = 選択中</span>
  </p>
);

export type ResortPickerResort = {
  id: string;
  /** ラベルに出す名前。DB に無い仮 ID ではその ID */
  labelName: string;
  latitude: number;
  longitude: number;
  /** ラベルの置き場所を取る優先度 */
  numberOfCourses: number;
  /** slope_before / lift_before が既にあるか。点の塗り色に使う */
  hasExistingData: boolean;
};

type Props = {
  resorts: ResortPickerResort[];
  selectedResortId: string | null;
  onSelectResort: (id: string) => void;
  /** 左のリストで絞り込んだ結果。渡すと一致しないスキー場を沈める */
  filteredResortIdSet?: Set<string>;
  isFilterActive?: boolean;
};

// 省略名はサーバ側（labelName）で解決済みなので、別名表は引かない
const NO_DISPLAY_NAME_OVERRIDE = new Map<string, string>();

/** 選んだスキー場へ寄せるときの、最低限の寄り具合 */
const SELECTED_MIN_ZOOM = 8;

/**
 * 管理画面（コース入力・リフト入力）のスキー場選択地図。
 *
 * 一覧地図と同じ見せ方——点はレイヤー、名前は DOM のラベルで衝突を避けて置く——
 * にそろえる。数百個の点から目的のスキー場を名前で探せるようにするのが目的。
 *
 * 一覧地図と違って色の軸が 3 つある。塗りは「入力済みか」、リングは「選択中か」、
 * 沈み込みは「検索に一致したか」。1 つの色に混ぜると入力済みかどうかが読めなくなる。
 */
export function ResortPickerMap({
  resorts,
  selectedResortId,
  onSelectResort,
  filteredResortIdSet,
  isFilterActive = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { map, isReady } = useMapLibreMap({
    containerRef,
    initialZoom: DESKTOP_INITIAL_ZOOM,
    tileVariant: "pale",
    initialTone: getRasterTone({
      variant: "pale",
      isDetailView: false,
      courseColorMode: "difficulty",
      hasCourses: false,
    }),
    hitWidth: 14,
    isInteractive: true,
  });

  // ラベル配置と点の描画には「名前と座標と優先度」だけを渡す。
  // 名前は labelName（省略名・仮 ID は ID そのもの）に寄せてある。
  const markerResorts = useMemo(
    () =>
      resorts.map(resort => ({
        id: resort.id,
        nameJa: resort.labelName,
        latitude: resort.latitude,
        longitude: resort.longitude,
        numberOfCourses: resort.numberOfCourses,
      })),
    [resorts],
  );

  const { labelLayouts, mapZoom, updateLabelLayout } = useJapanMapLabelLayout({
    resorts: markerResorts,
    displayNameById: NO_DISPLAY_NAME_OVERRIDE,
    filteredResortIdSet,
    hoveredResortId: null,
    hideLabelsMinZoom: null,
    interactionMode: "default",
    isFilterActive,
    isMobileMapZoom: false,
    labelAdvancedLayoutZoom: DESKTOP_LABEL_ADVANCED_LAYOUT_ZOOM,
    labelShowZoom: RESORT_PICKER_LABEL_SHOW_ZOOM,
    selectedResortId,
  });

  // ラベルの置き場所は画面座標で決まるので、動かすたびに計算し直す
  useEffect(() => {
    if (!map || !isReady) return;

    const projection: MapProjection = {
      getZoom: () => map.getZoom(),
      getSize: () => {
        const container = map.getContainer();
        return { x: container.clientWidth, y: container.clientHeight };
      },
      project: (latitude, longitude) => {
        const point = map.project([longitude, latitude]);
        return { x: point.x, y: point.y };
      },
      unproject: (x, y) => {
        const lngLat = map.unproject([x, y]);
        return { lat: lngLat.lat, lng: lngLat.lng };
      },
    };
    const layout = () => updateLabelLayout(projection);

    layout();
    map.on("moveend", layout);
    map.on("resize", layout);
    return () => {
      map.off("moveend", layout);
      map.off("resize", layout);
    };
  }, [isReady, map, updateLabelLayout]);

  const selectedResortIdSet = useMemo(
    () => (selectedResortId ? new Set([selectedResortId]) : new Set<string>()),
    [selectedResortId],
  );

  const pointColorById = useMemo(
    () =>
      new Map(
        resorts.map(resort => [
          resort.id,
          resort.hasExistingData
            ? RESORT_PICKER_POINT_COLOR.hasData
            : RESORT_PICKER_POINT_COLOR.empty,
        ]),
      ),
    [resorts],
  );

  const markerState = useMemo(
    () => ({
      resorts: markerResorts,
      labelLayouts,
      displayNameById: NO_DISPLAY_NAME_OVERRIDE,
      selectedResortIdSet,
      filteredResortIdSet,
      isFilterActive,
      tileVariant: "pale" as const,
      interactionMode: "default" as const,
      mapZoom,
      labelShowZoom: RESORT_PICKER_LABEL_SHOW_ZOOM,
      shouldHideLabels: false,
      pointColorById,
      // 名前が出ていない点も選べないと、密集した地域が選択できなくなる
      alwaysInteractive: true,
      onSelectResort,
    }),
    [
      filteredResortIdSet,
      isFilterActive,
      labelLayouts,
      mapZoom,
      markerResorts,
      onSelectResort,
      pointColorById,
      selectedResortIdSet,
    ],
  );

  useResortMarkers({ map, isReady, state: markerState });

  // 点のタップ。ラベルのタップは useResortMarkers 側が拾う
  useEffect(() => {
    if (!map || !isReady) return;

    const layer = RESORT_POINT_LAYER.hit;
    const handleClick = (event: MapLayerMouseEvent) => {
      const resortId = event.features?.[0]?.properties?.resortId;
      if (typeof resortId === "string") onSelectResort(resortId);
    };
    const setPointer = (cursor: string) => () => {
      map.getCanvas().style.cursor = cursor;
    };
    const showPointer = setPointer("pointer");
    const hidePointer = setPointer("");

    map.on("click", layer, handleClick);
    map.on("mouseenter", layer, showPointer);
    map.on("mouseleave", layer, hidePointer);
    return () => {
      map.off("click", layer, handleClick);
      map.off("mouseenter", layer, showPointer);
      map.off("mouseleave", layer, hidePointer);
    };
  }, [isReady, map, onSelectResort]);

  // 選んだスキー場が画面の外にいるときだけ寄せる。
  // 常に寄せると、地図を眺めながら点をタップしたときに足元が動いてしまう。
  const selected = resorts.find(resort => resort.id === selectedResortId);
  const selectedLng = selected?.longitude;
  const selectedLat = selected?.latitude;
  useEffect(() => {
    if (!map || !isReady) return;
    if (selectedLng === undefined || selectedLat === undefined) return;
    if (map.getBounds().contains([selectedLng, selectedLat])) return;

    map.easeTo({
      center: [selectedLng, selectedLat],
      zoom: Math.max(map.getZoom(), SELECTED_MIN_ZOOM),
      duration: 600,
    });
  }, [isReady, map, selectedLat, selectedLng]);

  return (
    // isolate で重なりの文脈を閉じる。中の地図コントロールは z-[750] を持つので、
    // 閉じておかないとダイアログ（z-50）より前に出てしまう
    <div
      className="relative isolate h-full w-full"
      data-map-tile-variant="pale"
    >
      <div ref={containerRef} className="h-full w-full" />
      <MapLibreControls
        map={map}
        initialZoom={DESKTOP_INITIAL_ZOOM}
        // タイルは地理院地図で固定。切替 UI は出さないので値は使われない
        mapTileVariant="pale"
        onMapTileVariantChange={() => undefined}
        showTileVariantControl={false}
        showHomeButton
        canRotate={false}
      />
    </div>
  );
}
