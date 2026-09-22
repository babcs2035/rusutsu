import type { Metadata } from "next";
import {
  listCrawlerCoveredResortIds,
  listMappedResortIds,
} from "@/features/latest-status-mapping/server/crawlerAvailability";
import { SlopeEditClient } from "@/features/slope/SlopeEditClient";
import { readOsmSlopeConfirmedMap } from "@/features/slope/server/slopeConfirmation";
import { listSlopeBeforeResortIds } from "@/features/slope/server/slopeFiles";
import type { ResortOption } from "@/features/slope/types";
import { getResortLabelName, getResortSearchName } from "@/lib/resortAliases";
import { readSkiResortsForMap } from "@/lib/skiResortData";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "コース入力 | 管理画面",
};

export default async function SlopeEditPage() {
  const [
    resorts,
    slopeBeforeIds,
    slopeBeforeOsmIds,
    crawlerCourseIds,
    mappedCourseIds,
    osmConfirmedMap,
  ] = await Promise.all([
    readSkiResortsForMap(),
    listSlopeBeforeResortIds(),
    listSlopeBeforeResortIds("osm"),
    listCrawlerCoveredResortIds("courses"),
    listMappedResortIds("courses"),
    readOsmSlopeConfirmedMap(),
  ]);
  const slopeBeforeIdSet = new Set(slopeBeforeIds);
  const slopeBeforeOsmIdSet = new Set(slopeBeforeOsmIds);

  const resortOptions: ResortOption[] = resorts.map(resort => ({
    id: resort.id,
    nameJa: resort.nameJa,
    searchName: getResortSearchName(resort.id, resort.nameJa, resort.shortName),
    labelName: getResortLabelName(resort.id, resort.nameJa, resort.shortName),
    nameEn: resort.nameEn,
    prefecture: resort.prefecture,
    latitude: resort.latitude,
    longitude: resort.longitude,
    numberOfCourses: resort.numberOfCourses,
    hasSlopeBefore: slopeBeforeIdSet.has(resort.id),
    hasSlopeBeforeOsm: slopeBeforeOsmIdSet.has(resort.id),
    osmConfirmedAt: osmConfirmedMap[resort.id] ?? null,
    hasCrawlerCourses: crawlerCourseIds.has(resort.id),
    hasCourseMapping: mappedCourseIds.has(resort.id),
  }));

  return (
    <SlopeEditClient
      resorts={resortOptions}
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
    />
  );
}
