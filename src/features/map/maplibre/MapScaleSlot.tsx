"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";
import { measureCanvasTextWidth } from "../utils/labelMeasure";

/** 縮尺バーの最大幅。狭い地図では操作行の出典の幅に収める */
const MAX_WIDTH_PX = 112;
const NARROW_MAX_WIDTH_PX = 80;
const NARROW_MAP_WIDTH_PX = 360;
const TICK_LABEL_GAP_PX = 4;

type Scale = { widthPx: number; maxWidthPx: number; meters: number };

/** 1・2・3・5 × 10^n のうち、上限を超えない最大の値 */
const getRoundMeters = (maxMeters: number) => {
  const pow10 = 10 ** Math.floor(Math.log10(maxMeters));
  const ratio = maxMeters / pow10;
  const step = ratio >= 5 ? 5 : ratio >= 3 ? 3 : ratio >= 2 ? 2 : 1;
  return step * pow10;
};

/** MapLibre の ScaleControl と同じく、地図の縦中央で横方向の距離を測る */
const measureScale = (map: MapLibreMap): Scale | null => {
  const container = map.getContainer();
  const maxWidthPx =
    container.clientWidth >= NARROW_MAP_WIDTH_PX
      ? MAX_WIDTH_PX
      : NARROW_MAX_WIDTH_PX;
  const y = container.clientHeight / 2;
  const maxMeters = map
    .unproject([0, y])
    .distanceTo(map.unproject([maxWidthPx, y]));
  if (!Number.isFinite(maxMeters) || maxMeters <= 0) return null;
  const meters = getRoundMeters(maxMeters);
  return { widthPx: (maxWidthPx * meters) / maxMeters, maxWidthPx, meters };
};

/** 端の値に合わせて m／km をそろえる（1 km の中間は 0.5） */
const formatDistance = (meters: number, unitMeters: number) =>
  String(Number((meters / unitMeters).toFixed(2)));

/** 中間の数字が端の数字と重ならないか。実際のフォントで測る */
const fitsMiddleLabel = (
  widthPx: number,
  middleLabel: string,
  endLabel: string,
) => {
  const font = `600 10px ${getComputedStyle(document.body).fontFamily}`;
  const middleWidth = measureCanvasTextWidth(middleLabel, font);
  const endWidth = measureCanvasTextWidth(endLabel, font);
  return (
    widthPx / 2 + middleWidth / 2 + TICK_LABEL_GAP_PX <= widthPx - endWidth
  );
};

const TICK_LABEL_CLASS =
  "absolute bottom-0 whitespace-nowrap font-semibold text-[10px] text-white leading-3 [text-shadow:0_0_2px_rgb(0_0_0/0.9),0_0_1px_rgb(0_0_0/0.9)]";

/** 地図の縮尺。Apple マップのように 0・中間・端の距離を書いた 2 色のバーで出す。 */
export function MapScaleSlot({ map }: { map: MapLibreMap | null }) {
  const [scale, setScale] = useState<Scale | null>(null);

  useEffect(() => {
    if (!map) return;
    const update = () => setScale(measureScale(map));
    update();
    map.on("move", update);
    map.on("resize", update);
    return () => {
      map.off("move", update);
      map.off("resize", update);
    };
  }, [map]);

  if (!scale) return null;
  const unitMeters = scale.meters >= 1000 ? 1000 : 1;
  const unit = unitMeters === 1000 ? "km" : "m";
  const endLabel = `${formatDistance(scale.meters, unitMeters)} ${unit}`;
  const middleLabel = formatDistance(scale.meters / 2, unitMeters);

  return (
    <div
      data-map-scale="true"
      className="flex shrink-0 justify-end"
      style={{ width: scale.maxWidthPx }}
    >
      <div
        className="flex flex-col gap-0.5"
        style={{ width: scale.widthPx }}
        role="img"
        aria-label={`縮尺 ${endLabel}`}
      >
        <div className="relative h-3">
          <span className={`${TICK_LABEL_CLASS} left-0`}>0</span>
          {fitsMiddleLabel(scale.widthPx, middleLabel, endLabel) && (
            <span className={`${TICK_LABEL_CLASS} left-1/2 -translate-x-1/2`}>
              {middleLabel}
            </span>
          )}
          <span className={`${TICK_LABEL_CLASS} right-0`}>{endLabel}</span>
        </div>
        <div className="flex h-1.5 rounded-full bg-white p-px shadow-[0_0_2px_rgb(0_0_0/0.5)]">
          <span className="flex-1 rounded-l-full bg-neutral-400" />
          <span className="flex-1 rounded-r-full bg-neutral-700" />
        </div>
      </div>
    </div>
  );
}
