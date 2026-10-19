"use client";

import { type PointerEvent, useState } from "react";
import {
  getSlopeColor,
  SLOPE_COLOR_STOPS,
  SLOPE_MAX_DEG,
  SLOPE_MIN_DEG,
} from "@/lib/finalizedResortGeojsonShared";
import { cn } from "@/lib/utils";

const toRatio = (slope: number) =>
  ((slope - SLOPE_MIN_DEG) / (SLOPE_MAX_DEG - SLOPE_MIN_DEG)) * 100;
// 色の変曲点とは独立に、角度の目盛りを10°ごとに置く。
const SLOPE_TICKS = [-10, 0, 10, 20, 30, 40];
const background = `linear-gradient(90deg, ${SLOPE_COLOR_STOPS.map(
  stop => `${stop.color} ${toRatio(stop.slope)}%`,
).join(", ")})`;

/** 地図と同じ色補間を使い、タップ・ドラッグ・キーボードで角度を読める凡例。 */
export function SlopeColorScale() {
  const [slope, setSlope] = useState<number | null>(null);
  const readPointer = (event: PointerEvent<HTMLInputElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    setSlope(
      Math.round(SLOPE_MIN_DEG + ratio * (SLOPE_MAX_DEG - SLOPE_MIN_DEG)),
    );
  };
  const valueText = slope === SLOPE_MAX_DEG ? `${slope}°+` : `${slope ?? 0}°`;
  const position = toRatio(slope ?? 0);

  return (
    <div
      className="relative h-8 w-full min-w-[90px] rounded-sm focus-within:outline-2 focus-within:outline-blue-600/50"
      data-slope-color-scale="true"
    >
      <div
        className="absolute inset-x-0 top-0.5 h-2 rounded-full"
        style={{ background }}
      />
      <div
        className="absolute inset-x-0 top-3.5 h-3 text-[9px] leading-none text-gray-600 @[25rem]:text-[10px]"
        aria-hidden="true"
      >
        {SLOPE_TICKS.map((tick, index) => (
          <span
            key={tick}
            className={cn(
              "absolute top-0 whitespace-nowrap tabular-nums",
              index === 0
                ? "translate-x-0"
                : index === SLOPE_TICKS.length - 1
                  ? "-translate-x-full"
                  : "-translate-x-1/2",
            )}
            style={{ left: `${toRatio(tick)}%` }}
          >
            {tick === SLOPE_MAX_DEG ? `${tick}°+` : `${tick}°`}
          </span>
        ))}
      </div>
      {slope !== null && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <span
            className="absolute top-0 h-3 w-1 -translate-x-1/2 rounded-full border border-white bg-slate-900 shadow-sm"
            style={{ left: `${position}%` }}
          />
          <span
            className="absolute top-3 flex h-4 items-center gap-1 rounded border border-slate-300 bg-white px-1 text-[11px] leading-none font-bold text-slate-900 shadow-sm"
            style={{
              left: `clamp(24px, ${position}%, calc(100% - 24px))`,
              transform: "translateX(-50%)",
            }}
          >
            <span
              data-slope-color-swatch="true"
              className="size-2.5 shrink-0 rounded-sm border border-black/10"
              style={{ backgroundColor: getSlopeColor(slope) }}
            />
            {valueText}
          </span>
        </div>
      )}
      <input
        type="range"
        min={SLOPE_MIN_DEG}
        max={SLOPE_MAX_DEG}
        step={1}
        value={slope ?? 0}
        aria-label="斜度と色の確認"
        aria-valuetext={valueText}
        title="タップ・ドラッグで斜度と色を確認"
        className="absolute inset-0 z-10 m-0 h-full w-full touch-none cursor-crosshair opacity-0"
        onChange={event => setSlope(Number(event.currentTarget.value))}
        onFocus={() => setSlope(current => current ?? 0)}
        onBlur={() => setSlope(null)}
        onKeyDown={event => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          )
            event.stopPropagation();
        }}
        onPointerDown={event => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          readPointer(event);
        }}
        onPointerMove={event => {
          if (
            event.pointerType === "mouse" ||
            event.currentTarget.hasPointerCapture(event.pointerId)
          )
            readPointer(event);
        }}
        onPointerUp={event => {
          readPointer(event);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerLeave={event => {
          if (
            event.pointerType === "mouse" &&
            !event.currentTarget.hasPointerCapture(event.pointerId) &&
            document.activeElement !== event.currentTarget
          )
            setSlope(null);
        }}
      />
    </div>
  );
}
