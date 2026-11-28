"use client";

import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommunityFeed } from "@/features/community/CommunityFeed";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import type {
  FinalizedLiftFeature,
  FinalizedResortMapData,
} from "@/lib/finalizedResortGeojsonShared";
import { PanelCloseButton } from "@/shared/components/PanelCloseButton";
import type { FinalizedCourseGroup } from "../types";
import { getCourseGroupTags } from "../utils/detailMetrics";
import { FeatureTags } from "./FeatureHeadline";
import { SelectedCourseDetail } from "./SelectedCourseDetail";
import { SelectedLiftDetail } from "./SelectedLiftDetail";

/**
 * 選択中のコース・リフトの詳細。
 *
 * 地図の下（モバイル・比較）と、スキー場説明パネルの上（デスクトップ）で
 * 同じ見た目・同じ情報順にする。
 * 「×」は選択だけを解除して、選ぶ前の画面（全画面地図・一覧）へ戻す。
 */
export const FinalizedFeatureDetail = ({
  resortId,
  mapData,
  courseGroup,
  lift,
  resortLabelName,
  resortSearchWordName,
  courseSourceUrls,
  liftSourceUrls,
  selectedElevationProfilePoint,
  onSelectedElevationProfilePointChange,
  onClose,
  onOpenList,
}: {
  resortId?: string;
  /** 表示中のスキー場の地図データ。コース比較の地図に使い回す */
  mapData?: FinalizedResortMapData | null;
  courseGroup: FinalizedCourseGroup | null;
  lift: FinalizedLiftFeature | null;
  /** 地図のラベルに出している省略名。検索語の組み立てに使う */
  resortLabelName: string;
  /** 動画検索語の先頭に付ける正式名（「スキー場」込み） */
  resortSearchWordName: string;
  courseSourceUrls: string[];
  courseObservedAt?: string | null;
  liftObservedAt?: string | null;
  courseVerificationStatus?: "verified" | "unverified" | "mixed";
  liftSourceUrls: string[];
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
  onClose: () => void;
  /** 一覧へ戻る導線。地図の下に出す形（× で一覧へ戻る）では渡さない */
  onOpenList?: () => void;
}) => {
  if (!courseGroup && !lift) return null;

  const isCourse = Boolean(courseGroup);
  const title = courseGroup?.displayName ?? lift?.name ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-3 py-2.5 md:px-4">
        {/* 長い名前は折り返し、チップは名前の文末にそのまま続ける */}
        <div className="min-w-0 pt-0.5 leading-7 [&>span]:mr-1">
          <h2 className="mr-1.5 inline break-words align-middle text-base leading-snug font-semibold text-gray-900 font-heading">
            {title}
          </h2>
          {courseGroup ? (
            <FeatureTags {...getCourseGroupTags(courseGroup)} />
          ) : lift ? (
            <FeatureTags
              tags={[
                lift.properties.type ?? "リフト",
                ...(lift.properties.speed ? [lift.properties.speed] : []),
              ]}
            />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onOpenList && (
            <Button
              type="button"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs font-semibold text-gray-700 md:h-8 md:px-2.5"
              onClick={onOpenList}
            >
              <List size={14} />
              {isCourse ? "コース一覧" : "リフト一覧"}
            </Button>
          )}
          <PanelCloseButton label="選択を解除する" onClose={onClose} />
        </div>
      </div>

      {/* 上余白は内側に置き、sticky タブがスクロール領域の上端まで届くようにする。 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-3 md:p-4">
          {courseGroup ? (
            <SelectedCourseDetail
              key={JSON.stringify([
                resortId,
                ...courseGroup.courses.map(course => course.id),
              ])}
              resortId={resortId}
              mapData={mapData}
              courseGroup={courseGroup}
              resortLabelName={resortLabelName}
              resortSearchWordName={resortSearchWordName}
              sourceUrls={courseSourceUrls}
              selectedElevationProfilePoint={selectedElevationProfilePoint}
              onSelectedElevationProfilePointChange={
                onSelectedElevationProfilePointChange
              }
            />
          ) : lift ? (
            <SelectedLiftDetail
              key={lift.id}
              resortId={resortId}
              lift={lift}
              resortSearchWordName={resortSearchWordName}
              sourceUrls={liftSourceUrls}
              selectedElevationProfilePoint={selectedElevationProfilePoint}
              onSelectedElevationProfilePointChange={
                onSelectedElevationProfilePointChange
              }
            />
          ) : null}
          {resortId && (courseGroup || lift) && (
            <div className="mt-3 border-t pt-3">
              <CommunityFeed
                resortId={resortId}
                courseId={courseGroup?.id}
                liftId={lift?.id}
                compact
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
