import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MapLibre のワーカーを public/ に置く。
 *
 * MapLibre は import.meta.url からワーカーの URL を組み立てるが、
 * Next.js のバンドル後は http(s) の URL にならず、空文字になってしまう。
 * その状態だと HTML をワーカーとして読み込もうとして GeoJSON の
 * タイル化が止まり、コースもリフトも描画されない。
 * そこで実ファイルを配信して setWorkerUrl() で指し示す。
 * ワーカーは module 形式で、同じディレクトリの shared を相対 import する。
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "maplibre");

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(to, { recursive: true });
await Promise.all(
  FILES.map(file => copyFile(join(from, file), join(to, file))),
);
console.log(`copied ${FILES.length} maplibre worker files to public/maplibre`);
