"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

// 詳細パネル（右メニュー）の左端に置く横リサイズハンドル。
// ドラッグで onResize に幅(px)を渡し、呼び出し元が CSS 変数へ反映する。
// 幅は min/max でクランプし、マップとパネルのいずれも読めないほど狭くならない。
// className で配置を指定できる（境界にまたがせる場合は呼び出し元で位置を決める）。
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH_RATIO = 0.55;

export function PanelResizeHandle({
  onResize,
  className,
}: {
  onResize: (width: number) => void;
  className?: string;
}) {
  const dragging = useRef(false);

  const clampWidth = useCallback((width: number) => {
    const max = Math.floor(window.innerWidth * MAX_PANEL_WIDTH_RATIO);
    return Math.min(Math.max(width, MIN_PANEL_WIDTH), max);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragging.current = true;
      const onMove = (ev: PointerEvent) => {
        if (!dragging.current) return;
        // パネルは右端に固定されるため、幅 = ウィンドウ幅 − ポインタの X 座標
        onResize(clampWidth(window.innerWidth - ev.clientX));
      };
      const onUp = () => {
        dragging.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clampWidth, onResize],
  );

  return (
    <div
      onPointerDown={handlePointerDown}
      className={cn(
        "group absolute inset-y-0 z-20 flex w-2.5 cursor-col-resize touch-none items-center justify-center",
        className,
      )}
    >
      {/* 常時表示のグリップ（縦3点）で「ここをドラッグすると幅が変わる」ことを示す。
          hover/active で強調する。 */}
      <div className="flex flex-col items-center justify-center gap-[3px] rounded-full bg-gray-300/80 px-[3px] py-2.5 shadow-sm transition-colors group-hover:bg-blue-500 group-active:bg-blue-600">
        <span className="block h-[3px] w-[3px] rounded-full bg-white" />
        <span className="block h-[3px] w-[3px] rounded-full bg-white" />
        <span className="block h-[3px] w-[3px] rounded-full bg-white" />
      </div>
    </div>
  );
}
