import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  listCrawlerCoveredResortIds,
  listMappedResortIds,
} from "@/features/latest-status-mapping/server/crawlerAvailability";
import { SlopeEditClient } from "@/features/slope/SlopeEditClient";
import { readOsmSlopeConfirmedMap } from "@/features/slope/server/slopeConfirmation";
import { listSlopeBeforeResortIds } from "@/features/slope/server/slopeFiles";
import type { ResortOption } from "@/features/slope/types";
import { getResortLabelName, getResortSearchName } from "@/lib/resortAliases";
import { readSkiResortsForEditor } from "@/lib/skiResortData";
import { requireEditingPage } from "@/server/edit-requests/authPages";
import { getRequestEditContext } from "@/server/edit-requests/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "コース入力 | 管理画面",
};

export default async function SlopeEditPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  await requireEditingPage();
  const requestId = (await searchParams).request;
  const editRequest = requestId
    ? await getRequestEditContext(requestId, "slope")
    : null;
  // 管理者以外や処理済みの申請は、編集画面ではなく申請の確認画面で見る
  if (requestId && !editRequest)
    redirect(`/admin/requests/${encodeURIComponent(requestId)}`);
  const [
    resorts,
    slopeBeforeIds,
    slopeBeforeOsmIds,
    crawlerCourseIds,
    mappedCourseIds,
    osmConfirmedMap,
  ] = await Promise.all([
    readSkiResortsForEditor(),
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
      editRequest={editRequest}
      resorts={resortOptions}
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
    />
  );
}
