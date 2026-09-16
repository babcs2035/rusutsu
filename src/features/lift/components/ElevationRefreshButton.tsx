"use client";

import { ElevationRefreshButton as SharedButton } from "@/shared/components/resort-editor/ElevationRefreshButton";

export function ElevationRefreshButton({ resortId }: { resortId: string }) {
  return <SharedButton resortId={resortId} kind="lift" />;
}
