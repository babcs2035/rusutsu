"use client";

import { Portal } from "@radix-ui/react-portal";
import { Maximize2, X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResortFinalizedMap } from "@/features/map/components/ResortFinalizedMap";
import type {
  ElevationProfileMapPoint,
  JapanResortMapProps,
  SelectedMapFeature,
} from "@/features/map/types";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { cn } from "@/lib/utils";
import type { MapSkiResort } from "@/types/skiResorts";

type Props = {
  DynamicMap: ComponentType<JapanResortMapProps>;
  resortId: string;
  finalizedMapData: FinalizedResortMapData | null;
  mapResorts: MapSkiResort[];
  selectedFinalizedFeature: SelectedMapFeature | null;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
  /** 選択中のコース・リフトの詳細。未選択なら null */
  featureDetail: ReactNode | null;
  /** 未選択時の地図の高さ */
  previewHeightClassName?: string;
  /** 選択時の地図の高さ。残りが下の詳細になる */
  selectedHeightClassName?: string;
  /** 全画面での地図の高さ（選択時） */
  expandedSelectedHeightClassName?: string;
  /** 未選択のプレビューでも地図を動かせるようにするか */
  allowPreviewInteraction?: boolean;
  /**
   * プレビューへのタップ自体を遮るか。
   * 比較のカルーセルではカード全体の左右スワイプを優先させるために使う。
   * 詳細画面では、プレビューを直接タップしてコースを選べる方が速いので遮らない。
   */
  blockPreviewPointerEvents?: boolean;
  /** 拡大ボタンを出すか */
  expandable?: boolean;
  detailViewportResetKey?: number;
};

/**
 * 「上に地図・下に選択したコースの詳細」という並びを 1 か所にまとめたもの。
 *
 * 通常表示でも全画面でも同じ並び・同じ情報順にするため、
 * 地図の高さ以外は分岐させない（要件: 選択元によって見た目を変えない）。
 * 選択中は全画面右上の × を出さない。詳細パネル側の × が選択だけを解除して、
 * 元の全画面地図・元の一覧へ戻す役目を持つ。
 */
export const ResortMapSection = ({
  DynamicMap,
  resortId,
  finalizedMapData,
  mapResorts,
  selectedFinalizedFeature,
  selectedElevationProfilePoint,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
  featureDetail,
  previewHeightClassName = "h-[210px] shrink-0",
  selectedHeightClassName = "h-[42%] min-h-[190px] shrink-0",
  expandedSelectedHeightClassName = "h-[45%] min-h-[200px] shrink-0",
  allowPreviewInteraction = false,
  blockPreviewPointerEvents = false,
  expandable = true,
  detailViewportResetKey = 0,
}: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasSelection = Boolean(featureDetail);

  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 選択中の Escape はコース選択の解除が先（地図側で処理する）
      if (event.key !== "Escape" || hasSelection) return;
      setIsExpanded(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hasSelection, isExpanded]);

  const renderMap = (
    presentation: "preview" | "expanded",
    showToolbar: boolean,
  ) => (
    <ResortFinalizedMap
      DynamicMap={DynamicMap}
      resortId={resortId}
      finalizedMapData={finalizedMapData}
      mapResorts={mapResorts}
      presentation={presentation}
      showToolbar={showToolbar}
      selectedFinalizedFeature={selectedFinalizedFeature}
      selectedElevationProfilePoint={selectedElevationProfilePoint}
      onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
      onSelectedElevationProfilePointChange={
        onSelectedElevationProfilePointChange
      }
      detailViewportResetKey={detailViewportResetKey}
    />
  );

  // 選択中は地図も操作できるようにする（要件: 上側の地図は移動・拡大縮小できる）
  const inlinePresentation =
    allowPreviewInteraction || hasSelection ? "expanded" : "preview";

  return (
    <>
      <div
        className={cn(
          "relative w-full overflow-hidden border-t border-gray-200 bg-gray-100",
          hasSelection ? selectedHeightClassName : previewHeightClassName,
        )}
      >
        <div
          className={cn(
            "h-full w-full",
            inlinePresentation === "preview" &&
              blockPreviewPointerEvents &&
              "pointer-events-none",
          )}
        >
          {/* 選択中は地図が縮むので、ツールバーは畳んで地図を広く使う */}
          {renderMap(
            inlinePresentation,
            allowPreviewInteraction && !hasSelection,
          )}
        </div>
        {expandable && !isExpanded && (
          <Button
            type="button"
            aria-label="地図を拡大"
            onClick={() => setIsExpanded(true)}
            className="absolute top-2 right-2 z-30 h-9 w-9 min-w-9 rounded-md border border-gray-200 bg-white p-0 text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
          >
            <Maximize2 size={16} strokeWidth={2.5} />
          </Button>
        )}
      </div>

      {hasSelection && !isExpanded && (
        <div className="min-h-0 flex-1 border-t border-gray-200">
          {featureDetail}
        </div>
      )}

      {isExpanded && (
        <Portal>
          <div className="fixed inset-0 z-[300] flex flex-col bg-gray-200">
            <div
              className={cn(
                "relative w-full",
                hasSelection ? expandedSelectedHeightClassName : "h-full",
              )}
            >
              {renderMap("expanded", !hasSelection)}
              {/* 選択中は詳細パネル側の × が「選択解除」を担うため出さない */}
              {!hasSelection && (
                <Button
                  type="button"
                  aria-label="地図を閉じる"
                  onClick={() => setIsExpanded(false)}
                  className="absolute z-[760] h-11 w-11 min-w-11 rounded-full border border-gray-200 bg-white/95 p-0 text-gray-700 shadow-md backdrop-blur-sm hover:bg-white hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
                  style={{
                    top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
                    right: "0.75rem",
                  }}
                >
                  <X size={20} strokeWidth={2.5} />
                </Button>
              )}
            </div>
            {hasSelection && (
              <div className="min-h-0 flex-1 border-t border-gray-200">
                {featureDetail}
              </div>
            )}
          </div>
        </Portal>
      )}
    </>
  );
};
