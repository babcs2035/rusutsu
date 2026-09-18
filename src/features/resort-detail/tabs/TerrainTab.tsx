"use client";

import type { SelectedMapFeature } from "@/features/map/types";
import type { Resort } from "../types";
import { CoursesTab } from "./CoursesTab";
import { LiftsTab } from "./LiftsTab";

/**
 * コースかリフトのどちらか一方だけを見せる。
 * ここへは「コースの詳細」「リフトの詳細」から入るので、
 * もう一方へ切り替えるタブは出さない（開いたつもりの情報だけを見せる）。
 */
export function TerrainTab({
  resort,
  activeTab,
  selectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
}: {
  resort: Resort;
  activeTab: "コース" | "リフト";
  selectedFinalizedFeature: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
}) {
  const map = resort.finalizedMapData;
  const props = {
    resort,
    finalizedMapData: map ?? null,
    selectedFinalizedFeature,
    onSelectedFinalizedFeatureChange,
  };
  return (
    <div className="space-y-3">
      {activeTab === "コース" ? (
        <CoursesTab {...props} />
      ) : (
        <LiftsTab {...props} />
      )}
    </div>
  );
}
