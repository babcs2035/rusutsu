import type { SkiResortDetail } from "@/types/skiResorts";
import { planResortTiles } from "./tilePlan";

/** 未表示のタブも static import 済み。地図の分割 chunk はここで明示的に読み込む。 */
export async function prepareDetail(data: SkiResortDetail, dataSaved: boolean) {
  if (
    process.env.NODE_ENV !== "production" ||
    !("serviceWorker" in navigator) ||
    !navigator.onLine
  )
    return;
  try {
    await import("@/features/map/MapLibreResortMap");
    const registration = await navigator.serviceWorker.ready;
    const geometry = data.finalizedMapData;
    const coordinates = [
      ...(geometry?.courses?.features.flatMap(item => item.coordinates) ?? []),
      ...(geometry?.lifts?.features.flatMap(item => item.coordinates) ?? []),
    ];
    if (!coordinates.length) coordinates.push([data.longitude, data.latitude]);
    const plan = planResortTiles(coordinates, {
      width: Math.max(window.innerWidth, window.screen.width),
      height: Math.max(window.innerHeight, window.screen.height),
      pixelRatio: window.devicePixelRatio,
    });
    registration.active?.postMessage({
      type: "SAVE_DETAIL",
      id: data.id,
      tiles: plan.urls,
      complete: plan.complete && dataSaved,
      minZoom: plan.minZoom,
      maxZoom: plan.maxZoom,
      assets: performance.getEntriesByType("resource").map(entry => entry.name),
      images: (data.trailMapLinks?.mapUrls ?? [])
        .filter(item => !/\.pdf($|\?)/i.test(item.url))
        .map(item => item.url),
    });
  } catch {
    /* 次のオンライン復帰時に再試行する。 */
  }
}
