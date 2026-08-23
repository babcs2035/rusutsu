import type L from "leaflet";
import type { MapProjection } from "../types";

/**
 * Leaflet の地図を MapProjection として扱うための橋渡し。
 * MapLibre への移行が終わったら不要になる。
 */
export const createLeafletProjection = (map: L.Map): MapProjection => ({
  getZoom: () => map.getZoom(),
  getSize: () => {
    const size = map.getSize();
    return { x: size.x, y: size.y };
  },
  project: (latitude, longitude) => {
    const point = map.latLngToContainerPoint([latitude, longitude]);
    return { x: point.x, y: point.y };
  },
  unproject: (x, y) => {
    const latLng = map.containerPointToLatLng([x, y]);
    return { lat: latLng.lat, lng: latLng.lng };
  },
});
