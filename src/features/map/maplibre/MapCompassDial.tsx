"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

/** キーボードで回すときの 1 回あたりの角度 */
const KEYBOARD_ROTATE_STEP_DEG = 15;
/** これ以下の動きは「回した」ではなく「押した」とみなす（px） */
const DRAG_THRESHOLD_PX = 3;

const DIAL_SIZE = 72;
const CENTER = DIAL_SIZE / 2;
const RING_RADIUS = 27;
const RING_WIDTH = 6.5;
const KNOB_RADIUS = 6.5;
/** 中心をつかんでも向きが定まらないので、この内側では回さない */
const DEAD_ZONE_PX = 8;

const normalizeBearing = (bearing: number) => {
  const wrapped = bearing % 360;
  return wrapped > 180
    ? wrapped - 360
    : wrapped <= -180
      ? wrapped + 360
      : wrapped;
};

/** 画面上で北が向いている角度（12 時方向から時計回り） */
const getNorthScreenAngle = (bearing: number) => -bearing;

const polarToPoint = (angleDeg: number, radius: number) => {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.sin(radians),
    y: CENTER - radius * Math.cos(radians),
  };
};

/**
 * 地図の向きを示す方位ダイヤル。
 *
 * 針は常に北を指す（真上が北なら bearing 0）。外周のリングに付いた印を
 * つかんで回すと、その印の位置がそのまま北の向きになる。
 * 回さずに押しただけなら北へ戻す。
 */
export const MapCompassDial = ({
  map,
  bearing,
  className,
}: {
  map: MapLibreMap | null;
  bearing: number;
  className?: string;
}) => {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const northAngle = getNorthScreenAngle(bearing);
  const knob = polarToPoint(northAngle, RING_RADIUS);

  const applyPointerBearing = useCallback(
    (clientX: number, clientY: number) => {
      const surface = surfaceRef.current;
      if (!surface || !map) return;

      const rect = surface.getBoundingClientRect();
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      if (Math.hypot(dx, dy) < DEAD_ZONE_PX) return;

      // 12 時方向を 0 として時計回りの角度。そこへ北を向ける
      const screenAngle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      map.setBearing(normalizeBearing(-screenAngle));
    },
    [map],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!map) return;
    event.preventDefault();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    // 押しただけ（北へ戻す）と回した（向きを変える）を取り違えないよう、
    // 一定量動くまでは地図を回さない
    if (!dragState.moved) {
      const travelled = Math.hypot(
        event.clientX - dragState.startX,
        event.clientY - dragState.startY,
      );
      if (travelled < DRAG_THRESHOLD_PX) return;
      dragState.moved = true;
    }
    applyPointerBearing(event.clientX, event.clientY);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // 回さずに押しただけなら北へ戻す
    if (!dragState.moved) map?.easeTo({ bearing: 0, duration: 300 });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!map) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      map.easeTo({
        bearing: bearing - KEYBOARD_ROTATE_STEP_DEG,
        duration: 160,
      });
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      map.easeTo({
        bearing: bearing + KEYBOARD_ROTATE_STEP_DEG,
        duration: 160,
      });
      return;
    }
    if (event.key === "Home" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      map.easeTo({ bearing: 0, duration: 300 });
    }
  };

  return (
    <div
      ref={surfaceRef}
      role="slider"
      tabIndex={0}
      aria-label="地図の向き。ドラッグで回転、押すと北に戻す"
      aria-valuemin={-180}
      aria-valuemax={180}
      aria-valuenow={Math.round(normalizeBearing(bearing))}
      aria-valuetext={`北から${Math.round(normalizeBearing(bearing))}度`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative flex h-[72px] w-[72px] cursor-grab touch-none items-center justify-center rounded-full bg-white select-none active:cursor-grabbing focus-visible:ring-3 focus-visible:ring-blue-600/40 focus-visible:outline-none",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        role="presentation"
        width={DIAL_SIZE}
        height={DIAL_SIZE}
        viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
      >
        {/* つかんで回す外周 */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          fill="none"
          stroke="#D1D5DB"
          strokeWidth={RING_WIDTH}
        />
        {/* 北を指す針。上を向いていれば地図も北向き */}
        <g
          style={{
            transform: `rotate(${northAngle}deg)`,
            transformOrigin: `${CENTER}px ${CENTER}px`,
          }}
        >
          <path
            d={`M ${CENTER} ${CENTER - 17} L ${CENTER - 6.5} ${CENTER} L ${CENTER + 6.5} ${CENTER} Z`}
            fill="#DC2626"
          />
          <path
            d={`M ${CENTER} ${CENTER + 14} L ${CENTER - 6.5} ${CENTER} L ${CENTER + 6.5} ${CENTER} Z`}
            fill="#9CA3AF"
          />
        </g>
        {/* 外周の印。ここが北の向き */}
        <circle
          cx={knob.x}
          cy={knob.y}
          r={KNOB_RADIUS}
          fill="#DC2626"
          stroke="#FFFFFF"
          strokeWidth="2.6"
        />
      </svg>
    </div>
  );
};
