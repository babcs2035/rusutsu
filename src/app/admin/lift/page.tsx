import type { Metadata } from "next";
import { getSkiResortsForMap } from "@/actions/skiResorts";
import { listCrawlerCoveredResortIds } from "@/features/latest-status-mapping/server/crawlerAvailability";
import { LiftEditClient } from "@/features/lift/LiftEditClient";
import {
  computeLiftBeforeCentroid,
  listLiftBeforeResortIds,
  readLiftConfirmedMap,
} from "@/features/lift/server/liftFiles";
import type { ResortOption } from "@/features/lift/types";
import { getResortLabelName, getResortSearchName } from "@/lib/resortAliases";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "リフト入力 | 管理画面",
};

export default async function LiftEditPage() {
  const [resorts, liftBeforeIds, confirmedMap, crawlerLiftIds] =
    await Promise.all([
      getSkiResortsForMap(),
      listLiftBeforeResortIds(),
      readLiftConfirmedMap(),
      listCrawlerCoveredResortIds("lifts"),
    ]);
  const liftBeforeIdSet = new Set(liftBeforeIds);
  const resortIdSet = new Set(resorts.map(resort => resort.id));

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
    hasLiftBefore: liftBeforeIdSet.has(resort.id),
    hasCrawlerLifts: crawlerLiftIds.has(resort.id),
    confirmedAt: confirmedMap[resort.id] ?? null,
    isKnownResort: true,
  }));

  // shiga-kogen-central のように、意図的に DB のスキー場と対応しない
  // 仮 ID で lift_before だけが存在するものも選択できるようにする
  const orphanIds = liftBeforeIds.filter(id => !resortIdSet.has(id)).sort();
  const orphanOptions: ResortOption[] = [];
  for (const id of orphanIds) {
    const centroid = await computeLiftBeforeCentroid(id);
    orphanOptions.push({
      id,
      nameJa: "",
      searchName: getResortSearchName(id, id),
      // DB に名前が無いので ID をそのままラベルに出す
      labelName: getResortLabelName(id, id),
      nameEn: "",
      prefecture: "",
      latitude: centroid?.latitude ?? 0,
      longitude: centroid?.longitude ?? 0,
      numberOfCourses: 0,
      hasLiftBefore: true,
      hasCrawlerLifts: crawlerLiftIds.has(id),
      confirmedAt: confirmedMap[id] ?? null,
      isKnownResort: false,
    });
  }

  return (
    <LiftEditClient
      resorts={[...resortOptions, ...orphanOptions]}
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
    />
  );
}
