"use client";

import dynamic from "next/dynamic";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type { ResortOption } from "./types";

// Leaflet は window に依存するため SSR を無効化して読み込む
// loading 表示はヘッダー（h-16 = 4rem）を除く画面中央に配置する
// （LoadingSpinner は h-full のため，親に確定した高さをここで渡す）
const SlopeEditWorkspace = dynamic(
  () =>
    import("./SlopeEditWorkspace").then(module => module.SlopeEditWorkspace),
  {
    ssr: false,
    loading: () => <LoadingSpinner className="h-[calc(100dvh-4rem)]" />,
  },
);

type SlopeEditClientProps = {
  resorts: ResortOption[];
  googleMapsApiKey: string | null;
};

export function SlopeEditClient(props: SlopeEditClientProps) {
  return <SlopeEditWorkspace {...props} />;
}
