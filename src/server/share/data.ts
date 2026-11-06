import { cache } from "react";
import { getSkiResortsForMap } from "@/actions/skiResorts";
import { shareMapData } from "@/features/share/mapCard";
import { getFinalizedResortMapData } from "@/lib/finalizedResortGeojson";

export const getShareResorts = cache(getSkiResortsForMap);

export async function getShareMaps(ids: string[]) {
  const resorts = new Map(
    (await getShareResorts()).map(resort => [resort.id, resort]),
  );
  return Promise.all(
    ids.map(async id => {
      const resort = resorts.get(id);
      if (!resort) return null;
      return {
        resort,
        mapData: shareMapData(await getFinalizedResortMapData(id)),
      };
    }),
  );
}
export async function getShareResort(id: string) {
  return (await getShareMaps([id]))[0];
}
export type ShareResort = NonNullable<
  Awaited<ReturnType<typeof getShareResort>>
>;
