import {
  escapeXml,
  SHARE_IMAGE_HEIGHT,
  SHARE_IMAGE_WIDTH,
  SHARE_MAP_SIZES,
  shareMapSize,
} from "@/features/share/mapCard";
import {
  SLOPE_COLOR_STOPS,
  SLOPE_MAX_DEG,
  SLOPE_MIN_DEG,
} from "@/lib/finalizedResortGeojsonShared";

export function shareImageSlots(count: number) {
  return Array.from({ length: Math.min(4, count) }, (_, i) => {
    const size = shareMapSize(count, i);
    return {
      ...SHARE_MAP_SIZES[size],
      size,
      left: size === "grid" ? 20 + (i % 2) * 588 : 20,
      top: 100 + (count === 2 ? i : Math.floor(i / 2)) * 247,
    };
  });
}

/** SVGはカードの文字・凡例・出典だけ。地図の描画は既存MapLibre部品を使う。 */
export function shareImageOverlay(
  names: string[],
  total: number,
  osm: boolean,
  comparison: boolean,
  mapped = true,
) {
  const slots = shareImageSlots(names.length);
  const gradient = SLOPE_COLOR_STOPS.map(
    stop =>
      `<stop offset="${((stop.slope - SLOPE_MIN_DEG) / (SLOPE_MAX_DEG - SLOPE_MIN_DEG)) * 100}%" stop-color="${stop.color}"/>`,
  ).join("");
  const heading = comparison
    ? `スキー場比較 ${total}件${total > 4 ? `（先頭4件）` : ""}`
    : "ゲレンデマップ";
  const labels = names
    .map((name, i) => {
      const slot = slots[i];
      // foreignObjectを使わずSVGのclipで長い名称も地図の外へ出さない。
      const fontSize = names.length === 1 ? 28 : name.length > 24 ? 18 : 22;
      return `<clipPath id="label${i}"><rect x="${slot.left}" y="${slot.top - 33}" width="${slot.width}" height="32"/></clipPath><text clip-path="url(#label${i})" x="${slot.left}" y="${slot.top - 10}" font-size="${fontSize}" font-weight="700">${escapeXml(name)}</text>`;
    })
    .join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_IMAGE_WIDTH}" height="${SHARE_IMAGE_HEIGHT}">
    <defs><linearGradient id="slope">${gradient}</linearGradient></defs>
    <g font-family="sans-serif" fill="#132d48">
      <text x="20" y="37" font-size="25" font-weight="700">${heading}</text>
      <text x="1180" y="37" text-anchor="end" font-size="24" font-weight="700">Rusutsu</text>
      ${labels}
      ${
        mapped
          ? `<text x="20" y="580" font-size="15">コースの斜度（計算値）</text>
      <rect x="198" y="567" width="260" height="9" rx="4" fill="url(#slope)"/>
      ${[-10, 0, 10, 20, 30, 40].map((n, i) => `<text x="${198 + i * 52}" y="591" font-size="12" text-anchor="middle">${n}°${n === 40 ? "+" : ""}</text>`).join("")}
      <text x="1180" y="579" text-anchor="end" font-size="16">背景：地理院タイル（国土地理院）／標高：国土地理院</text>
      <text x="1180" y="599" text-anchor="end" font-size="16">写真を加工し、Rusutsuがコース・リフト・斜度表示を追記</text>
      <text x="20" y="620" font-size="16">maps.gsi.go.jp/development/ichiran.html${osm ? "　｜　コース等の一部：© OpenStreetMap contributors　openstreetmap.org/copyright" : ""}</text>`
          : ""
      }
    </g>
  </svg>`);
}
