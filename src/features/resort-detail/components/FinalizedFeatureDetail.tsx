"use client";

import { List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimilarCourses } from "@/features/course-recommendations/SimilarCourses";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import type { FinalizedLiftFeature } from "@/lib/finalizedResortGeojsonShared";
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
  courseGroup,
  lift,
  resortLabelName,
  courseSourceUrls,
  liftSourceUrls,
  selectedElevationProfilePoint,
  onSelectedElevationProfilePointChange,
  onClose,
  onOpenList,
}: {
  resortId?: string;
  courseGroup: FinalizedCourseGroup | null;
  lift: FinalizedLiftFeature | null;
  /** 地図のラベルに出している省略名。検索語の組み立てに使う */
  resortLabelName: string;
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
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-gray-200 py-2 pr-2 pl-3 md:pr-3 md:pl-4">
        {/* 長い名前は2行まで折り返し、レベル・圧雪は名前のすぐ後ろに続ける */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 pt-0.5">
          <h2 className="min-w-0 break-words text-base leading-snug font-bold text-gray-900 font-[var(--font-heading)] md:text-lg">
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
          <Button
            type="button"
            aria-label="選択を解除する"
            variant="ghost"
            className="size-7 min-w-7 rounded-full border border-gray-200 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900 md:size-8 md:min-w-8"
            onClick={onClose}
          >
            <X size={16} strokeWidth={2.5} />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
        {courseGroup ? (
          <SelectedCourseDetail
            key={JSON.stringify([
              resortId,
              ...courseGroup.courses.map(course => course.id),
            ])}
            similarCourses={
              resortId ? (
                <SimilarCourses
                  resortId={resortId}
                  resortName={resortLabelName}
                  courseGroup={courseGroup}
                />
              ) : null
            }
            courseGroup={courseGroup}
            resortLabelName={resortLabelName}
            sourceUrls={courseSourceUrls}
            selectedElevationProfilePoint={selectedElevationProfilePoint}
            onSelectedElevationProfilePointChange={
              onSelectedElevationProfilePointChange
            }
          />
        ) : lift ? (
          <SelectedLiftDetail
            key={lift.id}
            lift={lift}
            resortLabelName={resortLabelName}
            sourceUrls={liftSourceUrls}
          />
        ) : null}
      </div>
    </div>
  );
};
