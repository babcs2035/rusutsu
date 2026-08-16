import type { RefObject } from "react";
import { useEffect } from "react";
import { isEventInsideMapZoomSurface } from "../utils/dom";

type Options = {
  isMobileFilterOverlayOpen: boolean;
  isSidePanelLayout: boolean;
  listSheetContentRef: RefObject<HTMLDivElement | null>;
  mobileFilterOverlayRef: RefObject<HTMLDivElement | null>;
};

export const useHomeGestureGuards = ({
  isMobileFilterOverlayOpen,
  isSidePanelLayout,
  listSheetContentRef,
  mobileFilterOverlayRef,
}: Options) => {
  useEffect(() => {
    const preventNonMapGestureZoom = (event: Event) => {
      if (isEventInsideMapZoomSurface(event)) return;
      event.preventDefault();
    };
    const preventNonMapMultiTouchZoom = (event: TouchEvent) => {
      if (event.touches.length < 2 || isEventInsideMapZoomSurface(event)) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener("gesturestart", preventNonMapGestureZoom, {
      capture: true,
      passive: false,
    });
    document.addEventListener("gesturechange", preventNonMapGestureZoom, {
      capture: true,
      passive: false,
    });
    document.addEventListener("gestureend", preventNonMapGestureZoom, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchmove", preventNonMapMultiTouchZoom, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener("gesturestart", preventNonMapGestureZoom, {
        capture: true,
      });
      document.removeEventListener("gesturechange", preventNonMapGestureZoom, {
        capture: true,
      });
      document.removeEventListener("gestureend", preventNonMapGestureZoom, {
        capture: true,
      });
      document.removeEventListener("touchmove", preventNonMapMultiTouchZoom, {
        capture: true,
      });
    };
  }, []);

  useEffect(() => {
    const gestureGuardElements = [
      listSheetContentRef.current,
      isMobileFilterOverlayOpen ? mobileFilterOverlayRef.current : null,
    ].filter((element): element is HTMLDivElement => element !== null);
    if (isSidePanelLayout || gestureGuardElements.length === 0) return;

    const preventGestureZoom = (event: Event) => {
      event.preventDefault();
    };
    const preventMultiTouchZoom = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      event.preventDefault();
    };

    gestureGuardElements.forEach(element => {
      element.addEventListener("gesturestart", preventGestureZoom, {
        passive: false,
      });
      element.addEventListener("gesturechange", preventGestureZoom, {
        passive: false,
      });
      element.addEventListener("gestureend", preventGestureZoom, {
        passive: false,
      });
      element.addEventListener("touchmove", preventMultiTouchZoom, {
        passive: false,
      });
    });

    return () => {
      gestureGuardElements.forEach(element => {
        element.removeEventListener("gesturestart", preventGestureZoom);
        element.removeEventListener("gesturechange", preventGestureZoom);
        element.removeEventListener("gestureend", preventGestureZoom);
        element.removeEventListener("touchmove", preventMultiTouchZoom);
      });
    };
  }, [
    isMobileFilterOverlayOpen,
    isSidePanelLayout,
    listSheetContentRef,
    mobileFilterOverlayRef,
  ]);
};
