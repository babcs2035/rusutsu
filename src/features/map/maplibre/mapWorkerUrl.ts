import { version } from "maplibre-gl/package.json";
import { BASE_PATH } from "../constants";

// オフラインキャッシュにも版を含める。本体と異なる版のワーカーは、
// GeoJSON の処理結果を復元できずコース・リフトが描画されない。
export const MAPLIBRE_WORKER_URL = `${BASE_PATH}/maplibre/maplibre-gl-worker.mjs?v=${encodeURIComponent(version)}`;
