"use client";

import { GripVertical } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { moveItem } from "@/shared/hooks/useSortableList";

type Props<T> = {
  label: string;
  values: T[];
  onChange: (values: T[]) => void;
  disabled?: boolean;
  className?: string;
  children: (value: T, index: number, handle: ReactNode) => ReactNode;
};

/** Layout stays fixed during dragging; transforms preview the final order. */
export function SortableLinkList<T>({
  label,
  values,
  onChange,
  disabled = false,
  className = "flex flex-col gap-2",
  children,
}: Props<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const latest = useRef({ values, onChange });
  latest.current = { values, onChange };
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => () => cleanupRef.current?.(), []);
  useEffect(() => {
    // External edits or saving cancel an in-flight gesture.
    if (disabled) cleanupRef.current?.();
  }, [disabled]);

  return (
    <div ref={listRef} className={className}>
      {values.map((value, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: Controlled rows retain their slots; order changes only after the drag animation finishes.
          key={index}
          className="relative min-w-0 rounded-lg motion-reduce:transition-none"
          style={{ pointerEvents: dragging ? "none" : undefined }}
        >
          {children(
            value,
            index,
            values.length > 1 ? (
              <button
                type="button"
                disabled={disabled}
                aria-label={`${label}のリンク ${index + 1}をドラッグして並び替え`}
                title="ドラッグで並び替え（キーボードでは↑↓）"
                className="flex size-9 shrink-0 touch-none items-center justify-center rounded-md border bg-white text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50"
                style={{ cursor: dragging ? "grabbing" : "grab" }}
                onKeyDown={event => {
                  const offset =
                    event.key === "ArrowUp"
                      ? -1
                      : event.key === "ArrowDown"
                        ? 1
                        : 0;
                  const target = index + offset;
                  if (!offset || disabled || dragging) return;
                  event.preventDefault();
                  if (target < 0 || target >= values.length) return;
                  onChange(moveItem(values, index, target));
                  setAnnouncement(
                    `${index + 1}番目のリンクを${target + 1}番目に移動しました`,
                  );
                  const row = listRef.current?.children[target];
                  (
                    row?.querySelector("button") as HTMLButtonElement | null
                  )?.focus();
                }}
                onPointerDown={event => {
                  if (
                    disabled ||
                    dragging ||
                    event.button !== 0 ||
                    !event.isPrimary
                  )
                    return;
                  const list = listRef.current;
                  if (!list) return;
                  event.preventDefault();
                  const handle = event.currentTarget;
                  handle.focus();
                  handle.setPointerCapture(event.pointerId);
                  const pointerId = event.pointerId;
                  const rows = Array.from(list.children).filter(
                    (node): node is HTMLDivElement =>
                      node instanceof HTMLDivElement &&
                      !node.hasAttribute("aria-live"),
                  );
                  const bounds = rows.map(row => row.getBoundingClientRect());
                  const startY = event.clientY;
                  let pointerY = startY;
                  let target = index;
                  let frame = 0;
                  let timer: ReturnType<typeof setTimeout> | undefined;
                  let settling = false;
                  const originalValues = values;
                  const reduced = window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches;
                  const transition = reduced
                    ? "none"
                    : "transform 180ms cubic-bezier(0.2, 0, 0, 1)";
                  let scrollParent: HTMLElement | null = list.parentElement;
                  while (
                    scrollParent &&
                    !/(auto|scroll)/.test(
                      getComputedStyle(scrollParent).overflowY,
                    )
                  )
                    scrollParent = scrollParent.parentElement;
                  const scroller = scrollParent ?? document.documentElement;
                  const startScroll = scroller.scrollTop;
                  const gap =
                    bounds.length > 1 ? bounds[1].top - bounds[0].bottom : 0;
                  const distance = bounds[index].height + gap;
                  rows.forEach((row, i) => {
                    row.style.willChange = "transform";
                    row.style.transition = i === index ? "none" : transition;
                  });
                  rows[index].style.zIndex = "10";
                  rows[index].style.boxShadow = "0 12px 28px rgb(0 0 0 / 0.18)";
                  rows[index].style.background = "white";
                  const oldCursor = document.body.style.cursor;
                  const oldSelect = document.body.style.userSelect;
                  document.body.style.cursor = "grabbing";
                  document.body.style.userSelect = "none";
                  setDragging(true);

                  const cleanup = () => {
                    cancelAnimationFrame(frame);
                    clearTimeout(timer);
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                    window.removeEventListener("pointercancel", cancel);
                    window.removeEventListener("keydown", key);
                    window.removeEventListener("blur", cancel);
                    if (handle.hasPointerCapture(pointerId))
                      handle.releasePointerCapture(pointerId);
                    rows.forEach(row => {
                      for (const property of [
                        "transform",
                        "transition",
                        "will-change",
                        "z-index",
                        "box-shadow",
                        "background",
                      ])
                        row.style.removeProperty(property);
                    });
                    document.body.style.cursor = oldCursor;
                    document.body.style.userSelect = oldSelect;
                    cleanupRef.current = null;
                    setDragging(false);
                  };
                  const draw = () => {
                    if (latest.current.values !== originalValues) {
                      cleanup();
                      return;
                    }
                    const edge = scrollParent?.getBoundingClientRect();
                    const top = Math.max(0, edge?.top ?? 0);
                    const bottom = Math.min(
                      window.innerHeight,
                      edge?.bottom ?? window.innerHeight,
                    );
                    const speed =
                      pointerY < top + 48
                        ? -Math.min(12, (top + 48 - pointerY) / 4)
                        : pointerY > bottom - 48
                          ? Math.min(12, (pointerY - bottom + 48) / 4)
                          : 0;
                    scroller.scrollTop += speed;
                    const delta =
                      pointerY - startY + scroller.scrollTop - startScroll;
                    const center =
                      bounds[index].top + bounds[index].height / 2 + delta;
                    target = 0;
                    bounds.forEach((rect, i) => {
                      if (i !== index && center > rect.top + rect.height / 2)
                        target++;
                    });
                    rows.forEach((row, i) => {
                      const shift =
                        i === index
                          ? delta
                          : index < i && i <= target
                            ? -distance
                            : target <= i && i < index
                              ? distance
                              : 0;
                      row.style.transform = `translate3d(0, ${shift}px, 0)`;
                    });
                    frame = requestAnimationFrame(draw);
                  };
                  const finish = (commit: boolean) => {
                    if (settling) return;
                    settling = true;
                    cancelAnimationFrame(frame);
                    const destination = commit ? target : index;
                    const delta =
                      destination > index
                        ? bounds[destination].bottom - bounds[index].bottom
                        : bounds[destination].top - bounds[index].top;
                    rows[index].style.transition = transition;
                    rows[index].style.transform =
                      `translate3d(0, ${delta}px, 0)`;
                    if (!commit)
                      rows.forEach((row, i) => {
                        if (i !== index)
                          row.style.transform = "translate3d(0, 0, 0)";
                      });
                    timer = setTimeout(
                      () => {
                        cleanup();
                        if (
                          commit &&
                          destination !== index &&
                          latest.current.values === originalValues
                        ) {
                          latest.current.onChange(
                            moveItem(originalValues, index, destination),
                          );
                          setAnnouncement(
                            `${index + 1}番目のリンクを${destination + 1}番目に移動しました`,
                          );
                          (
                            rows[destination].querySelector(
                              "button",
                            ) as HTMLButtonElement | null
                          )?.focus({ preventScroll: true });
                        }
                      },
                      reduced ? 0 : 180,
                    );
                  };
                  const move = (e: PointerEvent) => {
                    if (e.pointerId === pointerId && !settling) {
                      e.preventDefault();
                      pointerY = e.clientY;
                    }
                  };
                  const up = (e: PointerEvent) => {
                    if (e.pointerId === pointerId) finish(true);
                  };
                  const cancel = () => finish(false);
                  const key = (e: KeyboardEvent) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      finish(false);
                    }
                  };
                  cleanupRef.current = cleanup;
                  window.addEventListener("pointermove", move, {
                    passive: false,
                  });
                  window.addEventListener("pointerup", up);
                  window.addEventListener("pointercancel", cancel);
                  window.addEventListener("keydown", key);
                  window.addEventListener("blur", cancel);
                  frame = requestAnimationFrame(draw);
                }}
              >
                <GripVertical className="size-4" />
              </button>
            ) : null,
          )}
        </div>
      ))}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
