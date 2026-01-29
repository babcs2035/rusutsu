import { getSkiResortsForMap } from "@/actions/skiResorts";
import { HomeClient } from "@/components/HomeClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const skiResorts = await getSkiResortsForMap();
  return <HomeClient initialResorts={skiResorts} />;
}
