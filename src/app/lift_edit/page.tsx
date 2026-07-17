import type { Metadata } from "next";
import { getSkiResortsForMap } from "@/actions/skiResorts";
import { LiftEditClient } from "@/features/lift-edit/LiftEditClient";
import {
  listLiftBeforeResortIds,
  readLiftConfirmedMap,
} from "@/features/lift-edit/server/liftFiles";
import type { ResortOption } from "@/features/lift-edit/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "リフト入力",
};

export default async function LiftEditPage() {
  const [resorts, liftBeforeIds, confirmedMap] = await Promise.all([
    getSkiResortsForMap(),
    listLiftBeforeResortIds(),
    readLiftConfirmedMap(),
  ]);
  const liftBeforeIdSet = new Set(liftBeforeIds);

  const resortOptions: ResortOption[] = resorts.map(resort => ({
    id: resort.id,
    nameJa: resort.nameJa,
    nameEn: resort.nameEn,
    prefecture: resort.prefecture,
    latitude: resort.latitude,
    longitude: resort.longitude,
    hasLiftBefore: liftBeforeIdSet.has(resort.id),
    confirmedAt: confirmedMap[resort.id] ?? null,
  }));

  return (
    <LiftEditClient
      resorts={resortOptions}
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
    />
  );
}
