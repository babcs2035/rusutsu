"use client";

import { ChevronLeft } from "lucide-react";
import {
  MapCourseStatusControl,
  MapCourseStatusOptions,
} from "@/features/map/components/MapCourseStatusControl";
import type { SelectedMapFeature } from "@/features/map/types";
import {
  getDetailCourseStatusFilter,
  requestDetailCourseStatus,
  useDetailCourseStatus,
} from "@/features/map/utils/detailCourseStatusFilter";
import { CurrentOverview } from "../components/CurrentOverview";
import { useDisplayedResortMapData } from "../components/SimultaneousToggle";
import type { Resort } from "../types";
import { TerrainTab } from "./TerrainTab";

export function OverviewTab({
  resort: sourceResort,
  showTerrainDetail,
  terrainTab,
  onShowTerrainDetail,
  onCloseTerrainDetail,
  selectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
}: {
  resort: Resort;
  /** コース／リフトの一覧・詳細を見せているか（false のときは概要） */
  showTerrainDetail: boolean;
  terrainTab: "コース" | "リフト";
  onShowTerrainDetail: (tab: "コース" | "リフト") => void;
  onCloseTerrainDetail: () => void;
  selectedFinalizedFeature: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
}) {
  // 「〇〇も同時に表示」中は、件数と一覧をつながったスキー場と合わせて出す
  const displayedMapData = useDisplayedResortMapData(sourceResort);
  const courseStatusState = useDetailCourseStatus(sourceResort.id);
  const courseStatusFilter = getDetailCourseStatusFilter(courseStatusState);
  const resort =
    displayedMapData === (sourceResort.finalizedMapData ?? null)
      ? sourceResort
      : { ...sourceResort, finalizedMapData: displayedMapData };
  if (showTerrainDetail) {
    const isCourse = terrainTab === "コース";
    return (
      <div className="space-y-1">
        {/* 上の「ゲレンデ／料金…」タブ（h-9 / md:h-10）の真下で固定する */}
        <div className="sticky top-9 z-10 -mx-3 -mt-3 flex items-center justify-start gap-2 bg-white px-3 py-1.5 md:top-10 md:-mx-4 md:-mt-4 md:px-4">
          <button
            type="button"
            onClick={onCloseTerrainDetail}
            className="flex min-h-7 shrink-0 items-center gap-0.5 rounded-full border border-blue-200 bg-blue-50 py-1 pr-2 pl-1 text-sm font-semibold text-blue-700 hover:border-blue-300 hover:bg-blue-100 active:bg-blue-200"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            戻る
          </button>
          {isCourse && courseStatusState?.enabled && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <MapCourseStatusControl
                inline
                bare
                enabled
                checked={courseStatusState.showOpenOnly}
                settings={courseStatusState.settings}
                onCheckedChange={showOpenOnly =>
                  requestDetailCourseStatus(resort.id, { showOpenOnly })
                }
                onSettingsChange={settings =>
                  requestDetailCourseStatus(resort.id, { settings })
                }
              />
              {courseStatusFilter && (
                <MapCourseStatusOptions
                  className="w-auto justify-start gap-2"
                  settings={courseStatusState.settings}
                  onChange={settings =>
                    requestDetailCourseStatus(resort.id, { settings })
                  }
                />
              )}
            </div>
          )}
        </div>
        <TerrainTab
          resort={resort}
          activeTab={terrainTab}
          selectedFinalizedFeature={selectedFinalizedFeature}
          onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
        />
      </div>
    );
  }
  return (
    <CurrentOverview
      resort={resort}
      onShowCourseDetail={() => onShowTerrainDetail("コース")}
      onShowLiftDetail={() => onShowTerrainDetail("リフト")}
    />
  );
}
