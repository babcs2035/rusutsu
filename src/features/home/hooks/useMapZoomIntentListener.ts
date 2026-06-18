import { useEffect } from "react";
import { isEventInsideMapZoomSurface } from "../utils/dom";

export const useMapZoomIntentListener = (onMapZoomIntent: () => void) => {
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!isEventInsideMapZoomSurface(event)) return;

      onMapZoomIntent();
    };
    const handleDoubleClick = (event: MouseEvent) => {
      if (!isEventInsideMapZoomSurface(event)) return;

      onMapZoomIntent();
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2 || !isEventInsideMapZoomSurface(event)) {
        return;
      }

      onMapZoomIntent();
    };

    document.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: true,
    });
    document.addEventListener("dblclick", handleDoubleClick, {
      capture: true,
    });
    document.addEventListener("touchstart", handleTouchStart, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("wheel", handleWheel, { capture: true });
      document.removeEventListener("dblclick", handleDoubleClick, {
        capture: true,
      });
      document.removeEventListener("touchstart", handleTouchStart, {
        capture: true,
      });
    };
  }, [onMapZoomIntent]);
};
