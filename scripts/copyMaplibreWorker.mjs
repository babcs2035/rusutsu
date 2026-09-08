import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/**
 * MapLibre のワーカーを public/ に置く。
 *
 * MapLibre は import.meta.url からワーカーの URL を組み立てるが、
 * Next.js のバンドル後は http(s) の URL にならず、空文字になってしまう。
 * その状態だと HTML をワーカーとして読み込もうとして GeoJSON の
 * タイル化が止まり、コースもリフトも描画されない。
 * そこで実ファイルを配信して setWorkerUrl() で指し示す。
 * WebKit の通信断時に worker 内の shared import が失敗するため、
 * 依存を一つの module worker にまとめ、追加通信なしで起動できるようにする。
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "maplibre");

await mkdir(to, { recursive: true });
const result = await build({
  entryPoints: [join(from, "maplibre-gl-worker.mjs")],
  outfile: join(to, "maplibre-gl-worker.mjs"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  metafile: true,
});
if (
  Object.values(result.metafile.outputs).some(
    output => output.imports.length > 0,
  )
) {
  throw new Error("Map worker must not require additional module requests");
}
console.log("bundled standalone maplibre worker to public/maplibre");
