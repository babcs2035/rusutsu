"use client";

import dynamic from "next/dynamic";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type { ResortOption } from "./types";

// Leaflet は window に依存するため SSR を無効化して読み込む
const LiftEditWorkspace = dynamic(
  () => import("./LiftEditWorkspace").then(module => module.LiftEditWorkspace),
  {
    ssr: false,
    loading: () => <LoadingSpinner />,
  },
);

type LiftEditClientProps = {
  resorts: ResortOption[];
  googleMapsApiKey: string | null;
};

export function LiftEditClient(props: LiftEditClientProps) {
  return <LiftEditWorkspace {...props} />;
}
