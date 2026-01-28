"use client";

import { Box, Button, Flex } from "@chakra-ui/react";
import L from "leaflet";
import { Home } from "lucide-react";
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-markercluster";
import type { SkiResortT } from "@/types";

const INITIAL_CENTER: L.LatLngTuple = [38.25, 139.0];
const INITIAL_ZOOM = 6;

/**
 * 地図の表示領域変更を親コンポーネントに通知するための内部コンポーネント
 */
const MapEventsHandler = ({
  onBoundsChange,
}: {
  onBoundsChange: (bounds: L.LatLngBounds) => void;
}) => {
  const map = useMap();

  // マップの移動またはズームが完了した時にイベントを発火
  useMapEvents({
    zoomend: () => onBoundsChange(map.getBounds()),
    moveend: () => onBoundsChange(map.getBounds()),
  });

  // 初期ロード時に一度だけ表示領域を通知
  useEffect(() => {
    onBoundsChange(map.getBounds());
  }, [map, onBoundsChange]);

  return null;
};

// カスタムマーカーアイコン
const createCustomIcon = () => {
  const snowflakeSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 24px; height: 24px; color: white;">
      <path fill-rule="evenodd" d="M10.5 1.512a1.5 1.5 0 013 0L15 2.549a1.5 1.5 0 012.121.707l1.038 1.798a1.5 1.5 0 010 1.5l-1.037 1.798a1.5 1.5 0 01-2.121.707L13.5 10.151a1.5 1.5 0 010-3l-1.5-2.598a1.5 1.5 0 010-3L10.5 1.512zM10.5 13.849L9 11.251a1.5 1.5 0 010-1.5l1.038-1.798a1.5 1.5 0 012.12-.707L13.5 8.349a1.5 1.5 0 013 0L18.349 9a1.5 1.5 0 012.121.707l1.037 1.798a1.5 1.5 0 010 1.5l-1.037 1.798a1.5 1.5 0 01-2.121.707L16.5 13.849a1.5 1.5 0 01-3 0l-1.5-2.598a1.5 1.5 0 01-1.5-2.598zM9 12.75a1.5 1.5 0 01-1.5-2.598L6.463 8.35a1.5 1.5 0 010-1.5L7.5 5.052a1.5 1.5 0 012.121-.707L10.658 6a1.5 1.5 0 010 3l-1.5 2.598a1.5 1.5 0 010 3l.004-.007a1.5 1.5 0 01-2.121-.707L6 14.052a1.5 1.5 0 01-1.5-2.598L5.538 9.65a1.5 1.5 0 010-1.5l.23-.398a1.5 1.5 0 012.121-.707L9 8.349v4.401z" clip-rule="evenodd" />
    </svg>
  `;
  return L.divIcon({
    html: `<div style="background-color: #0ea5e9; border-radius: 9999px; padding: 4px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">${snowflakeSvg}</div>`,
    className: "bg-transparent border-none",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

// マップ操作ボタン
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
        bg="rgba(30, 41, 59, 0.8)"
        boxShadow="lg"
        backdropFilter="blur(4px)"
        overflow="hidden"
      >
        <Button
          onClick={() => map.zoomIn()}
          p={2}
          color="white"
          bg="transparent"
          _hover={{ bg: "rgba(51, 65, 85, 0.9)" }}
          borderRadius="0"
          borderTopRadius="lg"
          fontSize="xl"
          fontWeight="bold"
          minW="auto"
          h="auto"
        >
          +
        </Button>
        <Box h="1px" w="100%" bg="rgba(255, 255, 255, 0.1)" />
        <Button
          onClick={() => map.zoomOut()}
          p={2}
          color="white"
          bg="transparent"
          _hover={{ bg: "rgba(51, 65, 85, 0.9)" }}
          borderRadius="0"
          borderBottomRadius="lg"
          fontSize="xl"
          fontWeight="bold"
          minW="auto"
          h="auto"
        >
          -
        </Button>
      </Flex>
      <Button
        onClick={() => map.setView(INITIAL_CENTER, INITIAL_ZOOM)}
        borderRadius="lg"
        bg="rgba(30, 41, 59, 0.8)"
        p={2}
        color="white"
        boxShadow="lg"
        backdropFilter="blur(4px)"
        _hover={{ bg: "rgba(51, 65, 85, 0.9)" }}
        minW="auto"
        h="auto"
      >
        <Home size={16} />
      </Button>
    </Flex>
  );
};

type Props = {
  resorts: SkiResortT[];
  onSelectResort: (id: string) => void;
  onBoundsChange: (bounds: L.LatLngBounds) => void;
};

export const SkiResortMap = ({
  resorts,
  onSelectResort,
  onBoundsChange,
}: Props) => {
  const customIcon = useMemo(() => createCustomIcon(), []);
  const clusterKey = useMemo(() => resorts.map(r => r.id).join(","), [resorts]);

  return (
    <MapContainer
      center={INITIAL_CENTER}
      zoom={INITIAL_ZOOM}
      zoomControl={false}
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <MarkerClusterGroup key={clusterKey}>
        {resorts.map(resort => (
          <Marker
            key={resort.id}
            position={[resort.location.latitude, resort.location.longitude]}
            icon={customIcon}
            eventHandlers={{ click: () => onSelectResort(resort.id) }}
          >
            <Popup>{resort.name.ja}</Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
      <MapControls />
      <MapEventsHandler onBoundsChange={onBoundsChange} />
    </MapContainer>
  );
};
