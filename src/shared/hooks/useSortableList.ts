"use client";

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Options = {
  /** 並んでいる順の id。表示している順とそろえる */
  ids: string[];
  /** from 番目を to 番目へ動かす。to は「動かしたあとの位置」 */
  onReorder: (from: number, to: number) => void;
  disabled?: boolean;
};

type Measured = { id: string; top: number; height: number };

export type SortableList = {
  /** スクロールする外枠に付ける。position: relative が要る */
  containerRef: (element: HTMLElement | null) => void;
  /** 行に付ける ref。並び順の判定に使う */
  itemRef: (id: string) => (element: HTMLElement | null) => void;
  /** つまむ部分に付ける props */
  handleProps: (id: string) => {
    onPointerDown: (event: ReactPointerEvent) => void;
    onKeyDown: (event: ReactKeyboardEvent) => void;
    style: CSSProperties;
    "aria-grabbed": boolean;
  };
  draggingId: string | null;
  /** 落とすと入る位置（0〜件数）。ドラッグ中以外は null */
  dropIndex: number | null;
};

/** 端に近づいたら自動でスクロールする幅と速さ */
const EDGE_ZONE_PX = 56;
const MAX_SCROLL_SPEED = 18;

/**
 * ポインタ操作の並び替え。
 *
 * HTML5 の drag and drop は、ドラッグ画像の生成やスクロールの追従が
 * ブラウザ任せで、狭い一覧では思ったところに落とせない。
 * pointer events で位置を自分で測ると、行の高さぶん動かすだけで済み、
 * 端に寄せたときの自動スクロールも入れられる。
 */
export const useSortableList = ({
  ids,
  onReorder,
  disabled = false,
}: Options): SortableList => {
  const containerElementRef = useRef<HTMLElement | null>(null);
  const itemElementsRef = useRef(new Map<string, HTMLElement>());
  const measuredRef = useRef<Measured[]>([]);
  const dropIndexRef = useRef<number | null>(null);
  const pointerYRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const containerRef = useCallback((element: HTMLElement | null) => {
    containerElementRef.current = element;
  }, []);

  const itemRef = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) itemElementsRef.current.set(id, element);
      else itemElementsRef.current.delete(id);
    },
    [],
  );

  const stopAutoScroll = useCallback(() => {
    if (scrollFrameRef.current === null) return;
    cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
  }, []);

  /** つまんだ時点の行の位置を控える。以後はスクロール量だけで換算する */
  const measure = useCallback(() => {
    measuredRef.current = idsRef.current.flatMap(id => {
      const element = itemElementsRef.current.get(id);
      if (!element) return [];
      return [{ id, top: element.offsetTop, height: element.offsetHeight }];
    });
  }, []);

  const computeDropIndex = useCallback((clientY: number): number => {
    const container = containerElementRef.current;
    if (!container) return 0;
    const bounds = container.getBoundingClientRect();
    const contentY = clientY - bounds.top + container.scrollTop;
    const measured = measuredRef.current;
    for (let index = 0; index < measured.length; index += 1) {
      const item = measured[index];
      if (contentY < item.top + item.height / 2) return index;
    }
    return measured.length;
  }, []);

  const updateDropIndex = useCallback(
    (clientY: number) => {
      const next = computeDropIndex(clientY);
      if (dropIndexRef.current === next) return;
      dropIndexRef.current = next;
      setDropIndex(next);
    },
    [computeDropIndex],
  );

  const runAutoScroll = useCallback(() => {
    const container = containerElementRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const y = pointerYRef.current;
    const fromTop = y - bounds.top;
    const fromBottom = bounds.bottom - y;

    let delta = 0;
    if (fromTop < EDGE_ZONE_PX) {
      delta = -Math.ceil(
        ((EDGE_ZONE_PX - Math.max(fromTop, 0)) / EDGE_ZONE_PX) *
          MAX_SCROLL_SPEED,
      );
    } else if (fromBottom < EDGE_ZONE_PX) {
      delta = Math.ceil(
        ((EDGE_ZONE_PX - Math.max(fromBottom, 0)) / EDGE_ZONE_PX) *
          MAX_SCROLL_SPEED,
      );
    }
    if (delta !== 0) {
      container.scrollTop += delta;
      updateDropIndex(y);
    }
    scrollFrameRef.current = requestAnimationFrame(runAutoScroll);
  }, [updateDropIndex]);

  const finishDrag = useCallback(
    (commit: boolean) => {
      stopAutoScroll();
      const id = draggingId;
      const target = dropIndexRef.current;
      dropIndexRef.current = null;
      setDraggingId(null);
      setDropIndex(null);
      if (!commit || id === null || target === null) return;

      const from = idsRef.current.indexOf(id);
      if (from < 0) return;
      // 「自分より後ろへ落とした」ときは、自分が抜けるぶん 1 つ手前になる
      const to = target > from ? target - 1 : target;
      if (to === from) return;
      onReorderRef.current(from, to);
    },
    [draggingId, stopAutoScroll],
  );

  useEffect(() => {
    if (draggingId === null) return;

    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      pointerYRef.current = event.clientY;
      updateDropIndex(event.clientY);
    };
    const handleUp = () => finishDrag(true);
    const handleCancel = () => finishDrag(false);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishDrag(false);
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    window.addEventListener("keydown", handleKey);
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("keydown", handleKey);
      document.body.style.userSelect = previousUserSelect;
    };
  }, [draggingId, finishDrag, updateDropIndex]);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const handleProps = useCallback(
    (id: string) => ({
      "aria-grabbed": draggingId === id,
      style: {
        cursor: disabled ? "default" : draggingId === id ? "grabbing" : "grab",
        touchAction: "none" as const,
      },
      onPointerDown: (event: ReactPointerEvent) => {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        measure();
        pointerYRef.current = event.clientY;
        dropIndexRef.current = computeDropIndex(event.clientY);
        setDropIndex(dropIndexRef.current);
        setDraggingId(id);
        stopAutoScroll();
        scrollFrameRef.current = requestAnimationFrame(runAutoScroll);
      },
      onKeyDown: (event: ReactKeyboardEvent) => {
        if (disabled) return;
        const step =
          event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if (step === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const from = idsRef.current.indexOf(id);
        const to = from + step;
        if (from < 0 || to < 0 || to >= idsRef.current.length) return;
        onReorderRef.current(from, to);
      },
    }),
    [
      computeDropIndex,
      disabled,
      draggingId,
      measure,
      runAutoScroll,
      stopAutoScroll,
    ],
  );

  return { containerRef, itemRef, handleProps, draggingId, dropIndex };
};

/** from 番目を to 番目へ動かした新しい配列を返す */
export const moveItem = <T>(items: T[], from: number, to: number): T[] => {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(Math.min(Math.max(to, 0), next.length), 0, moved);
  return next;
};
