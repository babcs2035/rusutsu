import type { Metadata } from "next";
import { getSkiResortsForMap } from "@/actions/skiResorts";
import { listCrawlerCoveredResortIds } from "@/features/latest-status-mapping/server/crawlerAvailability";
import { SlopeEditClient } from "@/features/slope/SlopeEditClient";
import { listSlopeBeforeResortIds } from "@/features/slope/server/slopeFiles";
import type { ResortOption } from "@/features/slope/types";
import { getResortLabelName, getResortSearchName } from "@/lib/resortAliases";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "コース入力 | 管理画面",
};

export default async function SlopeEditPage() {
  const [resorts, slopeBeforeIds, slopeBeforeOsmIds, crawlerCourseIds] =
    await Promise.all([
      getSkiResortsForMap(),
      listSlopeBeforeResortIds(),
      listSlopeBeforeResortIds("osm"),
      listCrawlerCoveredResortIds("courses"),
    ]);
  const slopeBeforeIdSet = new Set(slopeBeforeIds);
  const slopeBeforeOsmIdSet = new Set(slopeBeforeOsmIds);

  const resortOptions: ResortOption[] = resorts.map(resort => ({
    id: resort.id,
    nameJa: resort.nameJa,
    searchName: getResortSearchName(resort.id, resort.nameJa),
    labelName: getResortLabelName(resort.id, resort.nameJa),
    nameEn: resort.nameEn,
    prefecture: resort.prefecture,
    latitude: resort.latitude,
    longitude: resort.longitude,
    numberOfCourses: resort.numberOfCourses,
    hasSlopeBefore: slopeBeforeIdSet.has(resort.id),
    hasSlopeBeforeOsm: slopeBeforeOsmIdSet.has(resort.id),
    hasCrawlerCourses: crawlerCourseIds.has(resort.id),
  }));

  return (
    <SlopeEditClient
      resorts={resortOptions}
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
    />
  );
}
