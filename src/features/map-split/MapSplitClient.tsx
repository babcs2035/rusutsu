"use client";

import dynamic from "next/dynamic";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type { SplitArea } from "./types";

// MapLibre は window に依存するため SSR を無効化して読み込む
const MapSplitWorkspace = dynamic(
  () => import("./MapSplitWorkspace").then(module => module.MapSplitWorkspace),
  {
    ssr: false,
    loading: () => <LoadingSpinner className="h-[100dvh]" />,
  },
);

export function MapSplitClient(props: {
  areas: SplitArea[];
  googleMapsApiKey: string | null;
}) {
  return <MapSplitWorkspace {...props} />;
}
