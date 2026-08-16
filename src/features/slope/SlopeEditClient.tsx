"use client";

import dynamic from "next/dynamic";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type { ResortOption } from "./types";

// Leaflet は window に依存するため SSR を無効化して読み込む
const SlopeEditWorkspace = dynamic(
  () =>
    import("./SlopeEditWorkspace").then(module => module.SlopeEditWorkspace),
  {
    ssr: false,
    loading: () => <LoadingSpinner />,
  },
);

type SlopeEditClientProps = {
  resorts: ResortOption[];
  googleMapsApiKey: string | null;
};

export function SlopeEditClient(props: SlopeEditClientProps) {
  return <SlopeEditWorkspace {...props} />;
}
