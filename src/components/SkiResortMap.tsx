"use client";

import { faHouse } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import L from "leaflet";
import { useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-markercluster";
import type { SkiResortT } from "@/types";

const INITIAL_CENTER: L.LatLngTuple = [38.25, 139.0];
const INITIAL_ZOOM = 6;

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
    <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-2">
      {/* ズームイン・アウトボタン */}
      <div className="flex flex-col rounded-lg bg-slate-800/80 shadow-lg backdrop-blur-sm">
        <button
          type="button"
          onClick={() => map.zoomIn()}
          className="p-2 text-white transition-colors hover:bg-slate-700/90 rounded-t-lg text-xl font-bold"
        >
          +
        </button>
        <div className="h-px w-full bg-white/10"></div>
        <button
          type="button"
          onClick={() => map.zoomOut()}
          className="p-2 text-white transition-colors hover:bg-slate-700/90 rounded-b-lg text-xl font-bold"
        >
          -
        </button>
      </div>
      {/* ホームボタン */}
      <button
        type="button"
        onClick={() => map.setView(INITIAL_CENTER, INITIAL_ZOOM)}
        className="rounded-lg bg-slate-800/80 p-2 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-700/90"
      >
        <FontAwesomeIcon icon={faHouse} />
      </button>
    </div>
  );
};

type Props = {
  resorts: SkiResortT[];
  onSelectResort: (id: string) => void;
};

// スキー場を地図上に表示するコンポーネント
export const SkiResortMap = ({ resorts, onSelectResort }: Props) => {
  // useMemoでアイコンの再生成を防ぐ
  const customIcon = useMemo(() => createCustomIcon(), []);

  return (
    <MapContainer
      center={INITIAL_CENTER}
      zoom={INITIAL_ZOOM}
      zoomControl={false}
      className="w-full h-full"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <MarkerClusterGroup>
        {resorts.map(resort => (
          <Marker
            key={resort.id}
            position={[resort.location.latitude, resort.location.longitude]}
            icon={customIcon}
            eventHandlers={{
              click: () => {
                onSelectResort(resort.id);
              },
            }}
          >
            <Popup>{resort.name.ja}</Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
      <MapControls />
    </MapContainer>
  );
};
