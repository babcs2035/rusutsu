import type { Map as MapLibreMap } from "maplibre-gl";
import { ARROW_ICON_ID } from "./finalizedLayers";

const ICON_SIZE = 48;
const PIXEL_RATIO = 2;

/**
 * 進行方向の矢羽。
 *
 * 線色に依存しない白い矢に薄い暗色の縁を付ける。細い線の上でも向きが読め、
 * 難易度色・斜度色のどちらにも干渉しない。
 * symbol-placement: "line" で線に沿って並ぶので、配置計算は MapLibre 任せ。
 */
export const registerArrowIcon = (map: MapLibreMap) => {
  if (map.hasImage(ARROW_ICON_ID)) return;

  const size = ICON_SIZE * PIXEL_RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.scale(PIXEL_RATIO, PIXEL_RATIO);
  const center = ICON_SIZE / 2;
  const length = ICON_SIZE * 0.72;
  const halfWidth = ICON_SIZE * 0.38;
  const tip = center + length / 2;
  const back = center - length / 2;
  const notch = center - length * 0.14;

  context.beginPath();
  context.moveTo(tip, center);
  context.lineTo(back, center - halfWidth);
  context.lineTo(notch, center);
  context.lineTo(back, center + halfWidth);
  context.closePath();

  context.fillStyle = "rgba(255, 255, 255, 0.97)";
  context.strokeStyle = "rgba(15, 23, 42, 0.55)";
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.fill();
  context.stroke();

  const imageData = context.getImageData(0, 0, size, size);
  map.addImage(
    ARROW_ICON_ID,
    { width: size, height: size, data: new Uint8Array(imageData.data.buffer) },
    { pixelRatio: PIXEL_RATIO },
  );
};
