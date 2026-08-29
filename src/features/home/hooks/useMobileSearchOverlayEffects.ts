import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect } from "react";
import type { VisualViewportState } from "../types";

type Options = {
  isOpen: boolean;
  isSidePanelLayout: boolean;
  overlayRef: RefObject<HTMLDivElement | null>;
  viewportBaseHeightRef: RefObject<number | null>;
  setIsKeyboardActive: Dispatch<SetStateAction<boolean>>;
  setViewport: Dispatch<SetStateAction<VisualViewportState>>;
};

export const useMobileSearchOverlayEffects = ({
  isOpen,
  isSidePanelLayout,
  overlayRef,
  viewportBaseHeightRef,
  setIsKeyboardActive,
  setViewport,
}: Options) => {
  useEffect(() => {
    if (!isOpen || isSidePanelLayout) return;

    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyOverscrollBehavior =
      document.body.style.overscrollBehavior;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.overscrollBehavior = originalBodyOverscrollBehavior;
    };
  }, [isOpen, isSidePanelLayout]);

  useEffect(() => {
    if (!isOpen || isSidePanelLayout) {
      setViewport({ keyboardInset: 0 });
      setIsKeyboardActive(false);
      viewportBaseHeightRef.current = null;
      return;
    }

    const visualViewport = window.visualViewport;
    const syncViewport = () => {
      const height = visualViewport?.height ?? window.innerHeight;
      const previousBaseHeight = viewportBaseHeightRef.current;
      const baseHeight =
        previousBaseHeight == null
          ? height
          : Math.max(previousBaseHeight, height);
      viewportBaseHeightRef.current = baseHeight;
      const keyboardInset = Math.max(0, baseHeight - height);
      setViewport({ keyboardInset });
    };

    syncViewport();
    visualViewport?.addEventListener("resize", syncViewport);
    window.addEventListener("resize", syncViewport);

    return () => {
      visualViewport?.removeEventListener("resize", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, [
    isOpen,
    isSidePanelLayout,
    setIsKeyboardActive,
    setViewport,
    viewportBaseHeightRef,
  ]);
  // キーボードを開いた端末は、フォーカスした入力を見せるために
  // 「スクロールしないはずの祖先」まで勝手にスクロールする。
  // その位置はキーボードを閉じても戻らず、オーバーレイ全体がずれたままになる
  // （トップバーが画面外に消える）。祖先がスクロールされたら即座に戻す。
  useEffect(() => {
    if (!isOpen || isSidePanelLayout) return;

    const overlay = overlayRef.current;
    if (!overlay) return;

    const resetAncestorScroll = (event: Event) => {
      const { target } = event;
      const element =
        target instanceof Element ? target : document.scrollingElement;
      // オーバーレイ内部（フィルタ一覧）のスクロールは正当なので触らない
      if (!element || (element !== overlay && !element.contains(overlay))) {
        return;
      }

      if (element.scrollTop !== 0) element.scrollTop = 0;
      if (element.scrollLeft !== 0) element.scrollLeft = 0;
    };

    document.addEventListener("scroll", resetAncestorScroll, true);
    return () => {
      document.removeEventListener("scroll", resetAncestorScroll, true);
    };
  }, [isOpen, isSidePanelLayout, overlayRef]);
};
