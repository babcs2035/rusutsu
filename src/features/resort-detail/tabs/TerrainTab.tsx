"use client";

import type { SelectedMapFeature } from "@/features/map/types";
import { UnderlineTabs } from "@/shared/components/UnderlineTabs";
import { CompactMetric } from "../components/CompactInfo";
import { CurrentOverview } from "../components/CurrentOverview";
import type { Resort } from "../types";
import { sumKnown } from "../utils/courseDistribution";
import { formatMeters } from "../utils/detailMetrics";
import { CoursesTab } from "./CoursesTab";
import { LiftsTab } from "./LiftsTab";

export function TerrainTab({
  resort,
  activeTab,
  onTabChange,
  selectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
}: {
  resort: Resort;
  activeTab: "コース" | "リフト";
  onTabChange: (tab: "コース" | "リフト") => void;
  selectedFinalizedFeature: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
}) {
  const map = resort.finalizedMapData;
  const courses = sumKnown(
    map?.courses?.features.length
      ? map.courses.features.map(
          course =>
            course.properties.slopeDistMap ?? course.properties.distance,
        )
      : resort.courses.map(course => course.distance),
  );
  const lifts = sumKnown(
    map?.lifts?.features.length
      ? map.lifts.features.map(
          lift => lift.properties.slopeDistMap ?? lift.properties.distance,
        )
      : resort.lifts.map(lift => lift.distance),
  );
  const props = {
    resort,
    finalizedMapData: map ?? null,
    selectedFinalizedFeature,
    onSelectedFinalizedFeatureChange,
    hideSummary: true,
  };
  return (
    <div className="space-y-3">
      <CurrentOverview resort={resort} summaryOnly />
      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
        <CompactMetric label="コース総滑走距離">
          {formatMeters(courses.total)}
        </CompactMetric>
        <CompactMetric label="リフト総延長">
          {formatMeters(lifts.total)}
        </CompactMetric>
      </dl>
      <p className="text-sm text-slate-500">
        斜面に沿った距離を合計。地形データを優先し、公表値で補完しています。
        {courses.missing > 0 && `コース${courses.missing}区間の距離は不明。`}
        {lifts.missing > 0 && `リフト${lifts.missing}本の距離は不明。`}
      </p>
      <UnderlineTabs
        tabs={["コース", "リフト"] as const}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
      {activeTab === "コース" ? (
        <CoursesTab {...props} />
      ) : (
        <LiftsTab {...props} />
      )}
    </div>
  );
}
