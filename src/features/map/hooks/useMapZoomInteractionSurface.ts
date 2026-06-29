"use client";

import {
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from "react";

export const useMapZoomInteractionSurface = (
  onUserMapZoomInteraction?: () => void,
) => {
  const mapZoomSurfaceRef = useRef<HTMLDivElement | null>(null);
  const pendingWrapperZoomInteractionRef = useRef(false);
  const wrapperZoomInteractionTimeoutRef = useRef<number | null>(null);

  const clearWrapperZoomInteractionTimeout = useCallback(() => {
    if (wrapperZoomInteractionTimeoutRef.current === null) return;

    window.clearTimeout(wrapperZoomInteractionTimeoutRef.current);
    wrapperZoomInteractionTimeoutRef.current = null;
  }, []);

  const completeWrapperZoomInteraction = useCallback(() => {
    clearWrapperZoomInteractionTimeout();
    if (!pendingWrapperZoomInteractionRef.current) return;

    pendingWrapperZoomInteractionRef.current = false;
    onUserMapZoomInteraction?.();
  }, [clearWrapperZoomInteractionTimeout, onUserMapZoomInteraction]);

  const scheduleWrapperZoomInteraction = useCallback(() => {
    pendingWrapperZoomInteractionRef.current = true;
    clearWrapperZoomInteractionTimeout();
    completeWrapperZoomInteraction();
  }, [clearWrapperZoomInteractionTimeout, completeWrapperZoomInteraction]);

  const handleMapWheelCapture = useCallback(
    (_event: ReactWheelEvent<HTMLDivElement>) => {
      scheduleWrapperZoomInteraction();
    },
    [scheduleWrapperZoomInteraction],
  );

  const handleMapDoubleClickCapture = useCallback(() => {
    scheduleWrapperZoomInteraction();
  }, [scheduleWrapperZoomInteraction]);

  const handleMapTouchStartCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (event.touches.length < 2) return;

      scheduleWrapperZoomInteraction();
    },
    [scheduleWrapperZoomInteraction],
  );

  const handleMapTouchEndCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (
        !pendingWrapperZoomInteractionRef.current ||
        event.touches.length > 0
      ) {
        return;
      }

      scheduleWrapperZoomInteraction();
    },
    [scheduleWrapperZoomInteraction],
  );

  useEffect(() => {
    const surface = mapZoomSurfaceRef.current;
    if (!surface) return;

    const handleWheel = () => {
      scheduleWrapperZoomInteraction();
    };
    const handleDoubleClick = () => {
      scheduleWrapperZoomInteraction();
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;

      scheduleWrapperZoomInteraction();
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (
        !pendingWrapperZoomInteractionRef.current ||
        event.touches.length > 0
      ) {
        return;
      }

      scheduleWrapperZoomInteraction();
    };

    surface.addEventListener("wheel", handleWheel, { passive: true });
    surface.addEventListener("dblclick", handleDoubleClick);
    surface.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    surface.addEventListener("touchend", handleTouchEnd, { passive: true });
    surface.addEventListener("touchcancel", handleTouchEnd, {
      passive: true,
    });

    return () => {
      surface.removeEventListener("wheel", handleWheel);
      surface.removeEventListener("dblclick", handleDoubleClick);
      surface.removeEventListener("touchstart", handleTouchStart);
      surface.removeEventListener("touchend", handleTouchEnd);
      surface.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [scheduleWrapperZoomInteraction]);

  useEffect(() => {
    return () => {
      clearWrapperZoomInteractionTimeout();
    };
  }, [clearWrapperZoomInteractionTimeout]);

  return {
    mapZoomSurfaceRef: mapZoomSurfaceRef as RefObject<HTMLDivElement>,
    handleMapDoubleClickCapture,
    handleMapTouchEndCapture,
    handleMapTouchStartCapture,
    handleMapWheelCapture,
  };
};
