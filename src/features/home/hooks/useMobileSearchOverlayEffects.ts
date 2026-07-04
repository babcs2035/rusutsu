import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect } from "react";
import type { VisualViewportState } from "../types";

type Options = {
  isOpen: boolean;
  isSidePanelLayout: boolean;
  viewportBaseHeightRef: RefObject<number | null>;
  setIsKeyboardActive: Dispatch<SetStateAction<boolean>>;
  setViewport: Dispatch<SetStateAction<VisualViewportState>>;
};

export const useMobileSearchOverlayEffects = ({
  isOpen,
  isSidePanelLayout,
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
};
