import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { HomeClient } from "@/features/home/HomeClient";
import { createShareMetadata } from "@/server/share/metadata";
import {
  getSkiResortById,
  getSkiResortsForMap,
} from "@/server/ski-resorts/queries";
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
  return resort ? createShareMetadata([resort]) : {};
}

/** 共有 URL で開いた詳細は一覧と同じサーバー要求で取得する． */
export default async function ResortPage({ params }: Props) {
  const { resortId } = await params;
  if (!isResortIdSegment(resortId)) notFound();
  const skiResorts = await getResorts();
  if (!skiResorts.some(resort => resort.id === resortId)) notFound();
  const initialDetail = await getSkiResortById(resortId).catch(
    (error: unknown) => {
      console.warn("Initial resort detail unavailable", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      return null;
    },
  );
  return (
    <HomeClient initialResorts={skiResorts} initialDetail={initialDetail} />
  );
}
