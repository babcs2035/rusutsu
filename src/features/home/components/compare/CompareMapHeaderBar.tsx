"use client";

import { FinalizedMapToolbar } from "@/features/map/components/FinalizedMapToolbar";
import type { CourseColorMode, MapTileVariant } from "@/features/map/types";
import { SegmentedControl } from "@/shared/components/SegmentedControl";
import type { CompareLeftPane } from "./types";

const PANE_OPTIONS = [
  { value: "slope", label: "ゲレンデ" },
  { value: "access", label: "アクセス" },
] as const satisfies readonly { value: CompareLeftPane; label: string }[];

/**
 * 比較（デスクトップ）の地図エリア上部にかぶせる白い帯。
 *
 * 左の地図エリアを何で埋めるかの切替と、コースマップの表示設定を 1 か所に置く。
 * 表示設定は比較中のスキー場すべてに同じものが効く。
 * 下のゲレンデ一覧はこの帯の下をスクロールするので、帯は常に見えている。
 */
export const CompareMapHeaderBar = ({
  pane,
  onPaneChange,
  courseColorMode,
  onCourseColorModeChange,
  showOpenOnly,
  onShowOpenOnlyChange,
  mapTileVariant,
  onMapTileVariantChange,
  hasCourses,
  hasLifts,
}: {
  pane: CompareLeftPane;
  onPaneChange: (pane: CompareLeftPane) => void;
  courseColorMode: CourseColorMode;
  onCourseColorModeChange: (mode: CourseColorMode) => void;
  showOpenOnly: boolean;
  onShowOpenOnlyChange: (showOpenOnly: boolean) => void;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  hasCourses: boolean;
  hasLifts: boolean;
}) => (
  <div
    data-compare-map-header="true"
    className="pointer-events-auto flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-gray-200 bg-white px-3 py-2 shadow-sm"
  >
    <SegmentedControl
      options={PANE_OPTIONS}
      value={pane}
      onChange={onPaneChange}
      radius="full"
      separators
      itemClassName="h-9 px-4 text-sm"
      ariaLabel={option => `左の地図を${option.label}に切り替え`}
    />
    {pane === "slope" && (
      <FinalizedMapToolbar
        presentation="bar"
        mode={courseColorMode}
        onModeChange={onCourseColorModeChange}
        hasCourses={hasCourses}
        hasLifts={hasLifts}
        showOpenOnly={showOpenOnly}
        onShowOpenOnlyChange={onShowOpenOnlyChange}
        mapTileVariant={mapTileVariant}
        onMapTileVariantChange={onMapTileVariantChange}
        className="min-w-0 flex-1"
      />
    )}
  </div>
);
