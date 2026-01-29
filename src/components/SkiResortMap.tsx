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

const INITIAL_CENTER: L.LatLngTuple = [38.25, 139.0];
const INITIAL_ZOOM = 6;

// コンパクトな地図表示用リゾート型
type MapResort = {
  id: string;
  nameJa: string;
  latitude: number;
  longitude: number;
  yukiMagiId: string | null;
};

/**
 * 地図の表示領域変更を親コンポーネントに通知するための内部コンポーネント
 */
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

// カスタムマーカーアイコン
const createCustomIcon = (yukiMagiAvailable: boolean) => {
  const color = yukiMagiAvailable ? "#db2777" : "#0284c7";
  const iconHtml = `
    <div style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3)); cursor: pointer;">
      <svg width="36" height="42" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Pin Shape -->
        <path d="M12 28C12 28 22 18 22 11C22 5.47715 17.5228 1 12 1C6.47715 1 2 5.47715 2 11C2 18 12 28 12 28Z" fill="${color}" stroke="white" stroke-width="1.5"/>
        <!-- Mountain Icon -->
        <g transform="translate(5, 5) scale(0.6)">
          <path d="M12 2L2 19H22L12 2Z" fill="white"/>
          <!-- Snow Cap effect -->
          <path d="M12 2L8.5 8L10 9.5L12 7.5L14 9.5L15.5 8L12 2Z" fill="${color}"/>
        </g>
      </svg>
    </div>
  `;
  return L.divIcon({
    html: iconHtml,
    className: "bg-transparent border-none",
    iconSize: [36, 42],
    iconAnchor: [18, 42],
    popupAnchor: [0, -40],
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
  resorts: MapResort[];
  onSelectResort: (id: string) => void;
  onBoundsChange: (bounds: L.LatLngBounds) => void;
};

export const SkiResortMap = ({
  resorts,
  onSelectResort,
  onBoundsChange,
}: Props) => {
  const clusterKey = useMemo(() => resorts.map(r => r.id).join(","), [resorts]);

  const blueIcon = useMemo(() => createCustomIcon(false), []);
  const pinkIcon = useMemo(() => createCustomIcon(true), []);

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
            position={[resort.latitude, resort.longitude]}
            icon={resort.yukiMagiId ? pinkIcon : blueIcon}
            eventHandlers={{ click: () => onSelectResort(resort.id) }}
          >
            <Popup>
              <Box fontWeight="bold">{resort.nameJa}</Box>
              {resort.yukiMagiId && (
                <Box color="pink.600" fontSize="xs" mt={1}>
                  ✨ 雪マジ！対象校
                </Box>
              )}
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
      <MapControls />
      <MapEventsHandler onBoundsChange={onBoundsChange} />
    </MapContainer>
  );
};
