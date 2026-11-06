import type { Metadata } from "next";
import { cache } from "react";
import { getSkiResortsForMap } from "@/actions/skiResorts";
import { HomeClient } from "@/features/home/HomeClient";
import { createShareMetadata } from "@/server/share/metadata";
import { parseCompareIds } from "@/shared/utils/comparePath";

export const dynamic = "force-dynamic";

const getResorts = cache(getSkiResortsForMap);
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ compare?: string | string[] }>;
}): Promise<Metadata> {
  const { compare } = await searchParams;
  if (!compare) return {};
  const resorts = await getResorts();
  const byId = new Map(resorts.map(resort => [resort.id, resort]));
  const ids = parseCompareIds(compare, new Set(byId.keys()));
  return createShareMetadata(
    ids.flatMap(id => {
      const resort = byId.get(id);
      return resort ? [resort] : [];
    }),
    true,
  );
}

export default async function Home() {
  const skiResorts = await getResorts();
  return <HomeClient initialResorts={skiResorts} />;
}
