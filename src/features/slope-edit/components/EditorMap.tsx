"use client";

import { Box, Button, Flex, Text } from "@chakra-ui/react";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  GOOGLE_TILE_LAYERS,
  TILE_LAYER_ORDER,
  TILE_LAYERS,
} from "../constants";
import type { LngLat, TileLayerId } from "../types";

export type EditorMapMode = "view" | "draw" | "edit" | "split" | "midstation";

// 地図編集に必要な最小限の形。EditorCourse / EditorLift のどちらも満たす
export type EditorMapLine = {
  id: string;
  name: string;
  coordinates: LngLat[];
};

type EditorMapProps = {
  center: LngLat;
  zoom: number;
  courses: EditorMapLine[];
  // 参照用に薄く表示する編集対象外の線（編集前の位置など）
  backgroundLines?: EditorMapLine[];
  activeCourseId: string | null;
  mode: EditorMapMode;
  googleMapsApiKey: string | null;
  // 値が変わるたびに全コースへ fitBounds する
  fitBoundsKey?: number;
  onSelectCourse?: (courseId: string) => void;
  onAppendVertex?: (lngLat: LngLat) => void;
  onMoveVertex?: (index: number, lngLat: LngLat) => void;
  onInsertVertex?: (index: number, lngLat: LngLat) => void;
  onDeleteVertex?: (index: number) => void;
  onFinishDraw?: () => void;
  onSplitVertex?: (index: number) => void;
  // アクティブな線の中間駅（リフト用）。mode "midstation" で地図クリック配置
  midstation?: LngLat | null;
  onPlaceMidstation?: (lngLat: LngLat) => void;
  onMoveMidstation?: (lngLat: LngLat) => void;
  // タイルレイヤーを親で管理する場合に指定（未指定なら内部 state で管理）
  layerId?: TileLayerId;
  onLayerIdChange?: (layerId: TileLayerId) => void;
  // 非表示のまま地図を保持し、再表示時にサイズだけ再計算する
  visible?: boolean;
};

const toLatLng = (coordinate: LngLat): L.LatLngTuple => [
  coordinate[1],
  coordinate[0],
];

const createDotIcon = (
  size: number,
  background: string,
  opacity: number,
): L.DivIcon =>
  L.divIcon({
    className: "",
    html: `<div style="width:100%;height:100%;border-radius:50%;background:${background};border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,0.5);opacity:${opacity};"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const VERTEX_ICON = createDotIcon(14, "#e53e3e", 1);
const LAST_VERTEX_ICON = createDotIcon(16, "#dd6b20", 1);
const MIDPOINT_ICON = createDotIcon(10, "#3182ce", 0.7);
const SPLIT_VERTEX_ICON = createDotIcon(16, "#805ad5", 1);
const MIDSTATION_ICON = createDotIcon(18, "#2f855a", 1);

function MapClickHandler({ onClick }: { onClick?: (lngLat: LngLat) => void }) {
  useMapEvents({
    click: event => {
      onClick?.([event.latlng.lng, event.latlng.lat]);
    },
  });
  return null;
}

function ViewController({ center, zoom }: { center: LngLat; zoom: number }) {
  const map = useMap();
  // biome-ignore lint/correctness/useExhaustiveDependencies: center の変更時のみ視点を移動する
  useEffect(() => {
    map.setView(toLatLng(center), zoom);
  }, [center[0], center[1], map]);
  return null;
}

function VisibilityController({ visible }: { visible: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!visible) return;
    map.invalidateSize({ pan: false });
  }, [map, visible]);
  return null;
}

function FitBoundsController({
  courses,
  fitBoundsKey,
}: {
  courses: EditorMapLine[];
  fitBoundsKey: number;
}) {
  const map = useMap();
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitBoundsKey の変更時のみ全体表示する
  useEffect(() => {
    if (fitBoundsKey === 0) return;
    const points = courses.flatMap(course => course.coordinates.map(toLatLng));
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [fitBoundsKey, map]);
  return null;
}

// Google Map Tiles API のセッションを作成してタイル URL を得る
const useGoogleTileUrl = (
  apiKey: string | null,
  layerId: TileLayerId,
): string | null | undefined => {
  const [urls, setUrls] = useState<Partial<Record<TileLayerId, string | null>>>(
    {},
  );
  const isGoogleLayer =
    layerId === "googleSatellite" || layerId === "googleHybrid";

  useEffect(() => {
    if (!apiKey || !isGoogleLayer || urls[layerId] !== undefined) return;
    const googleLayer =
      GOOGLE_TILE_LAYERS[layerId as "googleSatellite" | "googleHybrid"];
    let cancelled = false;

    fetch(`https://tile.googleapis.com/v1/createSession?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapType: googleLayer.mapType,
        language: "ja-JP",
        region: "JP",
        ...(googleLayer.layerTypes
          ? { layerTypes: googleLayer.layerTypes }
          : {}),
      }),
    })
      .then(response =>
        response.ok
          ? response.json()
          : Promise.reject(new Error(`HTTP ${response.status}`)),
      )
      .then((data: { session?: string }) => {
        if (cancelled) return;
        setUrls(previous => ({
          ...previous,
          [layerId]: data.session
            ? `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${data.session}&key=${apiKey}`
            : null,
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setUrls(previous => ({ ...previous, [layerId]: null }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, isGoogleLayer, layerId, urls]);

  if (!isGoogleLayer) return undefined;
  return urls[layerId];
};

export function EditorMap({
  center,
  zoom,
  courses,
  backgroundLines = [],
  activeCourseId,
  mode,
  googleMapsApiKey,
  fitBoundsKey = 0,
  onSelectCourse,
  onAppendVertex,
  onMoveVertex,
  onInsertVertex,
  onDeleteVertex,
  onFinishDraw,
  onSplitVertex,
  midstation = null,
  onPlaceMidstation,
  onMoveMidstation,
  layerId: controlledLayerId,
  onLayerIdChange,
  visible = true,
}: EditorMapProps) {
  const [internalLayerId, setInternalLayerId] =
    useState<TileLayerId>("gsiPale");
  const layerId = controlledLayerId ?? internalLayerId;
  const setLayerId = (id: TileLayerId) => {
    onLayerIdChange?.(id);
    if (controlledLayerId === undefined) setInternalLayerId(id);
  };
  const googleTileUrl = useGoogleTileUrl(googleMapsApiKey, layerId);

  const activeCourse =
    courses.find(course => course.id === activeCourseId) ?? null;

  const isGoogleLayer =
    layerId === "googleSatellite" || layerId === "googleHybrid";
  const googleUnavailable = isGoogleLayer && googleTileUrl === null;

  // Google タイルが未取得・取得失敗の間は地理院地図で代替する
  const baseLayer = useMemo(() => {
    if (isGoogleLayer && typeof googleTileUrl === "string") {
      return {
        key: layerId,
        url: googleTileUrl,
        attribution: "&copy; Google",
        maxZoom: 21,
      };
    }
    const fallbackId = isGoogleLayer ? "gsiPale" : layerId;
    const layer = TILE_LAYERS[fallbackId as keyof typeof TILE_LAYERS];
    return {
      key: isGoogleLayer ? `${layerId}-fallback` : layerId,
      url: layer.url,
      attribution: layer.attribution,
      maxZoom: layer.maxZoom,
    };
  }, [isGoogleLayer, googleTileUrl, layerId]);

  const midpoints = useMemo(() => {
    if (!activeCourse || mode !== "edit") return [];
    return activeCourse.coordinates.slice(0, -1).map((coordinate, index) => {
      const next = activeCourse.coordinates[index + 1];
      return {
        insertIndex: index + 1,
        lngLat: [
          (coordinate[0] + next[0]) / 2,
          (coordinate[1] + next[1]) / 2,
        ] as LngLat,
      };
    });
  }, [activeCourse, mode]);

  const showVertices =
    activeCourse !== null &&
    (mode === "draw" || mode === "edit" || mode === "split");

  return (
    <Box position="relative" h="100%" w="100%">
      <MapContainer
        center={toLatLng(center)}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        doubleClickZoom={false}
      >
        <TileLayer
          key={baseLayer.key}
          url={baseLayer.url}
          attribution={baseLayer.attribution}
          maxZoom={baseLayer.maxZoom}
        />
        <ViewController center={center} zoom={zoom} />
        <VisibilityController visible={visible} />
        <FitBoundsController courses={courses} fitBoundsKey={fitBoundsKey} />
        {mode === "draw" && <MapClickHandler onClick={onAppendVertex} />}
        {mode === "midstation" && (
          <MapClickHandler onClick={onPlaceMidstation} />
        )}

        {backgroundLines.map(line => {
          if (line.coordinates.length < 2) return null;
          return (
            <Polyline
              key={`background-${line.id}`}
              positions={line.coordinates.map(toLatLng)}
              pathOptions={{
                color: "#4a5568",
                weight: 3,
                opacity: 0.55,
                dashArray: "6 6",
                interactive: false,
              }}
            />
          );
        })}

        {courses.map(course => {
          if (course.coordinates.length < 2) return null;
          const isActive = course.id === activeCourseId;
          return (
            <Polyline
              key={course.id}
              positions={course.coordinates.map(toLatLng)}
              pathOptions={{
                color: isActive ? "#e53e3e" : "#3182ce",
                weight: isActive ? 5 : 3,
                opacity: isActive ? 0.95 : 0.7,
              }}
              eventHandlers={{
                click: () => onSelectCourse?.(course.id),
              }}
            >
              <Tooltip sticky>{course.name || "（名前未入力）"}</Tooltip>
            </Polyline>
          );
        })}

        {showVertices &&
          activeCourse.coordinates.map((coordinate, index) => {
            const isLast = index === activeCourse.coordinates.length - 1;
            const isInner =
              index > 0 && index < activeCourse.coordinates.length - 1;
            const icon =
              mode === "split"
                ? SPLIT_VERTEX_ICON
                : mode === "draw" && isLast
                  ? LAST_VERTEX_ICON
                  : VERTEX_ICON;
            if (mode === "split" && !isInner) return null;
            return (
              <Marker
                // biome-ignore lint/suspicious/noArrayIndexKey: 頂点は順序が本体で一意 ID を持たない
                key={`vertex-${activeCourse.id}-${index}`}
                position={toLatLng(coordinate)}
                icon={icon}
                draggable={mode === "edit" || mode === "draw"}
                eventHandlers={{
                  drag: event => {
                    const latLng = (event.target as L.Marker).getLatLng();
                    onMoveVertex?.(index, [latLng.lng, latLng.lat]);
                  },
                  click: () => {
                    if (mode === "split") {
                      onSplitVertex?.(index);
                    } else if (mode === "draw" && isLast) {
                      onFinishDraw?.();
                    }
                  },
                  contextmenu: () => {
                    if (mode === "edit" || mode === "draw") {
                      onDeleteVertex?.(index);
                    }
                  },
                }}
              />
            );
          })}

        {midpoints.map(midpoint => (
          <Marker
            key={`midpoint-${activeCourse?.id}-${midpoint.insertIndex}-${midpoint.lngLat[0]}-${midpoint.lngLat[1]}`}
            position={toLatLng(midpoint.lngLat)}
            icon={MIDPOINT_ICON}
            eventHandlers={{
              click: () =>
                onInsertVertex?.(midpoint.insertIndex, midpoint.lngLat),
            }}
          />
        ))}

        {activeCourse && midstation && (
          <Marker
            position={toLatLng(midstation)}
            icon={MIDSTATION_ICON}
            draggable={mode === "edit" || mode === "midstation"}
            eventHandlers={{
              drag: event => {
                const latLng = (event.target as L.Marker).getLatLng();
                onMoveMidstation?.([latLng.lng, latLng.lat]);
              },
            }}
          >
            <Tooltip>中間駅</Tooltip>
          </Marker>
        )}
      </MapContainer>

      <Flex
        position="absolute"
        top="10px"
        right="10px"
        zIndex={1000}
        direction="column"
        gap="4px"
        bg="whiteAlpha.900"
        borderRadius="md"
        boxShadow="md"
        p="6px"
      >
        {TILE_LAYER_ORDER.map(id => {
          const isGoogle = id === "googleSatellite" || id === "googleHybrid";
          const label = isGoogle
            ? GOOGLE_TILE_LAYERS[id as "googleSatellite" | "googleHybrid"].label
            : TILE_LAYERS[id as keyof typeof TILE_LAYERS].label;
          const disabled = isGoogle && !googleMapsApiKey;
          return (
            <Button
              key={id}
              size="xs"
              variant={layerId === id ? "solid" : "outline"}
              colorPalette="blue"
              disabled={disabled}
              title={
                disabled
                  ? "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY が未設定のため利用できません"
                  : undefined
              }
              onClick={() => setLayerId(id)}
            >
              {label}
            </Button>
          );
        })}
        {googleUnavailable && (
          <Text fontSize="10px" color="red.500" maxW="140px">
            Google タイルを取得できませんでした。地理院地図で表示しています。
          </Text>
        )}
      </Flex>
    </Box>
  );
}
