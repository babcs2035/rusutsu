import type { Metadata } from "next";
import { cache } from "react";
import { getSkiResortsForMap } from "@/actions/skiResorts";
import { HomeClient } from "@/features/home/HomeClient";
import { createShareMetadata } from "@/server/share/metadata";
import { createCompareUrlCodec } from "@/shared/utils/comparePath";

export const dynamic = "force-dynamic";

const getResorts = cache(getSkiResortsForMap);
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[] }>;
}): Promise<Metadata> {
  const { c } = await searchParams;
  if (!c) return {};
  const resorts = await getResorts();
  const byId = new Map(resorts.map(resort => [resort.id, resort]));
  const ids = createCompareUrlCodec(resorts).decode(
    Array.isArray(c) ? (c[0] ?? "") : c,
  );
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
