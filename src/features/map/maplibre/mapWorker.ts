import { setWorkerUrl } from "maplibre-gl";
import { BASE_PATH } from "../constants";

/**
 * ワーカーの場所を教える。
 *
 * MapLibre は import.meta.url からワーカーの URL を組み立てるが、
 * Next.js のバンドル後はそれが http(s) にならず空文字になる。そのまま動かすと
 * HTML をワーカーとして読み込もうとして GeoJSON のタイル化が始まらず、
 * コースもリフトも一本も描かれない。実体は scripts/copyMaplibreWorker.mjs が
 * public/maplibre へ複製している。
 *
 * 地図を作るモジュールが複数あるので、副作用だけをこのファイルに切り出して
 * import 一行で持ち込めるようにしている。呼ばれるのは最初の import のときだけ。
 */
setWorkerUrl(`${BASE_PATH}/maplibre/maplibre-gl-worker.mjs`);
