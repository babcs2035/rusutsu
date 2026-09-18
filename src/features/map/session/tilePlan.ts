import { GSI_TILE_LAYERS } from "../constants";

export const MAX_RESORT_TILES = 3200;
const project = ([lng, lat]: readonly number[]) => {
  const latitude = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return [
    (lng + 180) / 360,
    (1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2,
  ];
};

/** XYZ の生ズーム。MapLibre の表示倍率とは tileSize=256 のため1段違う。 */
export function planResortTiles(
  coordinates: readonly (readonly number[])[],
  screen: { width: number; height: number; pixelRatio: number },
) {
  const points = coordinates
    .filter(p => p.length >= 2 && p.every(Number.isFinite))
    .map(project);
  if (!points.length)
    return { urls: [] as string[], complete: false, minZoom: 0, maxZoom: 0 };
  let west = Infinity,
    east = -Infinity,
    north = Infinity,
    south = -Infinity;
  for (const [x, y] of points) {
    west = Math.min(west, x);
    east = Math.max(east, x);
    north = Math.min(north, y);
    south = Math.max(south, y);
  }
  const cx = (west + east) / 2,
    cy = (north + south) / 2;
  const width = Math.max(320, screen.width),
    height = Math.max(320, screen.height);
  // プレビュー（短辺約200px）と全画面を両方覆う。回転しても欠けない対角線分を確保。
  const fit = Math.min(
    16,
    Math.floor(
      Math.log2(
        Math.min(
          180 / (256 * Math.max(east - west, 1e-6)),
          180 / (256 * Math.max(south - north, 1e-6)),
        ),
      ),
    ),
  );
  const minZoom = Math.max(5, fit);
  // DPR 2以上では追加の1段も保存。原寸のタイルを使い、プレビューを引き伸ばさない。
  const maxZoom = screen.pixelRatio > 1 ? 17 : 16;
  const urls: string[] = [];
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const n = 2 ** z;
    const margin = Math.hypot(width, height) / (2 * 256 * n);
    const left = Math.max(0, Math.floor((west - margin) * n));
    const right = Math.min(n - 1, Math.floor((east + margin) * n));
    const top = Math.max(0, Math.floor((north - margin) * n));
    const bottom = Math.min(n - 1, Math.floor((south + margin) * n));
    total += (right - left + 1) * (bottom - top + 1) * 2;
    const tiles: { x: number; y: number }[] = [];
    // 極端な形状や画面でも列挙を無制限にしない。
    if ((right - left + 1) * (bottom - top + 1) > MAX_RESORT_TILES) continue;
    for (let x = left; x <= right; x++)
      for (let y = top; y <= bottom; y++) tiles.push({ x, y });
    tiles.sort(
      (a, b) =>
        Math.hypot(a.x - cx * n, a.y - cy * n) -
        Math.hypot(b.x - cx * n, b.y - cy * n),
    );
    for (const { x, y } of tiles)
      for (const layer of Object.values(GSI_TILE_LAYERS)) {
        if (urls.length < MAX_RESORT_TILES)
          urls.push(
            layer.url
              .replace("{z}", String(z))
              .replace("{x}", String(x))
              .replace("{y}", String(y)),
          );
      }
  }
  return { urls, complete: total <= MAX_RESORT_TILES, minZoom, maxZoom, total };
}
