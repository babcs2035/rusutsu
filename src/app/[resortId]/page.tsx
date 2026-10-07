import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getSkiResortsForMap } from "@/actions/skiResorts";
import { HomeClient } from "@/features/home/HomeClient";
import { isResortIdSegment } from "@/shared/utils/resortPath";

export const dynamic = "force-dynamic";

// ホームと同じ画面を、URL のスキー場を選択した状態で開く。
const getResorts = cache(getSkiResortsForMap);
type Props = { params: Promise<{ resortId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { resortId } = await params;
  const resort = isResortIdSegment(resortId)
    ? (await getResorts()).find(item => item.id === resortId)
    : undefined;
  return resort ? { title: resort.nameJa } : {};
}

export default async function ResortPage({ params }: Props) {
  const { resortId } = await params;
  if (!isResortIdSegment(resortId)) notFound();
  const skiResorts = await getResorts();
  if (!skiResorts.some(resort => resort.id === resortId)) notFound();
  return <HomeClient initialResorts={skiResorts} />;
}
