import type { Metadata } from "next";
import { MapSplitClient } from "@/features/map-split/MapSplitClient";
import { readSplitAreas } from "@/features/map-split/server/splitAreas";
import { requireAdminPage } from "@/server/edit-requests/authPages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "地図の分割 | 管理画面",
};

/** 合体した地図をスキー場ごとに振り分ける一時ページ。作業が終わったら削除する */
export default async function MapSplitPage() {
  await requireAdminPage();
  return (
    <MapSplitClient
      areas={await readSplitAreas()}
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
    />
  );
}
