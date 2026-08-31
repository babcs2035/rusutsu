"use client";

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type ResizablePanelProps = {
  children: ReactNode;
  /** 幅を覚えておくキー。画面ごとに分ける */
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  /** パネルを画面のどちら側に置くか。つまむ縁は反対側に付く */
  side?: "left" | "right";
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const readStoredWidth = (key: string): number | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * 左側の作業パネル。右端をつまんで幅を変えられる。
 *
 * 一覧の並び替えや、クロール名との突き合わせは、横も縦も足りないと
 * 途端にやりにくくなる。作業に合わせて広げられるようにして、
 * 選んだ幅は次に開いたときも使う。
 */
export function ResizablePanel({
  children,
  storageKey,
  defaultWidth,
  minWidth = 320,
  maxWidth = 900,
  className,
  side = "left",
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startRef = useRef({ x: 0, width: defaultWidth });

  // 保存済みの幅は、画面が出てから当てる（SSR と食い違わせない）
  useEffect(() => {
    const stored = readStoredWidth(storageKey);
    if (stored !== null) setWidth(clamp(stored, minWidth, maxWidth));
  }, [maxWidth, minWidth, storageKey]);

  const limit = useCallback(
    (value: number) =>
      clamp(
        value,
        minWidth,
        Math.min(maxWidth, Math.max(minWidth, window.innerWidth - 280)),
      ),
    [maxWidth, minWidth],
  );

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      // 右側のパネルは、左へ引くほど広がる
      const delta =
        side === "right"
          ? startRef.current.x - event.clientX
          : event.clientX - startRef.current.x;
      setWidth(limit(startRef.current.width + delta));
    };
    const stop = () => setIsResizing(false);

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizing, limit, side]);

  useEffect(() => {
    if (isResizing) return;
    try {
      window.localStorage.setItem(storageKey, String(width));
    } catch {
      // 保存できなくても幅は使えるので黙って諦める
    }
  }, [isResizing, storageKey, width]);

  const startResize = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    startRef.current = { x: event.clientX, width };
    setIsResizing(true);
  };

  return (
    <div
      className={cn("relative flex h-full min-h-0 shrink-0", className)}
      style={{ width }}
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
        {children}
      </div>
      <button
        type="button"
        aria-label="パネルの幅を変える"
        className={cn(
          "absolute top-0 z-30 h-full w-2 cursor-col-resize border-0 bg-transparent p-0",
          side === "right"
            ? "left-0 -translate-x-1/2"
            : "right-0 translate-x-1/2",
          "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-gray-200 after:transition-colors",
          "hover:after:w-1 hover:after:bg-blue-400",
          isResizing && "after:w-1 after:bg-blue-500",
        )}
        onPointerDown={startResize}
        onDoubleClick={() => setWidth(limit(defaultWidth))}
        onKeyDown={event => {
          const towardsWider =
            side === "right"
              ? event.key === "ArrowLeft"
              : event.key === "ArrowRight";
          const towardsNarrower =
            side === "right"
              ? event.key === "ArrowRight"
              : event.key === "ArrowLeft";
          const step = towardsWider ? 24 : towardsNarrower ? -24 : 0;
          if (step === 0) return;
          event.preventDefault();
          setWidth(current => limit(current + step));
        }}
      />
    </div>
  );
}
