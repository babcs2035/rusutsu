"use client";

import { List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import type { FinalizedLiftFeature } from "@/lib/finalizedResortGeojsonShared";
import type { FinalizedCourseGroup } from "../types";
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
  courseGroup: FinalizedCourseGroup | null;
  lift: FinalizedLiftFeature | null;
  /** 地図のラベルに出している省略名。検索語の組み立てに使う */
  resortLabelName: string;
  courseSourceUrls: string[];
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
  // 難易度は下の見出しに出るので、ヘッダーには出さない
  const subtitle = courseGroup ? null : (lift?.properties.type ?? "リフト");

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-2 md:px-6">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-gray-900 font-[var(--font-heading)] md:text-lg">
            {title}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs font-semibold leading-none text-gray-500">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onOpenList && (
            <Button
              type="button"
              variant="outline"
              className="h-8 gap-1 px-2.5 text-xs font-semibold text-gray-700"
              onClick={onOpenList}
            >
              <List size={14} />
              {isCourse ? "コース一覧へ" : "リフト一覧へ"}
            </Button>
          )}
          <Button
            type="button"
            aria-label="選択を解除する"
            variant="ghost"
            className="h-9 w-9 min-w-9 rounded-full border border-gray-200 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            onClick={onClose}
          >
            <X size={18} strokeWidth={2.5} />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        {courseGroup ? (
          <SelectedCourseDetail
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
            lift={lift}
            resortLabelName={resortLabelName}
            sourceUrls={liftSourceUrls}
          />
        ) : null}
      </div>
    </div>
  );
};
