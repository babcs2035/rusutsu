import type { Metadata } from "next";
import { getSkiResortsForMap } from "@/actions/skiResorts";
import { SlopeEditClient } from "@/features/slope-edit/SlopeEditClient";
import { listSlopeBeforeResortIds } from "@/features/slope-edit/server/slopeFiles";
import type { ResortOption } from "@/features/slope-edit/types";
import { getResortSearchName } from "@/lib/resortAliases";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "コース入力",
};

export default async function SlopeEditPage() {
  const [resorts, slopeBeforeIds] = await Promise.all([
    getSkiResortsForMap(),
    listSlopeBeforeResortIds(),
  ]);
  const slopeBeforeIdSet = new Set(slopeBeforeIds);

  const resortOptions: ResortOption[] = resorts.map(resort => ({
    id: resort.id,
    nameJa: resort.nameJa,
    searchName: getResortSearchName(resort.id, resort.nameJa),
    nameEn: resort.nameEn,
    prefecture: resort.prefecture,
    latitude: resort.latitude,
    longitude: resort.longitude,
    hasSlopeBefore: slopeBeforeIdSet.has(resort.id),
  }));

  return (
    <SlopeEditClient
      resorts={resortOptions}
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
    />
  );
}
