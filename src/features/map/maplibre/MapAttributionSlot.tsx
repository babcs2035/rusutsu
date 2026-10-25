"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

/** MapLibreが管理する出典リンクと開閉操作を、そのまま操作行へ移す。 */
export function MapAttributionSlot({ map }: { map: MapLibreMap | null }) {
  const slotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const slot = slotRef.current;
    const control = map
      ?.getContainer()
      .querySelector<HTMLElement>(".maplibregl-ctrl-attrib");
    if (!slot || !control) return;
    const originalParent = control.parentElement;
    const nextSibling = control.nextSibling;
    slot.appendChild(control);
    return () => {
      if (!originalParent) return;
      if (nextSibling?.parentNode === originalParent)
        originalParent.insertBefore(control, nextSibling);
      else originalParent.appendChild(control);
    };
  }, [map]);
  return (
    <div
      ref={slotRef}
      data-map-attribution="true"
      className="ml-auto shrink-0 [&_.maplibregl-ctrl-attrib]:!m-0 [&_.maplibregl-ctrl-attrib]:!float-none [&_.maplibregl-ctrl-attrib]:!min-h-5 [&_.maplibregl-ctrl-attrib]:!py-0 [&_.maplibregl-ctrl-attrib]:!pr-5 [&_.maplibregl-ctrl-attrib]:!pl-1 [&_.maplibregl-ctrl-attrib]:!text-[10px] [&_.maplibregl-ctrl-attrib]:!leading-5 [&_.maplibregl-ctrl-attrib-button]:!size-5 [&_.maplibregl-ctrl-attrib-button]:!top-0 [&_.maplibregl-ctrl-attrib-button]:!right-0 [&_.maplibregl-ctrl-attrib-button]:[background-size:20px_20px]"
    />
  );
}
