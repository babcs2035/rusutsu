"use client";

import { Portal } from "@radix-ui/react-portal";
import { Maximize2, X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResortFinalizedMap } from "@/features/map/components/ResortFinalizedMap";
import type {
  CourseColorMode,
  ElevationProfileMapPoint,
  JapanResortMapProps,
  MapTileVariant,
  MapViewRestoreRequest,
  MapViewSnapshot,
  SelectedMapFeature,
} from "@/features/map/types";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { cn } from "@/lib/utils";
import type { MapSkiResort } from "@/types/skiResorts";

/**
 * 選択中のコース・リフトの詳細をどこに出すか。
 * - "below": 地図の下に積む（スマホ）
 * - "overlay-left" / "overlay-right": 地図に重ねる
 * - "external": 呼び出し側が別の場所に出す（比較の右パネルなど）。
 *   ただし全画面ではその場所が隠れるので、地図の右に重ねる。
 */
export type FeatureDetailPlacement =
  | "below"
  | "overlay-left"
  | "overlay-right"
  | "external";

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
  /** 詳細の置き場所。既定は地図の下 */
  featureDetailPlacement?: FeatureDetailPlacement;
  /** 未選択時の地図の高さ */
  previewHeightClassName?: string;
  /** 選択時の地図の高さ。残りが下の詳細になる（"below" のときだけ効く） */
  selectedHeightClassName?: string;
  /** 全画面での地図の高さ（選択時。"below" のときだけ効く） */
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
  /**
   * 地図に浮かぶコースマップ用ツールバーを出すか。
   * 比較（デスクトップ）は上の帯に同じものをまとめているので出さない。
   */
  showInlineMapToolbar?: boolean;
  detailViewportResetKey?: number;
  /** 表示設定を呼び出し側で持つ場合に渡す（比較のゲレンデ一覧など） */
  courseColorMode?: CourseColorMode;
  onCourseColorModeChange?: (mode: CourseColorMode) => void;
  showOpenOnly?: boolean;
  onShowOpenOnlyChange?: (showOpenOnly: boolean) => void;
  mapTileVariant?: MapTileVariant;
  onMapTileVariantChange?: (variant: MapTileVariant) => void;
};

/** 地図に重ねる詳細パネルの位置と大きさ */
const OVERLAY_PANEL_CLASS =
  "pointer-events-auto absolute inset-y-2 z-[770] flex min-h-0 w-[min(20rem,55%)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl";

/**
 * 「地図と、選択したコースの詳細」という並びを 1 か所にまとめたもの。
 *
 * 通常表示でも全画面でも同じ情報順にするため、地図の高さと詳細の置き場所
 * 以外は分岐させない（要件: 選択元によって見た目を変えない）。
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
  featureDetailPlacement = "below",
  previewHeightClassName = "h-[210px] shrink-0",
  selectedHeightClassName = "h-[42%] min-h-[190px] shrink-0",
  expandedSelectedHeightClassName = "h-[45%] min-h-[200px] shrink-0",
  allowPreviewInteraction = false,
  blockPreviewPointerEvents = false,
  expandable = true,
  showInlineMapToolbar = true,
  detailViewportResetKey = 0,
  courseColorMode,
  onCourseColorModeChange,
  showOpenOnly,
  onShowOpenOnlyChange,
  mapTileVariant,
  onMapTileVariantChange,
}: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);
  // 全画面で動かした位置を、畳んだあとの小さい地図へ引き継ぐ。
  // 別インスタンスなので、そのままだと拡大する前の見え方に戻ってしまう。
  const expandedViewRef = useRef<MapViewSnapshot | null>(null);
  const [inlineRestoreRequest, setInlineRestoreRequest] =
    useState<MapViewRestoreRequest | null>(null);
  const hasSelection = Boolean(featureDetail);
  const isBelowDetail = featureDetailPlacement === "below";
  // 全画面では呼び出し側の置き場所（比較の右パネル）が隠れるので、右に重ねる
  const placement =
    isExpanded && featureDetailPlacement === "external"
      ? "overlay-right"
      : featureDetailPlacement;
  const isOverlayDetail =
    placement === "overlay-left" || placement === "overlay-right";

  const handleExpandedViewChange = useCallback((view: MapViewSnapshot) => {
    expandedViewRef.current = view;
  }, []);

  const collapse = useCallback(() => {
    const view = expandedViewRef.current;
    setIsExpanded(false);
    if (!view) return;
    setInlineRestoreRequest(current => ({
      ...view,
      key: (current?.key ?? 0) + 1,
    }));
  }, []);

  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 選択中の Escape はコース選択の解除が先（地図側で処理する）
      if (event.key !== "Escape" || hasSelection) return;
      collapse();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [collapse, hasSelection, isExpanded]);

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
      courseColorMode={courseColorMode}
      onCourseColorModeChange={onCourseColorModeChange}
      showOpenOnly={showOpenOnly}
      onShowOpenOnlyChange={onShowOpenOnlyChange}
      mapTileVariant={mapTileVariant}
      onMapTileVariantChange={onMapTileVariantChange}
      selectedFinalizedFeature={selectedFinalizedFeature}
      selectedElevationProfilePoint={selectedElevationProfilePoint}
      onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
      onSelectedElevationProfilePointChange={
        onSelectedElevationProfilePointChange
      }
      onViewChange={
        presentation === "expanded" && isExpanded
          ? handleExpandedViewChange
          : undefined
      }
      restoreViewRequest={
        presentation === "expanded" ? null : inlineRestoreRequest
      }
      detailViewportResetKey={detailViewportResetKey}
    />
  );

  const renderOverlayDetail = () =>
    hasSelection && isOverlayDetail ? (
      <div className="pointer-events-none absolute inset-0 z-[770]">
        <div
          // 選んだコースがこのパネルの下に潜らないよう、地図側から位置を測る
          data-map-feature-detail-overlay={
            placement === "overlay-left" ? "left" : "right"
          }
          className={cn(
            OVERLAY_PANEL_CLASS,
            placement === "overlay-left" ? "left-2" : "right-2",
          )}
        >
          {featureDetail}
        </div>
      </div>
    ) : null;

  // 選択中は地図も操作できるようにする（要件: 上側の地図は移動・拡大縮小できる）
  const inlinePresentation =
    allowPreviewInteraction || hasSelection ? "expanded" : "preview";
  // 地図の下に積む形のときだけ、選んだら地図を縮めて場所を空ける
  const inlineHeightClassName =
    hasSelection && isBelowDetail
      ? selectedHeightClassName
      : previewHeightClassName;

  return (
    <>
      <div
        className={cn(
          "relative w-full overflow-hidden border-t border-gray-200 bg-gray-100",
          inlineHeightClassName,
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
            showInlineMapToolbar && allowPreviewInteraction && !hasSelection,
          )}
        </div>
        {!isExpanded && renderOverlayDetail()}
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

      {hasSelection && !isExpanded && isBelowDetail && (
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
                hasSelection && isBelowDetail
                  ? expandedSelectedHeightClassName
                  : "h-full",
              )}
            >
              {renderMap("expanded", !hasSelection)}
              {renderOverlayDetail()}
              {/* 選択中は詳細パネル側の × が「選択解除」を担うため出さない */}
              {(!hasSelection || !isBelowDetail) && (
                <Button
                  type="button"
                  aria-label="地図を閉じる"
                  onClick={collapse}
                  className="absolute z-[780] h-11 w-11 min-w-11 rounded-full border border-gray-200 bg-white/95 p-0 text-gray-700 shadow-md backdrop-blur-sm hover:bg-white hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
                  style={{
                    top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
                    // 右に詳細を重ねているときは、その下に隠れないよう左へ逃がす
                    ...(hasSelection && placement === "overlay-right"
                      ? { left: "0.75rem" }
                      : { right: "0.75rem" }),
                  }}
                >
                  <X size={20} strokeWidth={2.5} />
                </Button>
              )}
            </div>
            {hasSelection && isBelowDetail && (
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
