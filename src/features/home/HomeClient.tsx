"use client";

import dynamic from "next/dynamic";
import type {
  ChangeEvent as ReactChangeEvent,
  FormEvent as ReactFormEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { flushSync } from "react-dom";
import { getSkiResortById } from "@/actions/skiResorts";
import { DEFAULT_FILTERS } from "@/features/filters/constants";
import type { Filters } from "@/features/filters/types";
import {
  isFilterActive,
  matchesFilters,
} from "@/features/filters/utils/filterResorts";
import type {
  ElevationProfileMapPoint,
  SelectedMapFeature,
} from "@/features/map/JapanResortMap";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type {
  MapSkiResort,
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";
import {
  BOTTOM_SHEET_COLLAPSED_SNAP_POINT,
  BOTTOM_SHEET_DETAIL_COLLAPSED_SNAP_POINT,
  BOTTOM_SHEET_DETAIL_INITIAL_SNAP_POINT,
  BOTTOM_SHEET_EXPANDED_SNAP_POINT,
  BOTTOM_SHEET_INITIAL_SNAP_POINT,
  BOTTOM_SHEET_SEARCH_SNAP_POINT,
  BOTTOM_SHEET_SNAP_POINTS,
  getBottomSheetHeightRatio,
  isBottomSheetExpanded,
  MOBILE_COMPARE_BUTTON_BOTTOM_CLOSED,
  MOBILE_COMPARE_BUTTON_BOTTOM_GAP,
  MOBILE_KEYBOARD_INSET_THRESHOLD,
} from "./constants";
import { useHomeGestureGuards } from "./hooks/useHomeGestureGuards";
import { useMapZoomIntentListener } from "./hooks/useMapZoomIntentListener";
import { useMobileSearchOverlayEffects } from "./hooks/useMobileSearchOverlayEffects";
import { useSidePanelLayout } from "./hooks/useSidePanelLayout";
import { HomeLayout } from "./layout/HomeLayout";
import type {
  MapViewRestoreRequest,
  MapViewSnapshot,
  MobileSearchReturnState,
  ReturnViewState,
  VisualViewportState,
} from "./types";
import {
  getSearchResultListScrollElement,
  isKeyboardInputElement,
  scheduleRestoreDocumentPointerEvents,
  scheduleRestoreSearchResultListScroll,
} from "./utils/dom";

type Props = {
  initialResorts: MapSkiResort[];
};

export function HomeClient({ initialResorts }: Props) {
  // マップコンポーネントを SSR 無効で動的インポート
  const DynamicMap = useMemo(
    () =>
      dynamic(
        () =>
          import("@/features/map/JapanResortMap").then(
            mod => mod.JapanResortMap,
          ),
        {
          loading: () => <LoadingSpinner text="地図を読み込んでいます..." />,
          ssr: false,
        },
      ),
    [],
  );

  // --- State管理 ---
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [isFilterEditorOpen, setIsFilterEditorOpen] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedResortId, setSelectedResortId] = useState<string | null>(null);
  const [selectedResortData, setSelectedResortData] =
    useState<NullableSkiResortDetail | null>(null);
  const [selectedFinalizedFeature, setSelectedFinalizedFeature] =
    useState<SelectedMapFeature | null>(null);
  const [selectedElevationProfilePoint, setSelectedElevationProfilePoint] =
    useState<ElevationProfileMapPoint | null>(null);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [compareResortData, setCompareResortData] = useState<SkiResortDetail[]>(
    [],
  );
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isCompareLoading, setIsCompareLoading] = useState(false);
  const [isMobileFilterOverlayOpen, setIsMobileFilterOverlayOpen] =
    useState(false);
  const [isListSheetOpen, setIsListSheetOpen] = useState(false);
  const [listSheetSnapPoint, setListSheetSnapPoint] = useState<
    number | string | null
  >(BOTTOM_SHEET_INITIAL_SNAP_POINT);
  const [detailSheetSnapPoint, setDetailSheetSnapPoint] = useState<
    number | string | null
  >(BOTTOM_SHEET_INITIAL_SNAP_POINT);
  const [searchViewportRequestKey, setSearchViewportRequestKey] = useState(0);
  const [restoreViewRequest, setRestoreViewRequest] =
    useState<MapViewRestoreRequest | null>(null);
  const [hoveredResortId, setHoveredResortId] = useState<string | null>(null);
  const [mobileSearchViewport, setMobileSearchViewport] =
    useState<VisualViewportState>({
      keyboardInset: 0,
    });
  const [isMobileSearchKeyboardActive, setIsMobileSearchKeyboardActive] =
    useState(false);
  const [isPending, startTransition] = useTransition();
  const latestMapViewRef = useRef<MapViewSnapshot | null>(null);
  const listSheetContentRef = useRef<HTMLDivElement | null>(null);
  const mobileFilterOverlayRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchPanelInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchFilterScrollRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchViewportBaseHeightRef = useRef<number | null>(null);
  const returnViewStateRef = useRef<ReturnViewState | null>(null);
  const mobileSearchReturnStateRef = useRef<MobileSearchReturnState | null>(
    null,
  );
  const hasUserInteractedWithMapInDetailRef = useRef(false);
  const keyboardReturnSnapPointRef = useRef<number | string | null>(null);
  const isSidePanelLayout = useSidePanelLayout();

  useHomeGestureGuards({
    isMobileFilterOverlayOpen,
    isSidePanelLayout,
    listSheetContentRef,
    mobileFilterOverlayRef,
    selectedResortId,
  });
  useMobileSearchOverlayEffects({
    inputRef: mobileSearchPanelInputRef,
    isOpen: isMobileFilterOverlayOpen,
    isSidePanelLayout,
    viewportBaseHeightRef: mobileSearchViewportBaseHeightRef,
    setIsKeyboardActive: setIsMobileSearchKeyboardActive,
    setViewport: setMobileSearchViewport,
  });

  // --- データ絞り込みロジック ---

  // 1. フィルターパネルによる絞り込み
  const filteredResorts = useMemo(() => {
    return initialResorts.filter(resort => matchesFilters(resort, filters));
  }, [initialResorts, filters]);
  const filteredResortIdSet = useMemo(
    () => new Set(filteredResorts.map(resort => resort.id)),
    [filteredResorts],
  );
  const filteredResortIds = useMemo(
    () => filteredResorts.map(resort => resort.id),
    [filteredResorts],
  );
  const hasActiveFilters = isFilterActive(filters);

  const selectedCompareIdSet = useMemo(
    () => new Set(selectedCompareIds),
    [selectedCompareIds],
  );
  const mapInteractionMode = isCompareOpen
    ? "compare"
    : selectedResortId
      ? "detail"
      : "default";

  useEffect(() => {
    if (hasSearched && !isFilterEditorOpen) return;
    setHoveredResortId(null);
  }, [hasSearched, isFilterEditorOpen]);

  useEffect(() => {
    if (isSidePanelLayout) {
      setIsListSheetOpen(false);
      setIsMobileFilterOverlayOpen(false);
    }
  }, [isSidePanelLayout]);

  const mobileCompareButtonBottom = useMemo(() => {
    if (!isListSheetOpen) {
      return MOBILE_COMPARE_BUTTON_BOTTOM_CLOSED;
    }

    if (isBottomSheetExpanded(listSheetSnapPoint)) {
      return "auto";
    }

    if (typeof listSheetSnapPoint === "number") {
      return `calc(${listSheetSnapPoint * 100}vh + ${MOBILE_COMPARE_BUTTON_BOTTOM_GAP})`;
    }

    if (typeof listSheetSnapPoint === "string") {
      return `calc(${listSheetSnapPoint} + ${MOBILE_COMPARE_BUTTON_BOTTOM_GAP})`;
    }

    return MOBILE_COMPARE_BUTTON_BOTTOM_CLOSED;
  }, [isListSheetOpen, listSheetSnapPoint]);
  const isMobileCompareButtonPinnedToTop =
    isListSheetOpen && isBottomSheetExpanded(listSheetSnapPoint);
  const searchViewportBottomPaddingRatio =
    !isSidePanelLayout && isListSheetOpen
      ? getBottomSheetHeightRatio(listSheetSnapPoint)
      : 0;
  const selectedViewportBottomPaddingRatio =
    !isSidePanelLayout && selectedResortId
      ? getBottomSheetHeightRatio(detailSheetSnapPoint)
      : 0;

  // --- イベントハンドラ ---
  const handleFilterChange = (newFilters: Filters) => setFilters(newFilters);
  const handleMapViewChange = useCallback((view: MapViewSnapshot) => {
    latestMapViewRef.current = view;
  }, []);
  const saveReturnViewState = useCallback(() => {
    returnViewStateRef.current = {
      isListSheetOpen,
      listSheetSnapPoint,
      listScrollTop: getSearchResultListScrollElement()?.scrollTop ?? 0,
      mapView: latestMapViewRef.current,
    };
  }, [isListSheetOpen, listSheetSnapPoint]);
  const restoreReturnViewState = useCallback((restoreMap = true) => {
    const returnViewState = returnViewStateRef.current;
    returnViewStateRef.current = null;
    if (!returnViewState) return;

    setListSheetSnapPoint(returnViewState.listSheetSnapPoint);
    setIsListSheetOpen(returnViewState.isListSheetOpen);
    scheduleRestoreSearchResultListScroll(returnViewState.listScrollTop);
    if (!restoreMap) return;

    const mapView = returnViewState.mapView;
    if (mapView) {
      setRestoreViewRequest(prev => ({
        ...mapView,
        key: (prev?.key ?? 0) + 1,
      }));
    }
  }, []);
  const handleSearch = useCallback(() => {
    mobileSearchReturnStateRef.current = null;
    setHasSearched(true);
    setIsFilterEditorOpen(false);
    setIsMobileFilterOverlayOpen(false);
    setIsListSheetOpen(true);
    keyboardReturnSnapPointRef.current = null;
    setListSheetSnapPoint(BOTTOM_SHEET_SEARCH_SNAP_POINT);
    setSearchViewportRequestKey(key => key + 1);
  }, []);
  const handleMobileKeywordChange = useCallback(
    (event: ReactChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setFilters(prev => ({ ...prev, keyword: value }));
    },
    [],
  );
  const handleMobileSearchSubmit = useCallback(
    (event: ReactFormEvent<HTMLElement>) => {
      event.preventDefault();
      event.currentTarget.querySelector("input")?.blur();
      handleSearch();
    },
    [handleSearch],
  );
  const handleOpenMobileFilterOverlay = useCallback(() => {
    if (isSidePanelLayout) return;

    mobileSearchReturnStateRef.current ??= {
      isListSheetOpen,
      listSheetSnapPoint,
      selectedResortId,
      selectedResortData,
      detailSheetSnapPoint,
      isCompareOpen,
    };

    if (selectedResortId) {
      setSelectedResortId(null);
      setSelectedResortData(null);
    }
    if (isCompareOpen) {
      setIsCompareOpen(false);
    }

    flushSync(() => {
      setIsMobileFilterOverlayOpen(true);
    });
    setIsListSheetOpen(false);
  }, [
    detailSheetSnapPoint,
    isCompareOpen,
    isListSheetOpen,
    isSidePanelLayout,
    listSheetSnapPoint,
    selectedResortData,
    selectedResortId,
  ]);
  const handleMobileSearchButtonPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      handleOpenMobileFilterOverlay();
    },
    [handleOpenMobileFilterOverlay],
  );
  const handleCloseMobileFilterOverlay = useCallback(() => {
    mobileSearchPanelInputRef.current?.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsMobileSearchKeyboardActive(false);
    setIsMobileFilterOverlayOpen(false);

    const returnState = mobileSearchReturnStateRef.current;
    mobileSearchReturnStateRef.current = null;
    if (!returnState) {
      setIsListSheetOpen(hasSearched);
      setListSheetSnapPoint(
        hasSearched
          ? BOTTOM_SHEET_SEARCH_SNAP_POINT
          : BOTTOM_SHEET_INITIAL_SNAP_POINT,
      );
      return;
    }

    setSelectedResortId(returnState.selectedResortId);
    setSelectedResortData(returnState.selectedResortData);
    setDetailSheetSnapPoint(returnState.detailSheetSnapPoint);
    setIsCompareOpen(returnState.isCompareOpen);
    setIsListSheetOpen(returnState.isListSheetOpen);
    setListSheetSnapPoint(returnState.listSheetSnapPoint);
  }, [hasSearched]);
  const handleMobileFilterAreaPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement> | ReactTouchEvent<HTMLElement>) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select")
      ) {
        return;
      }

      mobileSearchPanelInputRef.current?.blur();
    },
    [],
  );
  const handleMobileSearchFilterInputFocus = useCallback(() => {
    setIsMobileSearchKeyboardActive(true);

    window.setTimeout(() => {
      const scrollElement = mobileSearchFilterScrollRef.current;
      const activeElement = document.activeElement;
      if (
        !scrollElement ||
        !isKeyboardInputElement(activeElement) ||
        !scrollElement.contains(activeElement)
      ) {
        return;
      }

      const scrollRect = scrollElement.getBoundingClientRect();
      const inputRect = activeElement.getBoundingClientRect();
      if (inputRect.top < scrollRect.top) {
        return;
      }

      const targetTop =
        scrollElement.scrollTop +
        inputRect.top -
        scrollRect.top -
        scrollRect.height * 0.28;

      scrollElement.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    }, 120);
  }, []);
  const handleMobileSearchFilterInputBlur = useCallback(() => {
    window.setTimeout(() => {
      const overlayElement = mobileFilterOverlayRef.current;
      const activeElement = document.activeElement;

      if (
        overlayElement &&
        isKeyboardInputElement(activeElement) &&
        overlayElement.contains(activeElement)
      ) {
        setIsMobileSearchKeyboardActive(true);
        return;
      }

      setIsMobileSearchKeyboardActive(false);
      setMobileSearchViewport({ keyboardInset: 0 });
    }, 60);
  }, []);
  const handleFilterKeyboardInputFocus = useCallback(() => {
    if (isSidePanelLayout) return;

    if (keyboardReturnSnapPointRef.current == null) {
      keyboardReturnSnapPointRef.current = listSheetSnapPoint;
    }

    setIsListSheetOpen(true);
    setListSheetSnapPoint(BOTTOM_SHEET_EXPANDED_SNAP_POINT);

    window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (
        isKeyboardInputElement(activeElement) &&
        listSheetContentRef.current?.contains(activeElement)
      ) {
        activeElement.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
      }
    }, 160);
  }, [isSidePanelLayout, listSheetSnapPoint]);
  const handleFilterKeyboardInputBlur = useCallback(() => {
    if (isSidePanelLayout) return;

    window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (
        isKeyboardInputElement(activeElement) &&
        listSheetContentRef.current?.contains(activeElement)
      ) {
        return;
      }

      const returnSnapPoint = keyboardReturnSnapPointRef.current;
      keyboardReturnSnapPointRef.current = null;
      if (returnSnapPoint == null) return;

      setListSheetSnapPoint(returnSnapPoint);
    }, 80);
  }, [isSidePanelLayout]);
  const handleUserMapInteraction = useCallback(() => {
    if (selectedResortId) {
      hasUserInteractedWithMapInDetailRef.current = true;
    }
  }, [selectedResortId]);
  const handleUserMapZoomInteraction = useCallback(() => {
    handleUserMapInteraction();

    if (isSidePanelLayout) return;

    if (selectedResortId) {
      flushSync(() => {
        setDetailSheetSnapPoint(BOTTOM_SHEET_DETAIL_COLLAPSED_SNAP_POINT);
      });
      return;
    }

    if (isListSheetOpen || isCompareOpen) {
      flushSync(() => {
        setListSheetSnapPoint(BOTTOM_SHEET_COLLAPSED_SNAP_POINT);
      });
    }
  }, [
    handleUserMapInteraction,
    isCompareOpen,
    isListSheetOpen,
    isSidePanelLayout,
    selectedResortId,
  ]);
  useMapZoomIntentListener(handleUserMapZoomInteraction);

  const handleSelectedFinalizedFeatureChange = useCallback(
    (feature: SelectedMapFeature | null) => {
      setSelectedFinalizedFeature(feature);
      setSelectedElevationProfilePoint(null);
    },
    [],
  );

  const handleSelectResort = useCallback(
    (id: string) => {
      setHoveredResortId(null);
      saveReturnViewState();
      hasUserInteractedWithMapInDetailRef.current = false;
      setIsCompareOpen(false);
      setSelectedFinalizedFeature(null);
      setSelectedElevationProfilePoint(null);
      setSelectedResortId(id);
      setDetailSheetSnapPoint(BOTTOM_SHEET_DETAIL_INITIAL_SNAP_POINT);
      setIsListSheetOpen(false); // モーダルを開くときにボトムシートを閉じる
      startTransition(async () => {
        const data = await getSkiResortById(id);
        setSelectedResortData(data);
      });
    },
    [saveReturnViewState],
  );

  const handleCloseDetail = () => {
    const shouldRestoreMap = !hasUserInteractedWithMapInDetailRef.current;
    setSelectedResortId(null);
    setSelectedResortData(null);
    setSelectedFinalizedFeature(null);
    setSelectedElevationProfilePoint(null);
    setDetailSheetSnapPoint(BOTTOM_SHEET_INITIAL_SNAP_POINT);
    setHoveredResortId(null);
    hasUserInteractedWithMapInDetailRef.current = false;
    window.requestAnimationFrame(() => {
      scheduleRestoreDocumentPointerEvents();
      restoreReturnViewState(shouldRestoreMap);
    });
  };

  const handleToggleCompare = useCallback(
    (id: string, selected: boolean) => {
      setHoveredResortId(null);
      setSelectedCompareIds(prev => {
        if (selected) return prev.includes(id) ? prev : [...prev, id];
        return prev.filter(compareId => compareId !== id);
      });

      if (!isCompareOpen) return;

      if (!selected) {
        setCompareResortData(prev => prev.filter(resort => resort.id !== id));
        return;
      }

      setIsCompareLoading(true);
      startTransition(async () => {
        const data = await getSkiResortById(id);
        if (data) {
          setCompareResortData(prev =>
            prev.some(resort => resort.id === data.id) ? prev : [...prev, data],
          );
        }
        setIsCompareLoading(false);
      });
    },
    [isCompareOpen],
  );

  const handleOpenCompare = useCallback(async () => {
    if (selectedCompareIds.length === 0) return;

    setHoveredResortId(null);
    saveReturnViewState();
    setIsCompareOpen(true);
    setIsCompareLoading(true);
    if (isSidePanelLayout) {
      setIsListSheetOpen(false);
    } else {
      setListSheetSnapPoint(BOTTOM_SHEET_SEARCH_SNAP_POINT);
      setIsListSheetOpen(true);
    }
    setCompareResortData([]);

    const data = await Promise.all(
      selectedCompareIds.map(id => getSkiResortById(id)),
    );

    setCompareResortData(data.filter(resort => resort !== null));
    setIsCompareLoading(false);
  }, [isSidePanelLayout, saveReturnViewState, selectedCompareIds]);

  const handleMainPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-ski-resort-list-item='true']")
      ) {
        return;
      }

      setHoveredResortId(null);
    },
    [],
  );

  const handleCloseCompare = () => {
    setIsCompareOpen(false);
    restoreReturnViewState();
  };
  const mobileSearchResultSnapPoints = useMemo(
    () => [...BOTTOM_SHEET_SNAP_POINTS],
    [],
  );
  const mobileCompareSnapPoints = useMemo(
    () => [...BOTTOM_SHEET_SNAP_POINTS],
    [],
  );
  const mobileListSheetSnapPoints = isCompareOpen
    ? mobileCompareSnapPoints
    : mobileSearchResultSnapPoints;
  const mobileSearchFilterTop = "calc(env(safe-area-inset-top, 0px) + 4.5rem)";
  const mobileSearchKeyboardInset =
    isMobileSearchKeyboardActive &&
    mobileSearchViewport.keyboardInset > MOBILE_KEYBOARD_INSET_THRESHOLD
      ? mobileSearchViewport.keyboardInset
      : 0;
  const mobileSearchFilterBottomPadding = `calc(env(safe-area-inset-bottom, 0px) + ${mobileSearchKeyboardInset}px + 1rem)`;
  const shouldRenderMobileListSheet =
    !isSidePanelLayout && (hasSearched || isCompareOpen);

  return (
    <HomeLayout
      DynamicMap={DynamicMap}
      compareResortData={compareResortData}
      detailSheetSnapPoint={detailSheetSnapPoint}
      filteredResortIdSet={filteredResortIdSet}
      filteredResortIds={filteredResortIds}
      filteredResorts={filteredResorts}
      filters={filters}
      hasActiveFilters={hasActiveFilters}
      hasSearched={hasSearched}
      hoveredResortId={hoveredResortId}
      initialResorts={initialResorts}
      isCompareLoading={isCompareLoading}
      isCompareOpen={isCompareOpen}
      isFilterEditorOpen={isFilterEditorOpen}
      isListSheetOpen={isListSheetOpen}
      isMobileCompareButtonPinnedToTop={isMobileCompareButtonPinnedToTop}
      isMobileFilterOverlayOpen={isMobileFilterOverlayOpen}
      isPending={isPending}
      isSidePanelLayout={isSidePanelLayout}
      listSheetContentRef={listSheetContentRef}
      listSheetSnapPoint={listSheetSnapPoint}
      mapInteractionMode={mapInteractionMode}
      mobileCompareButtonBottom={mobileCompareButtonBottom}
      mobileFilterOverlayRef={mobileFilterOverlayRef}
      mobileListSheetSnapPoints={mobileListSheetSnapPoints}
      mobileSearchFilterBottomPadding={mobileSearchFilterBottomPadding}
      mobileSearchFilterScrollRef={mobileSearchFilterScrollRef}
      mobileSearchFilterTop={mobileSearchFilterTop}
      mobileSearchPanelInputRef={mobileSearchPanelInputRef}
      restoreViewRequest={restoreViewRequest}
      searchViewportBottomPaddingRatio={searchViewportBottomPaddingRatio}
      searchViewportRequestKey={searchViewportRequestKey}
      selectedCompareIdSet={selectedCompareIdSet}
      selectedCompareIds={selectedCompareIds}
      selectedElevationProfilePoint={selectedElevationProfilePoint}
      selectedFinalizedFeature={selectedFinalizedFeature}
      selectedResortData={selectedResortData}
      selectedResortId={selectedResortId}
      selectedViewportBottomPaddingRatio={selectedViewportBottomPaddingRatio}
      shouldRenderMobileListSheet={shouldRenderMobileListSheet}
      onCloseCompare={handleCloseCompare}
      onCloseDetail={handleCloseDetail}
      onCloseMobileFilterOverlay={handleCloseMobileFilterOverlay}
      onFilterChange={handleFilterChange}
      onFilterKeyboardInputBlur={handleFilterKeyboardInputBlur}
      onFilterKeyboardInputFocus={handleFilterKeyboardInputFocus}
      onMainPointerDownCapture={handleMainPointerDownCapture}
      onMapViewChange={handleMapViewChange}
      onMobileFilterAreaPointerDown={handleMobileFilterAreaPointerDown}
      onMobileKeywordChange={handleMobileKeywordChange}
      onMobileKeywordClear={() =>
        setFilters(prev => ({ ...prev, keyword: "" }))
      }
      onMobileSearchButtonPointerDown={handleMobileSearchButtonPointerDown}
      onMobileSearchFilterInputBlur={handleMobileSearchFilterInputBlur}
      onMobileSearchFilterInputFocus={handleMobileSearchFilterInputFocus}
      onMobileSearchSubmit={handleMobileSearchSubmit}
      onOpenCompare={handleOpenCompare}
      onOpenMobileFilterOverlay={handleOpenMobileFilterOverlay}
      onSearch={handleSearch}
      onSelectResort={handleSelectResort}
      onSelectedFinalizedFeatureChange={handleSelectedFinalizedFeatureChange}
      onSelectedElevationProfilePointChange={setSelectedElevationProfilePoint}
      onSetDetailSheetSnapPoint={setDetailSheetSnapPoint}
      onSetFilterEditorOpen={setIsFilterEditorOpen}
      onSetHoveredResortId={setHoveredResortId}
      onSetListSheetOpen={setIsListSheetOpen}
      onSetListSheetSnapPoint={setListSheetSnapPoint}
      onToggleCompare={handleToggleCompare}
      onUserMapInteraction={handleUserMapInteraction}
      onUserMapZoomInteraction={handleUserMapZoomInteraction}
    />
  );
}
