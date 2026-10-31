"use client";

import { Portal } from "@radix-ui/react-portal";
import { Maximize2, X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ResortFinalizedMap } from "@/features/map/components/ResortFinalizedMap";
import { useMapSession } from "@/features/map/session/MapSessionProvider";
import {
  mapSessionKey,
  mapSessionSchema,
  readStorage,
  writeStorage,
} from "@/features/map/session/storage";
import type {
  CourseColorMode,
  ElevationProfileMapPoint,
  JapanResortMapProps,
  MapTileVariant,
  SelectedMapFeature,
} from "@/features/map/types";
import {
  DEFAULT_MAP_DISPLAY_SETTINGS,
  type MapDisplaySettings,
  OPEN_COURSE_STATUSES,
} from "@/features/map/utils/mapDisplaySettings";
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
  /** 地図の操作だけにする（投稿中）。拡大・現在地・営業フィルターを出さない */
  minimalControls?: boolean;
  /**
   * 地図に浮かぶコースマップ用ツールバーを出すか。
   * 比較（デスクトップ）は上の帯に同じものをまとめているので出さない。
   */
  showInlineMapToolbar?: boolean;
  /** 投稿中は地図を固定し、下部パネルをドラッグで伸縮する */
  resizableFeatureDetail?: boolean;
  mapTopControls?: ReactNode;
  /** 連携エリアの「〇〇も同時に表示」。小さい地図と拡大地図で大きさを変える */
  linkedAreaControl?: (size: "compact" | "inline") => ReactNode;
  detailViewportResetKey?: number;
  /** 表示設定を呼び出し側で持つ場合に渡す（比較のゲレンデ一覧など） */
  courseColorMode?: CourseColorMode;
  onCourseColorModeChange?: (mode: CourseColorMode) => void;
  mapDisplaySettings?: MapDisplaySettings;
  onMapDisplaySettingsChange?: (settings: MapDisplaySettings) => void;
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
  minimalControls = false,
  showInlineMapToolbar = true,
  resizableFeatureDetail = false,
  mapTopControls,
  linkedAreaControl,
  detailViewportResetKey = 0,
  courseColorMode: controlledCourseColorMode,
  onCourseColorModeChange,
  mapDisplaySettings: controlledMapDisplaySettings,
  onMapDisplaySettingsChange,
  showOpenOnly: controlledShowOpenOnly,
  onShowOpenOnlyChange,
  mapTileVariant: controlledMapTileVariant,
  onMapTileVariantChange,
}: Props) => {
  const [mobilePanelHeight, setMobilePanelHeight] = useState<number | null>(
    null,
  );
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const panelDrag = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    areaHeight: number;
  } | null>(null);
  const blockedPanelPointer = useRef<number | null>(null);
  const [localMapDisplaySettings, setLocalMapDisplaySettings] = useState(
    DEFAULT_MAP_DISPLAY_SETTINGS,
  );
  const mapDisplaySettings =
    controlledMapDisplaySettings ?? localMapDisplaySettings;
  const setMapDisplaySettings = (settings: MapDisplaySettings) => {
    setLocalMapDisplaySettings(settings);
    onMapDisplaySettingsChange?.(settings);
  };
  const [localShowOpenOnly, setLocalShowOpenOnly] = useState(false);
  const showOpenOnly = controlledShowOpenOnly ?? localShowOpenOnly;
  const setShowOpenOnly = (value: boolean) => {
    setLocalShowOpenOnly(value);
    onShowOpenOnlyChange?.(value);
  };
  const [localTileVariant, setLocalTileVariant] =
    useState<MapTileVariant>("photo");
  const mapTileVariant = controlledMapTileVariant ?? localTileVariant;
  const setMapTileVariant = (value: MapTileVariant) => {
    setLocalTileVariant(value);
    onMapTileVariantChange?.(value);
  };
  const [localColorMode, setLocalColorMode] =
    useState<CourseColorMode>("slope");
  const courseColorMode = controlledCourseColorMode ?? localColorMode;
  const setCourseColorMode = (value: CourseColorMode) => {
    setLocalColorMode(value);
    onCourseColorModeChange?.(value);
  };
  const sessionEnabled = useMapSession() !== null;
  useEffect(() => {
    const saved = sessionEnabled
      ? readStorage(`${mapSessionKey(resortId)}:expanded`, mapSessionSchema)
      : null;
    setLocalMapDisplaySettings({
      ...(saved?.displaySettings ?? {
        ...DEFAULT_MAP_DISPLAY_SETTINGS,
        courseStatuses: saved?.showOpenOnly
          ? OPEN_COURSE_STATUSES
          : DEFAULT_MAP_DISPLAY_SETTINGS.courseStatuses,
      }),
      monochrome: true,
    });
    setLocalShowOpenOnly(saved?.showOpenOnly ?? false);
    setLocalTileVariant("photo");
    setLocalColorMode(saved?.courseColorMode ?? "slope");
  }, [resortId, sessionEnabled]);
  const expandedKey = `rusutsu:expanded:v1:${resortId}`;
  const [isExpanded, setExpanded] = useState(false);
  useEffect(() => {
    if (sessionEnabled)
      setExpanded(readStorage(expandedKey, z.boolean()) ?? false);
  }, [expandedKey, sessionEnabled]);
  const setIsExpanded = useCallback(
    (expanded: boolean) => {
      setExpanded(expanded);
      if (sessionEnabled) writeStorage(expandedKey, expanded);
    },
    [expandedKey, sessionEnabled],
  );
  const hasSelection = Boolean(featureDetail);
  const isBelowDetail = featureDetailPlacement === "below";
  // 全画面では呼び出し側の置き場所（比較の右パネル）が隠れるので、右に重ねる
  const placement =
    isExpanded && featureDetailPlacement === "external"
      ? "overlay-right"
      : featureDetailPlacement;
  const isOverlayDetail =
    placement === "overlay-left" || placement === "overlay-right";

  // 畳んだ地図は常に同じ見え方（北が上・スキー場全体が入る大きさ）にしたいので、
  // 全画面で動かした位置は引き継がない。
  const collapse = useCallback(() => {
    setIsExpanded(false);
  }, [setIsExpanded]);

  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 選択中の Escape はコース選択の解除が先（地図側で処理する）
      if (
        event.key !== "Escape" ||
        hasSelection ||
        event.defaultPrevented ||
        (event.target instanceof Element &&
          event.target.closest('[role="dialog"]'))
      )
        return;
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
      showOpenOnlyControl={!minimalControls}
      showLocationControl={!minimalControls}
      mapTopControls={presentation === "preview" ? mapTopControls : undefined}
      linkedAreaControl={
        minimalControls
          ? undefined
          : linkedAreaControl?.(
              presentation === "preview" ? "compact" : "inline",
            )
      }
      mapStatusFilterShared={controlledShowOpenOnly !== undefined}
      courseColorMode={courseColorMode}
      onCourseColorModeChange={setCourseColorMode}
      mapDisplaySettings={mapDisplaySettings}
      onMapDisplaySettingsChange={setMapDisplaySettings}
      showOpenOnly={showOpenOnly}
      onShowOpenOnlyChange={setShowOpenOnly}
      mapTileVariant={mapTileVariant}
      onMapTileVariantChange={setMapTileVariant}
      selectedFinalizedFeature={selectedFinalizedFeature}
      selectedElevationProfilePoint={selectedElevationProfilePoint}
      onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
      onSelectedElevationProfilePointChange={
        onSelectedElevationProfilePointChange
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
  const inlineHeightClassName = resizableFeatureDetail
    ? "absolute inset-0 h-auto"
    : hasSelection && isBelowDetail
      ? selectedHeightClassName
      : previewHeightClassName;

  const finishPanelDrag = useCallback((pointerId: number) => {
    const drag = panelDrag.current;
    const panel = mobilePanelRef.current;
    if (!drag || drag.pointerId !== pointerId || !panel) return;
    panelDrag.current = null;
    setMobilePanelHeight(
      (panel.getBoundingClientRect().height / drag.areaHeight) * 100,
    );
  }, []);
  const adjustPanelHeight = useCallback((height: number) => {
    const panel = mobilePanelRef.current;
    const areaHeight =
      panel?.parentElement?.getBoundingClientRect().height ?? 0;
    if (!panel || areaHeight <= 0) return;
    const minHeight = Math.min(260, areaHeight * 0.42);
    const maxHeight = Math.max(minHeight, areaHeight - 120);
    const bounded = Math.max(minHeight, Math.min(maxHeight, height));
    setMobilePanelHeight((bounded / areaHeight) * 100);
  }, []);
  useEffect(() => {
    if (!resizableFeatureDetail) return;
    const onPointerDown = (event: PointerEvent) => {
      const drag = panelDrag.current;
      if (!drag || drag.pointerId === event.pointerId) return;
      blockedPanelPointer.current = event.pointerId;
      const handle =
        mobilePanelRef.current?.querySelector<HTMLElement>('[role="slider"]');
      if (handle?.hasPointerCapture(drag.pointerId))
        handle.releasePointerCapture(drag.pointerId);
      finishPanelDrag(drag.pointerId);
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (blockedPanelPointer.current === event.pointerId)
        blockedPanelPointer.current = null;
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      const drag = panelDrag.current;
      const handle =
        mobilePanelRef.current?.querySelector<HTMLElement>('[role="slider"]');
      panelDrag.current = null;
      if (drag && handle?.hasPointerCapture(drag.pointerId))
        handle.releasePointerCapture(drag.pointerId);
      blockedPanelPointer.current = null;
    };
  }, [finishPanelDrag, resizableFeatureDetail]);
  const renderResizableDetail = () =>
    resizableFeatureDetail && hasSelection ? (
      <div
        ref={mobilePanelRef}
        data-mobile-composer-panel
        className="absolute inset-x-0 bottom-0 z-[770] flex min-h-0 flex-col overflow-hidden rounded-t-xl border-t border-gray-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)]"
        style={{ height: `${mobilePanelHeight ?? 55}%` }}
      >
        <div className="flex h-8 shrink-0 items-center justify-center border-b border-gray-100">
          <div
            role="slider"
            tabIndex={0}
            aria-label="投稿パネルの高さ"
            aria-orientation="vertical"
            aria-valuemin={30}
            aria-valuemax={85}
            aria-valuenow={Math.round(mobilePanelHeight ?? 55)}
            className="flex h-8 w-full touch-none cursor-row-resize items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
            onPointerDown={event => {
              if (blockedPanelPointer.current === event.pointerId) return;
              if (event.button !== 0 && event.pointerType !== "touch") return;
              const panel = mobilePanelRef.current;
              const areaHeight =
                panel?.parentElement?.getBoundingClientRect().height ?? 0;
              if (!panel || areaHeight <= 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              panelDrag.current = {
                pointerId: event.pointerId,
                startY: event.clientY,
                startHeight: panel.getBoundingClientRect().height,
                areaHeight,
              };
            }}
            onPointerMove={event => {
              const drag = panelDrag.current;
              const panel = mobilePanelRef.current;
              if (!drag || drag.pointerId !== event.pointerId || !panel) return;
              const minHeight = Math.min(260, drag.areaHeight * 0.42);
              const maxHeight = Math.max(minHeight, drag.areaHeight - 120);
              const height = Math.max(
                minHeight,
                Math.min(
                  maxHeight,
                  drag.startHeight + drag.startY - event.clientY,
                ),
              );
              const percent = (height / drag.areaHeight) * 100;
              panel.style.height = `${percent}%`;
              event.currentTarget.setAttribute(
                "aria-valuenow",
                String(Math.round(percent)),
              );
            }}
            onPointerUp={event => finishPanelDrag(event.pointerId)}
            onPointerCancel={event => finishPanelDrag(event.pointerId)}
            onLostPointerCapture={event => finishPanelDrag(event.pointerId)}
            onKeyDown={event => {
              if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
                return;
              event.preventDefault();
              const panel = mobilePanelRef.current;
              const areaHeight =
                panel?.parentElement?.getBoundingClientRect().height ?? 0;
              if (!panel || areaHeight <= 0) return;
              const minHeight = Math.min(260, areaHeight * 0.42);
              const maxHeight = Math.max(minHeight, areaHeight - 120);
              const current = panel.getBoundingClientRect().height;
              adjustPanelHeight(
                event.key === "Home"
                  ? minHeight
                  : event.key === "End"
                    ? maxHeight
                    : current + (event.key === "ArrowUp" ? 32 : -32),
              );
            }}
          >
            <span className="h-1 w-10 rounded-full bg-gray-400" />
          </div>
        </div>
        <div className="min-h-0 flex-1">{featureDetail}</div>
      </div>
    ) : null;

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
          {!isExpanded &&
            renderMap(
              inlinePresentation,
              showInlineMapToolbar && allowPreviewInteraction && !hasSelection,
            )}
        </div>
        {!isExpanded && renderOverlayDetail()}
        {expandable && !minimalControls && !isExpanded && (
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

      {hasSelection &&
        !isExpanded &&
        isBelowDetail &&
        !resizableFeatureDetail && (
          <div className="min-h-0 flex-1 border-t border-gray-200">
            {featureDetail}
          </div>
        )}

      {!isExpanded && renderResizableDetail()}

      {isExpanded && (
        <Portal>
          <div className="fixed inset-0 z-[300] flex flex-col bg-gray-200">
            <div
              className={cn(
                "relative w-full",
                resizableFeatureDetail
                  ? "h-full"
                  : hasSelection && isBelowDetail
                    ? expandedSelectedHeightClassName
                    : "h-full",
              )}
            >
              {renderMap("expanded", !hasSelection)}
              {renderOverlayDetail()}
              {renderResizableDetail()}
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
            {hasSelection && isBelowDetail && !resizableFeatureDetail && (
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
