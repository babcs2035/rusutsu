import type { Metadata } from "next";
import { getSkiResortsForMap } from "@/actions/skiResorts";
import { AdminHeader } from "@/components/AdminHeader";
import { LiftEditClient } from "@/features/lift-edit/LiftEditClient";
import {
  computeLiftBeforeCentroid,
  listLiftBeforeResortIds,
  readLiftConfirmedMap,
} from "@/features/lift-edit/server/liftFiles";
import type { ResortOption } from "@/features/lift-edit/types";
import { getResortSearchName } from "@/lib/resortAliases";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "リフト入力 | 管理画面",
};

export default async function LiftEditPage() {
  const [resorts, liftBeforeIds, confirmedMap] = await Promise.all([
    getSkiResortsForMap(),
    listLiftBeforeResortIds(),
    readLiftConfirmedMap(),
  ]);
  const liftBeforeIdSet = new Set(liftBeforeIds);
  const resortIdSet = new Set(resorts.map(resort => resort.id));

  const resortOptions: ResortOption[] = resorts.map(resort => ({
    id: resort.id,
    nameJa: resort.nameJa,
    searchName: getResortSearchName(resort.id, resort.nameJa),
    nameEn: resort.nameEn,
    prefecture: resort.prefecture,
    latitude: resort.latitude,
    longitude: resort.longitude,
    hasLiftBefore: liftBeforeIdSet.has(resort.id),
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
      nameEn: "",
      prefecture: "",
      latitude: centroid?.latitude ?? 0,
      longitude: centroid?.longitude ?? 0,
      hasLiftBefore: true,
      confirmedAt: confirmedMap[id] ?? null,
      isKnownResort: false,
    });
  }

  return (
    <div>
      <AdminHeader />
      <LiftEditClient
        resorts={[...resortOptions, ...orphanOptions]}
        googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
      />
    </div>
  );
}
