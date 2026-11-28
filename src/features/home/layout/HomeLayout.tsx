"use client";

import { Maximize2, Minimize2, Search, X } from "lucide-react";
import type {
  ComponentType,
  CSSProperties,
  ChangeEvent as ReactChangeEvent,
  FormEvent as ReactFormEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  RefObject,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMPOSE_STATE_EVENT } from "@/features/community/composerEvents";
import { CORRECTION_STATE_EVENT } from "@/features/corrections/correctionEvents";
import { FavoriteButton } from "@/features/favorites/FavoriteButton";
import type { Filters } from "@/features/filters/types";
import {
  hasNumericFilterValue,
  isLiftTicketFilterActive,
} from "@/features/filters/utils/filterLabels";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import {
  priceColumnLabel,
  priceText,
} from "@/features/lift-ticket/utils/priceText";
import { waitForDetailSaved } from "@/features/map/session/prepareDetail";
import { useScreenState } from "@/features/map/session/useScreenState";
import type {
  ElevationProfileMapPoint,
  JapanResortMapProps,
  MapTileVariant,
  MapViewRestoreRequest,
  SelectedMapFeature,
} from "@/features/map/types";
import {
  ResortFeatureChips,
  type ResortFeatureData,
  resortFeatureDataOf,
} from "@/features/resort-detail/components/ResortFeatureChips";
import {
  SimultaneousToggle,
  useDisplayedResortMapData,
} from "@/features/resort-detail/components/SimultaneousToggle";
import {
  type DetailHeaderActions,
  DetailHeaderActionsContext,
  useDetailHeaderActions,
} from "@/features/resort-detail/detailHeaderActions";
import { SkiResortDetailView } from "@/features/resort-detail/SkiResortDetailView";
import { cn } from "@/lib/utils";
import { AnimatedPanel } from "@/shared/components/AnimatedPanel";
import { CopyResortNameButton } from "@/shared/components/CopyResortNameButton";
import { FormerResortNames } from "@/shared/components/FormerResortNames";
import { PanelCloseButton } from "@/shared/components/PanelCloseButton";
import { RubyText } from "@/shared/components/RubyText";
import type {
  ResortFormerName,
  ResortRubySegment,
} from "@/shared/types/resortReading";
import type {
  MapSkiResort,
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";
import { useHomeCompare } from "../compareContext";
import { DesktopSearchPanel } from "../components/DesktopSearchPanel";
import {
  CompareAddButton,
  CompareTray,
  FloatingActions,
  ViewToggleButton,
} from "../components/FloatingActions";
import { MobileResultsSheet } from "../components/MobileResultsSheet";
import {
  MOBILE_SEARCH_TOP_BAR_HEIGHT,
  MobileSearchTopBarShell,
} from "../components/MobileSearchTopBarShell";
import { SavedCompareButton } from "../components/SavedCompareButton";
import { SearchConditionBar } from "../components/SearchConditionBar";
import { SkiResortCompareView } from "../components/SkiResortCompareView";
import { useListLiftTicketResults } from "../hooks/useListLiftTicketResults";
import { useResortSort } from "../hooks/useResortSort";

// スマホの検索欄の下に置く条件チップの行（h-8 + pb-2）
const MOBILE_CONDITION_BAR_HEIGHT = "2.5rem";
// 下に浮くボタンの高さ（h-11）と上下の余白。一覧・詳細の下の余白に使う
const FLOATING_ACTIONS_SPACE = "4.5rem";

const expandedSchema = z.boolean();

type Props = {
  DynamicMap: ComponentType<JapanResortMapProps>;
  compareResortData: SkiResortDetail[];
  filteredResortIdSet: Set<string>;
  filteredResortIds: string[];
  filteredResorts: MapSkiResort[];
  filters: Filters;
  hasActiveFilters: boolean;
  hoveredResortId: string | null;
  initialResorts: MapSkiResort[];
  isCompareLoading: boolean;
  /** 比較が画面に出ているか（比較から詳細を開いている間は false） */
  isCompareOpen: boolean;
  /**
   * 比較から詳細を開いているか。比較は作り直さないよう、詳細の裏に隠して残す
   */
  isCompareBehindDetail: boolean;
  /** リストから詳細を開いているか。リストも詳細の裏に隠して残す */
  isListBehindDetail: boolean;
  /** 比較のゲレンデで見えているスキー場。地図データを先に取る */
  onCompareMapResortsNeeded: (ids: string[]) => void;
  isFilterEditorOpen: boolean;
  isMobileFilterOverlayOpen: boolean;
  isPending: boolean;
  isSidePanelLayout: boolean;
  listSheetContentRef: RefObject<HTMLDivElement | null>;
  listSheetSnapPoint: number | string | null;
  mapInteractionMode: JapanResortMapProps["interactionMode"];
  mobileContentTab: "info" | "map";
  mobileFilterOverlayRef: RefObject<HTMLDivElement | null>;
  mobileListSheetSnapPoints: (number | string)[];
  mobileDraftFilteredResortCount: number;
  mobileDraftHasChanges: boolean;
  mobileDraftFilters: Filters;
  mobileSearchFilterBottomPadding: string;
  mobileSearchFilterScrollRef: RefObject<HTMLDivElement | null>;
  mobileSearchPanelInputRef: RefObject<HTMLInputElement | null>;
  restoreViewRequest: MapViewRestoreRequest | null;
  searchViewportBottomPaddingRatio: number;
  searchViewportRequestKey: number;
  selectedCompareIdSet: Set<string>;
  selectedCompareIds: string[];
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  selectedFinalizedFeature: SelectedMapFeature | null;
  selectedResortData: NullableSkiResortDetail | null;
  selectedResortId: string | null;
  /** 詳細の取得待ちでも名前と所在地を出すための一覧側データ */
  selectedResortSummary: MapSkiResort | null;
  shouldRenderMobileListSheet: boolean;
  onCloseCompare: () => void;
  onClearCompare: () => void;
  onCloseDetail: () => void;
  onCloseMobileFilterOverlay: () => void;
  onFilterChange: (filters: Filters) => void;
  onFilterKeyboardInputBlur: () => void;
  onFilterKeyboardInputFocus: () => void;
  onMainPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  onMapViewChange: JapanResortMapProps["onViewChange"];
  onMobileFilterAreaPointerDown: (
    event: ReactPointerEvent<HTMLElement> | ReactTouchEvent<HTMLElement>,
  ) => void;
  onMobileFilterChange: (filters: Filters) => void;
  onMobileKeywordChange: (event: ReactChangeEvent<HTMLInputElement>) => void;
  onMobileKeywordClear: () => void;
  onMobileSearchButtonKeywordClear: () => void;
  onMobileSearchButtonPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onMobileContentTabChange: (tab: "info" | "map") => void;
  onMobileSearchFilterInputBlur: () => void;
  onMobileSearchFilterInputFocus: () => void;
  onMobileSearchSubmit: (event: ReactFormEvent<HTMLElement>) => void;
  onMobileSearch: () => void;
  onOpenCompare: () => void;
  onCompareFavorites: () => void;
  onOpenMobileFilterOverlay: () => void;
  onSearch: () => void;
  onSelectResort: (id: string) => void;
  onSelectedFinalizedFeatureChange: NonNullable<
    JapanResortMapProps["onSelectedFinalizedFeatureChange"]
  >;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
  onSetFilterEditorOpen: (isOpen: boolean) => void;
  onSetHoveredResortId: (id: string | null) => void;
  onSetListSheetOpen: (isOpen: boolean) => void;
  onSetListSheetSnapPoint: (snapPoint: number | string | null) => void;
  onToggleCompare: (id: string, selected: boolean) => void;
  onUserMapInteraction: JapanResortMapProps["onUserMapInteraction"];
  onUserMapZoomInteraction: JapanResortMapProps["onUserMapZoomInteraction"];
};

export const HomeLayout = ({
  DynamicMap,
  compareResortData,
  filteredResortIdSet,
  filteredResortIds,
  filteredResorts,
  filters,
  hasActiveFilters,
  hoveredResortId,
  initialResorts,
  isCompareLoading,
  isCompareOpen,
  isCompareBehindDetail,
  isListBehindDetail,
  onCompareMapResortsNeeded,
  isMobileFilterOverlayOpen,
  isPending,
  isSidePanelLayout,
  listSheetContentRef,
  listSheetSnapPoint,
  mapInteractionMode,
  mobileContentTab,
  mobileListSheetSnapPoints,
  restoreViewRequest,
  searchViewportBottomPaddingRatio,
  searchViewportRequestKey,
  selectedCompareIdSet,
  selectedCompareIds,
  selectedElevationProfilePoint,
  selectedFinalizedFeature,
  selectedResortData,
  selectedResortId,
  selectedResortSummary,
  shouldRenderMobileListSheet,
  onCloseCompare,
  onClearCompare,
  onCloseDetail,
  onFilterChange,
  onFilterKeyboardInputBlur,
  onFilterKeyboardInputFocus,
  onMainPointerDownCapture,
  onMapViewChange,
  onMobileSearchButtonKeywordClear,
  onMobileContentTabChange,
  onOpenCompare,
  onCompareFavorites,
  onSearch,
  onSelectResort,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
  onSetHoveredResortId,
  onSetListSheetOpen,
  onSetListSheetSnapPoint,
  onToggleCompare,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: Props) => {
  // 「〇〇も同時に表示」中は、組のスキー場をまとめた地図を出す
  const selectedMapData = useDisplayedResortMapData(selectedResortData ?? null);
  const [composingResortId, setComposingResortId] = useState<string | null>(
    null,
  );
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (
        event as CustomEvent<{ resortId: string; active: boolean }>
      ).detail;
      if (!detail) return;
      setComposingResortId(current =>
        detail.active
          ? detail.resortId
          : current === detail.resortId
            ? null
            : current,
      );
    };
    // 現地レポートの投稿中と情報の修正中は、どちらも詳細パネルを入力画面に切り替える
    window.addEventListener(COMPOSE_STATE_EVENT, handle);
    window.addEventListener(CORRECTION_STATE_EVENT, handle);
    return () => {
      window.removeEventListener(COMPOSE_STATE_EVENT, handle);
      window.removeEventListener(CORRECTION_STATE_EVENT, handle);
    };
  }, []);
  // デスクトップの詳細で、左の地図を画面いっぱいに広げているか
  const [isDesktopMapExpanded, setIsDesktopMapExpanded] = useScreenState(
    `rusutsu:panel:v1:${selectedResortId}:desktopExpanded`,
    expandedSchema,
    false,
  );
  const isDesktopDetailMapExpanded =
    isSidePanelLayout &&
    Boolean(selectedResortId) &&
    !isCompareOpen &&
    isDesktopMapExpanded;

  // 詳細を閉じたら全画面も畳む。比較を開いたときも同じ
  useEffect(() => {
    if (selectedResortId && !isCompareOpen) return;
    setIsDesktopMapExpanded(false);
  }, [isCompareOpen, selectedResortId, setIsDesktopMapExpanded]);

  useEffect(() => {
    if (!isDesktopDetailMapExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 選択中の Escape はコース選択の解除が先（地図側で処理する）
      if (event.key !== "Escape" || selectedFinalizedFeature) return;
      setIsDesktopMapExpanded(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isDesktopDetailMapExpanded,
    selectedFinalizedFeature,
    setIsDesktopMapExpanded,
  ]);

  const liftTicketInput =
    filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  // 一覧・比較のモーダルで変えた料金の条件は、検索欄と同じ条件へ書き込む
  const changeLiftTicketInput = (liftTicket: LiftTicketSearchInput) =>
    onFilterChange({ ...filters, liftTicket });
  // 料金の条件（日付・人・レンタル・予算）を自分で変えたか。変えたときだけ地図にも料金を出す
  const isPriceActive =
    isLiftTicketFilterActive(liftTicketInput) ||
    hasNumericFilterValue(filters.maxPrice);
  const isHomeVisible = !selectedResortId && !isCompareOpen;
  const isHomeListVisible =
    isHomeVisible && (isSidePanelLayout || mobileContentTab === "info");
  // 一覧・地図のラベル・予算の絞り込みが同じ計算結果を使う。
  // 見えていない間や、地図だけで料金を出さない間は計算しない
  const liftTicketResults = useListLiftTicketResults(
    filteredResorts,
    liftTicketInput,
    !(isHomeListVisible || (isHomeVisible && isPriceActive)),
  );
  const maxPrice = filters.maxPrice;
  // 予算は料金の計算結果で絞る。料金が出ないスキー場は外す
  const visibleResorts = useMemo(() => {
    if (maxPrice == null || liftTicketResults.status !== "done") {
      return filteredResorts;
    }
    return filteredResorts.filter(resort => {
      const summary = resort.liftTicketResortId
        ? liftTicketResults.results[resort.liftTicketResortId]
        : null;
      return summary?.kind === "price" && summary.total <= maxPrice;
    });
  }, [filteredResorts, liftTicketResults, maxPrice]);
  const isBudgetApplied = visibleResorts !== filteredResorts;
  const visibleResortIds = useMemo(
    () =>
      isBudgetApplied
        ? visibleResorts.map(resort => resort.id)
        : filteredResortIds,
    [filteredResortIds, isBudgetApplied, visibleResorts],
  );
  const visibleResortIdSet = useMemo(
    () => (isBudgetApplied ? new Set(visibleResortIds) : filteredResortIdSet),
    [filteredResortIdSet, isBudgetApplied, visibleResortIds],
  );
  const resortPriceLabels = useMemo(() => {
    if (!isPriceActive || liftTicketResults.status !== "done") return undefined;
    const labels = new Map<string, string>();
    for (const resort of visibleResorts) {
      const summary = resort.liftTicketResortId
        ? liftTicketResults.results[resort.liftTicketResortId]
        : null;
      if (summary?.kind === "price") labels.set(resort.id, priceText(summary));
    }
    return labels;
  }, [isPriceActive, liftTicketResults, visibleResorts]);
  const priceLabel = priceColumnLabel(liftTicketInput);
  // 地図が標準か航空写真か。航空写真の上では、重ねるチップとボタンを白にする
  const [mapTileVariant, setMapTileVariant] = useState<MapTileVariant>("pale");
  // 比較中の地図はデスクトップの背景地図だけ。モバイルは比較タブの中で完結する
  const mapSearchResultResortIds = hasActiveFilters ? visibleResortIds : [];
  const shouldShowMobileSearchScreen =
    !isSidePanelLayout && isMobileFilterOverlayOpen;
  // モバイルの比較は専用画面（比較タブ）で完結させるので、
  // 上部のコンテキストヘッダーも背景地図も出さない
  const isMobileCompare = !isSidePanelLayout && isCompareOpen;
  const shouldShowMobileContextHeader =
    !isSidePanelLayout &&
    !isMobileFilterOverlayOpen &&
    !isCompareOpen &&
    selectedResortId !== composingResortId &&
    Boolean(selectedResortId);
  const shouldShowMobileSearchButton =
    !isCompareOpen && !isMobileFilterOverlayOpen && !selectedResortId;
  const shouldShowMobileTopChrome =
    !isSidePanelLayout &&
    !isMobileFilterOverlayOpen &&
    (shouldShowMobileSearchButton || shouldShowMobileContextHeader);
  const shouldRenderMap =
    isSidePanelLayout ||
    (!isMobileCompare &&
      (mobileContentTab === "map" ||
        (!selectedResortId &&
          !shouldShowMobileTopChrome &&
          !shouldShowMobileSearchScreen)));
  const mapProps: JapanResortMapProps = {
    resorts: initialResorts,
    filteredResortIdSet: visibleResortIdSet,
    isFilterActive: hasActiveFilters,
    resortLabelSuffixById: resortPriceLabels,
    onMapTileVariantChange: setMapTileVariant,
    // 条件なしで検索結果を閉じる時に、全スキー場へ fit して地図位置が動くのを防ぐ。
    searchResultResortIds: mapSearchResultResortIds,
    searchViewportRequestKey,
    searchViewportBottomPaddingRatio,
    selectedResortId,
    hoveredResortId,
    onSelectResort,
    interactionMode: mapInteractionMode,
    selectedCompareIdSet,
    onToggleCompare,
    onBoundsChange: () => undefined,
    onViewChange: onMapViewChange,
    onUserMapInteraction,
    onUserMapZoomInteraction,
    restoreViewRequest,
    finalizedMapData: selectedMapData,
    linkedAreaControl: selectedResortData ? (
      <SimultaneousToggle
        resort={selectedResortData}
        onSelectResort={onSelectResort}
        size="inline"
      />
    ) : undefined,
    selectedFinalizedFeature,
    onSelectedFinalizedFeatureChange,
    selectedElevationProfilePoint,
    onSelectedElevationProfilePointChange,
  };
  // 隠している間は最後に表示した状態のまま止め、裏で地図を動かさない。
  // 一度も表示していない（URL から詳細を開いた）ときは全国の表示で作る。
  const visibleMapPropsRef = useRef<JapanResortMapProps | null>(null);
  if (shouldRenderMap) visibleMapPropsRef.current = mapProps;
  const mainMapProps: JapanResortMapProps = shouldRenderMap
    ? mapProps
    : (visibleMapPropsRef.current ?? {
        ...mapProps,
        selectedResortId: null,
        hoveredResortId: null,
        interactionMode: "default",
        finalizedMapData: null,
        linkedAreaControl: undefined,
        selectedFinalizedFeature: null,
        selectedElevationProfilePoint: null,
      });
  const [hasMainMap, setHasMainMap] = useState(shouldRenderMap);
  const renderMainMap = shouldRenderMap || hasMainMap;
  useEffect(() => {
    if (shouldRenderMap) setHasMainMap(true);
  }, [shouldRenderMap]);
  // URL から詳細を開いたときは、詳細の取得と圏外用の保存が終わってから
  // 全国地図を裏で作る。電波が弱いときに詳細の通信と取り合わないようにする。
  const isDetailReady =
    Boolean(selectedResortId) &&
    selectedResortData?.id === selectedResortId &&
    !isPending;
  useEffect(() => {
    if (hasMainMap || !isDetailReady || !selectedResortId) return;
    let disposed = false;
    let idle: number | undefined;
    void waitForDetailSaved(selectedResortId).then(() => {
      if (disposed) return;
      const create = () => {
        if (!disposed) setHasMainMap(true);
      };
      idle =
        typeof window.requestIdleCallback === "function"
          ? window.requestIdleCallback(create, { timeout: 3000 })
          : window.setTimeout(create, 500);
    });
    return () => {
      disposed = true;
      if (idle === undefined) return;
      if (typeof window.cancelIdleCallback === "function")
        window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [hasMainMap, isDetailReady, selectedResortId]);
  const { sortedResorts, controls: sortControls } =
    useResortSort(visibleResorts);
  const mobileSearchChromeHeight = `calc(${MOBILE_SEARCH_TOP_BAR_HEIGHT} + ${MOBILE_CONDITION_BAR_HEIGHT})`;
  // 比較リスト・お気に入りの比較から開いた詳細では「比較」を出さない。
  // お気に入りの比較から開いたときは、ハートも出さない（編集は比較画面で行う）
  const compareSourceKind = useHomeCompare()?.source.kind ?? "selection";
  const detailHeaderActions: DetailHeaderActions = {
    compare: !isCompareBehindDetail || compareSourceKind === "selection",
    favorite: !isCompareBehindDetail || compareSourceKind !== "favorites",
    floatingCompare: true,
  };
  const compareTray = (
    <CompareTray
      count={selectedCompareIds.length}
      onOpen={onOpenCompare}
      onClear={onClearCompare}
    />
  );
  // 詳細では右下に「＋比較」、左下に「N件を比較」を浮かせる。
  // 投稿・修正の入力中、コースやリフトを選んでいる間、地図を広げている間は出さない
  const isDetailFloatingVisible =
    Boolean(selectedResortId) &&
    !isCompareOpen &&
    !isMobileFilterOverlayOpen &&
    selectedResortId !== composingResortId &&
    !selectedFinalizedFeature &&
    !isDesktopDetailMapExpanded &&
    (detailHeaderActions.compare || selectedCompareIds.length > 0);
  const detailResortName =
    selectedResortData?.nameJa ?? selectedResortSummary?.nameJa ?? "";
  // PCの詳細パネルは <main> の外（body 直下）に出るので、浮かせるボタンも body 直下に出し、
  // 下の余白の高さも <html> に持たせて、どちらの詳細からも読めるようにする
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--floating-actions-space",
      isDetailFloatingVisible ? FLOATING_ACTIONS_SPACE : "0px",
    );
    return () => {
      root.style.removeProperty("--floating-actions-space");
    };
  }, [isDetailFloatingVisible]);

  return (
    <DetailHeaderActionsContext.Provider value={detailHeaderActions}>
      <main
        onPointerDownCapture={onMainPointerDownCapture}
        className="fixed inset-0 min-h-0 w-screen overflow-hidden flex flex-col md:flex-row bg-gray-100"
      >
        <div
          className={cn(
            "relative flex h-full w-full flex-col bg-white",
            // 詳細で地図を広げているときは、検索パネルと詳細パネルの上に出す
            isDesktopDetailMapExpanded && "md:fixed md:inset-0 md:z-[400]",
          )}
        >
          {/*
          検索画面では検索欄と条件のチップを地図に重ねる。
          詳細・比較画面ではこの検索用の操作を出さない。
        */}
          {shouldShowMobileTopChrome && shouldShowMobileSearchButton && (
            <div
              data-map-top-controls="true"
              className="pointer-events-none fixed top-0 right-0 left-0 z-[150] hide-desktop flex-col"
            >
              <MobileSearchHeader
                keyword={filters.keyword}
                onKeywordChange={keyword =>
                  onFilterChange({ ...filters, keyword })
                }
                onKeywordClear={onMobileSearchButtonKeywordClear}
                onSubmit={onSearch}
                onCompareFavorites={onCompareFavorites}
              />
              <SearchConditionBar
                className="mx-4 pb-2"
                floating={shouldRenderMap}
                light={shouldRenderMap && mapTileVariant === "photo"}
                filters={filters}
                resorts={initialResorts}
                resultCount={sortedResorts.length}
                onFilterChange={onFilterChange}
                onCommit={onSearch}
              />
            </div>
          )}
          {/*
          地図は検索欄の背後まで描画する。リストだけは検索欄と比較チップの
          高さを空け、先頭のスキー場が固定操作に隠れないようにする。
        */}
          <div
            className="flex-1 min-h-0 flex flex-col"
            style={
              !isSidePanelLayout &&
              shouldShowMobileSearchButton &&
              !shouldRenderMap
                ? { paddingTop: mobileSearchChromeHeight }
                : undefined
            }
          >
            {shouldShowMobileContextHeader && (
              <MobileContextHeader
                detailTitle={
                  selectedResortData?.nameJa ??
                  selectedResortSummary?.nameJa ??
                  "読み込み中"
                }
                detailNameRuby={
                  selectedResortData?.nameRuby ??
                  selectedResortSummary?.nameRuby ??
                  null
                }
                detailFormerNames={
                  selectedResortData?.formerNames ??
                  selectedResortSummary?.formerNames ??
                  []
                }
                detailPrefecture={
                  selectedResortData?.prefecture ??
                  selectedResortSummary?.prefecture ??
                  ""
                }
                detailTown={
                  selectedResortData?.town ?? selectedResortSummary?.town ?? ""
                }
                detailYukiMagi={Boolean(
                  selectedResortData?.yukiMagi ??
                    selectedResortSummary?.yukiMagiId,
                )}
                detailHasEvCharger={Boolean(
                  selectedResortData?.evChargers?.length ??
                    selectedResortSummary?.evChargerSummary,
                )}
                detailFeatures={
                  selectedResortData
                    ? resortFeatureDataOf(selectedResortData)
                    : null
                }
                detailResortId={selectedResortId}
                onCloseDetail={onCloseDetail}
              />
            )}
            <div
              className="flex-1 min-h-0 relative"
              style={
                !isSidePanelLayout && shouldShowMobileSearchButton
                  ? ({
                      "--mobile-map-top-offset": mobileSearchChromeHeight,
                    } as CSSProperties)
                  : undefined
              }
            >
              {isSidePanelLayout &&
                Boolean(selectedResortId) &&
                !isCompareOpen && (
                  <Button
                    type="button"
                    aria-label={
                      isDesktopMapExpanded ? "地図を元に戻す" : "地図を拡大"
                    }
                    onClick={() => setIsDesktopMapExpanded(current => !current)}
                    className="absolute top-3 left-3 z-[90] h-10 w-10 min-w-10 rounded-md border border-gray-200 bg-white p-0 text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
                  >
                    {isDesktopMapExpanded ? (
                      <Minimize2 size={17} strokeWidth={2.5} />
                    ) : (
                      <Maximize2 size={17} strokeWidth={2.5} />
                    )}
                  </Button>
                )}
              {renderMainMap && (
                // スマホで詳細・比較・検索を開いている間も地図は破棄せず隠す。
                // 閉じたときに地図を作り直さず、前の画面をすぐ出すため。
                <div
                  className={
                    shouldRenderMap
                      ? "absolute inset-0"
                      : "invisible pointer-events-none absolute inset-0"
                  }
                  aria-hidden={!shouldRenderMap}
                  inert={!shouldRenderMap}
                >
                  <DynamicMap {...mainMapProps} />
                </div>
              )}
              {!isSidePanelLayout &&
                (isCompareBehindDetail ||
                  isListBehindDetail ||
                  (!shouldRenderMap &&
                    !selectedResortId &&
                    shouldRenderMobileListSheet)) && (
                  // 比較・リストから詳細を開いている間も破棄せず隠す。
                  // 詳細を閉じたときに、タブ・開閉・スクロール・地図をそのまま出すため
                  <div
                    className={
                      isCompareBehindDetail || isListBehindDetail
                        ? "invisible pointer-events-none absolute inset-0"
                        : "absolute inset-0"
                    }
                    aria-hidden={isCompareBehindDetail || isListBehindDetail}
                    inert={isCompareBehindDetail || isListBehindDetail}
                  >
                    <MobileResultsSheet
                      DynamicMap={DynamicMap}
                      mapResorts={initialResorts}
                      compareResorts={compareResortData}
                      filteredResorts={sortedResorts}
                      sortControls={sortControls}
                      isCompareLoading={isCompareLoading}
                      isCompareOpen={isCompareOpen || isCompareBehindDetail}
                      onCompareMapResortsNeeded={onCompareMapResortsNeeded}
                      listSheetContentRef={listSheetContentRef}
                      listSheetSnapPoint={listSheetSnapPoint}
                      snapPoints={mobileListSheetSnapPoints}
                      selectedCompareIdSet={selectedCompareIdSet}
                      liftTicketInput={liftTicketInput}
                      featureLines={{
                        yukiMagi: filters.yukiMagi,
                        evCharger: filters.evCharger,
                      }}
                      liftTicketResults={liftTicketResults}
                      priceLabel={priceLabel}
                      onCloseCompare={onCloseCompare}
                      onLiftTicketInputChange={changeLiftTicketInput}
                      onHoverResortChange={onSetHoveredResortId}
                      onOpenChange={open => {
                        onSetListSheetOpen(open && mobileContentTab === "info");
                        if (!open && isCompareOpen) {
                          onCloseCompare();
                        }
                      }}
                      onSelectResort={onSelectResort}
                      onSetSnapPoint={onSetListSheetSnapPoint}
                      onToggleCompare={onToggleCompare}
                    />
                  </div>
                )}
              {!shouldRenderMap && selectedResortId && (
                <SkiResortDetailView
                  DynamicMap={DynamicMap}
                  mapResorts={initialResorts}
                  resortData={selectedResortData}
                  resortSummary={selectedResortSummary}
                  isLoading={isPending}
                  isCompareSelected={selectedCompareIdSet.has(selectedResortId)}
                  onToggleCompare={onToggleCompare}
                  selectedFinalizedFeature={selectedFinalizedFeature}
                  selectedElevationProfilePoint={selectedElevationProfilePoint}
                  onSelectedFinalizedFeatureChange={
                    onSelectedFinalizedFeatureChange
                  }
                  onSelectedElevationProfilePointChange={
                    onSelectedElevationProfilePointChange
                  }
                  onClose={onCloseDetail}
                  onSelectResort={onSelectResort}
                  mobileContentTab="info"
                  mobilePresentation="inline"
                  hideMobileInfoSection
                  liftTicketInput={filters.liftTicket ?? undefined}
                />
              )}
            </div>
          </div>
          {/*
          スマホのホームは、右下で「リスト／地図」を切り替え、
          1件以上選んだときだけ左下に「N件を比較」を出す。
        */}
          {!isSidePanelLayout &&
            shouldShowMobileTopChrome &&
            shouldShowMobileSearchButton && (
              <FloatingActions
                className="fixed inset-x-0 bottom-0 z-[140] md:hidden"
                left={compareTray}
                right={
                  <ViewToggleButton
                    view={mobileContentTab}
                    resultCount={sortedResorts.length}
                    light={shouldRenderMap && mapTileVariant === "photo"}
                    onChange={onMobileContentTabChange}
                  />
                }
              />
            )}
        </div>

        <DesktopSearchPanel
          showAccount={!selectedResortId && !isCompareOpen}
          filters={filters}
          resorts={initialResorts}
          filteredResorts={sortedResorts}
          sortControls={sortControls}
          selectedCompareIdSet={selectedCompareIdSet}
          liftTicketResults={liftTicketResults}
          priceLabel={priceLabel}
          floatingActions={
            <FloatingActions
              className="absolute inset-x-0 bottom-0 z-10"
              left={compareTray}
            />
          }
          onFilterChange={onFilterChange}
          onKeyboardInputBlur={onFilterKeyboardInputBlur}
          onKeyboardInputFocus={onFilterKeyboardInputFocus}
          onCompareFavorites={onCompareFavorites}
          onSearch={onSearch}
          onSelectResort={onSelectResort}
          onToggleCompare={onToggleCompare}
          onHoverResortChange={onSetHoveredResortId}
        />

        <AnimatedPanel
          visible={Boolean(
            selectedResortId && (isSidePanelLayout || shouldRenderMap),
          )}
          rootClassName={cn(
            "fixed inset-0 md:flex pointer-events-none",
            // 全画面地図のときは、その上に選択中のコースを重ねる
            isDesktopDetailMapExpanded ? "z-[420]" : "z-[60]",
          )}
        >
          {selectedResortId && (isSidePanelLayout || shouldRenderMap) && (
            <SkiResortDetailView
              DynamicMap={DynamicMap}
              mapResorts={initialResorts}
              resortData={selectedResortData}
              resortSummary={selectedResortSummary}
              isLoading={isPending}
              isCompareSelected={selectedCompareIdSet.has(selectedResortId)}
              onToggleCompare={onToggleCompare}
              selectedFinalizedFeature={selectedFinalizedFeature}
              selectedElevationProfilePoint={selectedElevationProfilePoint}
              onSelectedFinalizedFeatureChange={
                onSelectedFinalizedFeatureChange
              }
              onSelectedElevationProfilePointChange={
                onSelectedElevationProfilePointChange
              }
              onClose={onCloseDetail}
              onSelectResort={onSelectResort}
              mobileContentTab="info"
              hideMobileInfoSection
              isDesktopMapExpanded={isDesktopDetailMapExpanded}
              liftTicketInput={filters.liftTicket ?? undefined}
            />
          )}
        </AnimatedPanel>

        {isDetailFloatingVisible &&
          selectedResortId &&
          isMounted &&
          createPortal(
            <FloatingActions
              className="fixed inset-x-0 bottom-0 z-[430] md:left-auto md:w-[var(--desktop-detail-panel-width)]"
              left={compareTray}
              right={
                detailHeaderActions.compare && (
                  <CompareAddButton
                    isSelected={selectedCompareIdSet.has(selectedResortId)}
                    resortName={detailResortName}
                    onToggle={() =>
                      onToggleCompare(
                        selectedResortId,
                        !selectedCompareIdSet.has(selectedResortId),
                      )
                    }
                  />
                )
              }
            />,
            document.body,
          )}

        {(isCompareOpen || isCompareBehindDetail) && isSidePanelLayout && (
          <SkiResortCompareView
            hidden={isCompareBehindDetail}
            resorts={compareResortData}
            isLoading={isCompareLoading}
            liftTicketInput={liftTicketInput}
            onLiftTicketInputChange={changeLiftTicketInput}
            onClose={onCloseCompare}
            DynamicMap={DynamicMap}
            mapResorts={initialResorts}
            onSelectResort={onSelectResort}
            onMapResortsNeeded={onCompareMapResortsNeeded}
          />
        )}
      </main>
    </DetailHeaderActionsContext.Provider>
  );
};

type MobileSearchHeaderProps = {
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  onKeywordClear: () => void;
  onSubmit: () => void;
  onCompareFavorites: () => void;
};

/**
 * スマホの検索欄。別の画面を重ねず、地図・リストの上でそのまま名前を入力する。
 * 入力はその場で一覧と地図に反映し、Enter で地図を結果に寄せる。
 */
const MobileSearchHeader = ({
  keyword,
  onKeywordChange,
  onKeywordClear,
  onSubmit,
  onCompareFavorites,
}: MobileSearchHeaderProps) => (
  <MobileSearchTopBarShell
    floating
    showAccount
    // 「リスト／地図」は右下のボタンへ移した。ここは保存したもの（お気に入り・比較リスト）の入口
    action={<SavedCompareButton onCompareFavorites={onCompareFavorites} />}
    onSubmit={event => {
      event.currentTarget.querySelector("input")?.blur();
      onSubmit();
    }}
  >
    <div className="relative h-12 min-w-0 overflow-hidden rounded-full border border-gray-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.12)]">
      <Search
        size={18}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label="スキー場を検索"
        type="text"
        name="keyword"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="名前で検索"
        value={keyword}
        // 16px 未満だと iOS が入力時に画面を拡大する
        className={cn(
          "h-12 w-full rounded-full border-0 bg-transparent pl-8 text-base font-medium text-foreground shadow-none focus-visible:ring-0",
          keyword ? "pr-11" : "pr-2",
        )}
        onChange={event => onKeywordChange(event.target.value)}
      />
      {keyword && (
        <Button
          type="button"
          variant="ghost"
          aria-label="検索キーワードをクリア"
          className="absolute inset-y-0 right-2 my-auto h-8 w-8 min-w-8 rounded-full p-0 text-gray-600 shadow-none hover:bg-gray-50"
          onClick={onKeywordClear}
        >
          <X size={16} strokeWidth={2.5} />
        </Button>
      )}
    </div>
  </MobileSearchTopBarShell>
);

type MobileContextHeaderProps = {
  detailTitle: string;
  detailNameRuby: ResortRubySegment[] | null;
  detailFormerNames: ResortFormerName[];
  detailPrefecture: string;
  detailTown: string;
  detailYukiMagi: boolean;
  detailHasEvCharger: boolean;
  /** 詳細の読み込み前は null（雪マジ・EV充電のチップは押せない） */
  detailFeatures: ResortFeatureData | null;
  detailResortId: string | null;
  onCloseDetail: () => void;
};

const MobileContextHeader = ({
  detailTitle,
  detailNameRuby,
  detailFormerNames,
  detailPrefecture,
  detailTown,
  detailYukiMagi,
  detailHasEvCharger,
  detailFeatures,
  detailResortId,
  onCloseDetail,
}: MobileContextHeaderProps) => {
  const actions = useDetailHeaderActions();
  const detailLocation = [detailPrefecture, detailTown]
    .filter(Boolean)
    .join("・");

  return (
    <div className="relative z-10 pointer-events-auto md:hidden">
      {/*
        名前・所在地の右に、お気に入り・閉じるを1行で並べる。
        ボタンを縦に積むとヘッダーが2段分の高さになり、地図が下に押し出される。
        「＋比較」は画面の右下に浮かせて出す。
      */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate-2 font-heading text-base font-bold leading-snug text-foreground">
            <RubyText segments={detailNameRuby} fallback={detailTitle} />
            {/* 名前のすぐ後ろに置く。行ボックスを広げないよう行送りより小さくする */}
            <CopyResortNameButton
              name={detailTitle}
              className="ml-1 size-5 align-middle"
            />
          </h2>
          {detailFormerNames.length > 0 && (
            <p className="mt-0.5 truncate text-xs leading-snug text-muted-foreground">
              旧称: <FormerResortNames names={detailFormerNames} />
            </p>
          )}
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium leading-snug text-muted-foreground">
            {/* 県・市町村のどちらかが未取得のときに区切り文字だけが残らないようにする */}
            {detailLocation && (
              <span className="truncate">{detailLocation}</span>
            )}
            <ResortFeatureChips
              hasYukiMagi={detailYukiMagi}
              hasEvCharger={detailHasEvCharger}
              data={detailFeatures}
              size="sm"
            />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {detailResortId && actions.favorite && (
            <FavoriteButton resortId={detailResortId} name={detailTitle} />
          )}
          <PanelCloseButton label="詳細を閉じる" onClose={onCloseDetail} />
        </div>
      </div>
    </div>
  );
};
