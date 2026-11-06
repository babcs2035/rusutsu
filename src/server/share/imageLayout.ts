import {
  SHARE_IMAGE_HEIGHT,
  SHARE_IMAGE_WIDTH,
  SHARE_MAP_SIZES,
  shareMapSize,
} from "@/features/share/mapCard";

export function shareImageSlots(count: number) {
  return Array.from({ length: Math.min(4, count) }, (_, i) => {
    const size = shareMapSize(count, i);
    return {
      ...SHARE_MAP_SIZES[size],
      size,
      left: size === "pair" ? 0 : (i % 2) * 601,
      top: size === "half" ? 0 : Math.floor(i / 2) * 316,
    };
  });
}

/** 共有画像は地図だけ。右下に出典を小さく添える。 */
export function shareImageOverlay(osm: boolean) {
  const label = osm ? "国土地理院 / © OpenStreetMap" : "国土地理院";
  const width = label.length * 13 + 16;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_IMAGE_WIDTH}" height="${SHARE_IMAGE_HEIGHT}">
    <rect x="${SHARE_IMAGE_WIDTH - width}" y="${SHARE_IMAGE_HEIGHT - 24}" width="${width}" height="24" fill="#ffffff" fill-opacity="0.75"/>
    <text x="${SHARE_IMAGE_WIDTH - 8}" y="${SHARE_IMAGE_HEIGHT - 7}" text-anchor="end" font-family="sans-serif" font-size="14" fill="#132d48">${label}</text>
  </svg>`);
}
