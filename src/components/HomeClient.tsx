"use client";

import { Box, Button, Flex, Input } from "@chakra-ui/react";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft, Search, X } from "lucide-react";
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { flushSync } from "react-dom";
import { Drawer } from "vaul";
import { getSkiResortById } from "@/actions/skiResorts";
import {
  DEFAULT_FILTERS,
  FilterPanel,
  type Filters,
} from "@/components/FilterPanel";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { SkiResortCompareView } from "@/components/SkiResortCompareView";
import { SkiResortDetailView } from "@/components/SkiResortDetailView";
import { SkiResortList } from "@/components/SkiResortList";
import type {
  MapSkiResort,
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";

type Props = {
  initialResorts: MapSkiResort[];
};

type MapViewSnapshot = {
  center: { lat: number; lng: number };
  zoom: number;
};

type MapViewRestoreRequest = MapViewSnapshot & {
  key: number;
};

type ReturnViewState = {
  isListSheetOpen: boolean;
  listSheetSnapPoint: number | string | null;
  listScrollTop: number;
  mapView: MapViewSnapshot | null;
};

type MobileSearchReturnState = {
  isListSheetOpen: boolean;
  listSheetSnapPoint: number | string | null;
  selectedResortId: string | null;
  selectedResortData: NullableSkiResortDetail | null;
  detailSheetSnapPoint: number | string | null;
  isCompareOpen: boolean;
};

type VisualViewportState = {
  keyboardInset: number;
};

const hasNumericFilterValue = (value: number | null | undefined) =>
  value != null;

const isFilterActive = (filters: Filters) =>
  filters.keyword.trim() !== "" ||
  filters.prefectures.length > 0 ||
  filters.status ||
  filters.yukiMagi ||
  filters.beginnerFriendly ||
  hasNumericFilterValue(filters.minVertical) ||
  hasNumericFilterValue(filters.minBaseElevation) ||
  hasNumericFilterValue(filters.maxBaseElevation) ||
  hasNumericFilterValue(filters.minTopElevation) ||
  hasNumericFilterValue(filters.maxTopElevation) ||
  hasNumericFilterValue(filters.minCourses) ||
  hasNumericFilterValue(filters.minLifts);

const BOTTOM_SHEET_COLLAPSED_SNAP_POINT = 0.095;
const BOTTOM_SHEET_MIDDLE_SNAP_POINT = 0.46;
const BOTTOM_SHEET_EXPANDED_SNAP_POINT = 0.86;
const BOTTOM_SHEET_SNAP_POINTS = [
  BOTTOM_SHEET_COLLAPSED_SNAP_POINT,
  BOTTOM_SHEET_MIDDLE_SNAP_POINT,
  BOTTOM_SHEET_EXPANDED_SNAP_POINT,
] as const;
const BOTTOM_SHEET_INITIAL_SNAP_POINT = BOTTOM_SHEET_COLLAPSED_SNAP_POINT;
const BOTTOM_SHEET_SEARCH_SNAP_POINT = BOTTOM_SHEET_MIDDLE_SNAP_POINT;
const BOTTOM_SHEET_DETAIL_COLLAPSED_SNAP_POINT = 0.12;
const BOTTOM_SHEET_DETAIL_INITIAL_SNAP_POINT = 0.52;
const BOTTOM_SHEET_MAP_PEEK_HEIGHT = "14dvh";
const MOBILE_COMPARE_BUTTON_BOTTOM_CLOSED = "6rem";
const MOBILE_COMPARE_BUTTON_BOTTOM_GAP = "1rem";
const MOBILE_KEYBOARD_INSET_THRESHOLD = 72;
const SIDE_PANEL_MEDIA_QUERY = "(min-width: 48em)";
const MAP_ZOOM_SURFACE_SELECTOR = '[data-map-zoom-surface="true"]';
const getBottomSheetHeightRatio = (snapPoint: number | string | null) =>
  typeof snapPoint === "number" ? snapPoint : 0;
const isBottomSheetExpanded = (snapPoint: number | string | null) =>
  typeof snapPoint === "number" &&
  Math.abs(snapPoint - BOTTOM_SHEET_EXPANDED_SNAP_POINT) < 0.001;
const isKeyboardInputElement = (element: Element | null) =>
  element instanceof HTMLInputElement ||
  element instanceof HTMLTextAreaElement ||
  element instanceof HTMLSelectElement;
const isEventInsideMapZoomSurface = (event: Event) => {
  const composedPath = event.composedPath();
  return composedPath.some(
    target =>
      target instanceof Element &&
      target.closest(MAP_ZOOM_SURFACE_SELECTOR) !== null,
  );
};
const restoreDocumentPointerEvents = () => {
  if (typeof document === "undefined") return;

  document.body.style.pointerEvents = "";
};
const scheduleRestoreDocumentPointerEvents = () => {
  restoreDocumentPointerEvents();
  window.requestAnimationFrame(restoreDocumentPointerEvents);
  window.setTimeout(restoreDocumentPointerEvents, 0);
  window.setTimeout(restoreDocumentPointerEvents, 120);
  window.setTimeout(restoreDocumentPointerEvents, 300);
};
const getSearchResultListScrollElement = () =>
  typeof document === "undefined"
    ? null
    : ([
        ...document.querySelectorAll<HTMLElement>(
          '[data-ski-resort-list-scroll-container="true"], [data-ski-resort-list-scroll="true"]',
        ),
      ].find(element => element.scrollHeight > element.clientHeight) ?? null);
const restoreSearchResultListScroll = (scrollTop: number) => {
  const scrollElement = getSearchResultListScrollElement();
  if (!scrollElement) return;

  scrollElement.scrollTop = scrollTop;
};
const scheduleRestoreSearchResultListScroll = (scrollTop: number) => {
  window.requestAnimationFrame(() => restoreSearchResultListScroll(scrollTop));
  window.setTimeout(() => restoreSearchResultListScroll(scrollTop), 0);
  window.setTimeout(() => restoreSearchResultListScroll(scrollTop), 120);
};

const matchesFilters = (resort: MapSkiResort, filters: Filters) => {
  if (filters.status && !resort.status?.includes("滑走可")) return false;
  if (filters.yukiMagi && !resort.yukiMagiId) return false;
  if (filters.beginnerFriendly && resort.beginnersCoursesPercent < 30) {
    return false;
  }
  if (
    filters.prefectures.length > 0 &&
    !filters.prefectures.includes(resort.prefecture)
  ) {
    return false;
  }
  if (
    filters.keyword.trim() !== "" &&
    !`${resort.nameJa} ${resort.nameEn ?? ""} ${resort.prefecture} ${
      resort.town
    }`
      .toLowerCase()
      .includes(filters.keyword.trim().toLowerCase())
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.minVertical) &&
    filters.minVertical > resort.verticalDrop
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.minBaseElevation) &&
    filters.minBaseElevation > resort.baseElevation
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.maxBaseElevation) &&
    filters.maxBaseElevation < resort.baseElevation
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.minTopElevation) &&
    filters.minTopElevation > resort.topElevation
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.maxTopElevation) &&
    filters.maxTopElevation < resort.topElevation
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.minCourses) &&
    filters.minCourses > resort.numberOfCourses
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.minLifts) &&
    filters.minLifts > resort.numberOfLifts
  ) {
    return false;
  }
  return true;
};

export function HomeClient({ initialResorts }: Props) {
  // マップコンポーネントを SSR 無効で動的インポート
  const DynamicMap = useMemo(
    () =>
      dynamic(
        () => import("@/components/SkiResortMap").then(mod => mod.SkiResortMap),
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
  const [isSidePanelLayout, setIsSidePanelLayout] = useState(false);

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
    const mediaQuery = window.matchMedia(SIDE_PANEL_MEDIA_QUERY);
    const syncSidePanelLayout = () => {
      setIsSidePanelLayout(mediaQuery.matches);
    };

    syncSidePanelLayout();
    mediaQuery.addEventListener("change", syncSidePanelLayout);
    return () => {
      mediaQuery.removeEventListener("change", syncSidePanelLayout);
    };
  }, []);

  useEffect(() => {
    if (isSidePanelLayout) {
      setIsListSheetOpen(false);
      setIsMobileFilterOverlayOpen(false);
    }
  }, [isSidePanelLayout]);

  useEffect(() => {
    if (selectedResortId || isMobileFilterOverlayOpen) return;

    scheduleRestoreDocumentPointerEvents();
  }, [isMobileFilterOverlayOpen, selectedResortId]);

  useEffect(() => {
    const preventNonMapGestureZoom = (event: Event) => {
      if (isEventInsideMapZoomSurface(event)) return;
      event.preventDefault();
    };
    const preventNonMapMultiTouchZoom = (event: TouchEvent) => {
      if (event.touches.length < 2 || isEventInsideMapZoomSurface(event)) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener("gesturestart", preventNonMapGestureZoom, {
      capture: true,
      passive: false,
    });
    document.addEventListener("gesturechange", preventNonMapGestureZoom, {
      capture: true,
      passive: false,
    });
    document.addEventListener("gestureend", preventNonMapGestureZoom, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchmove", preventNonMapMultiTouchZoom, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener("gesturestart", preventNonMapGestureZoom, {
        capture: true,
      });
      document.removeEventListener("gesturechange", preventNonMapGestureZoom, {
        capture: true,
      });
      document.removeEventListener("gestureend", preventNonMapGestureZoom, {
        capture: true,
      });
      document.removeEventListener("touchmove", preventNonMapMultiTouchZoom, {
        capture: true,
      });
    };
  }, []);

  useEffect(() => {
    const gestureGuardElements = [
      listSheetContentRef.current,
      isMobileFilterOverlayOpen ? mobileFilterOverlayRef.current : null,
    ].filter((element): element is HTMLDivElement => element !== null);
    if (isSidePanelLayout || gestureGuardElements.length === 0) return;

    const preventGestureZoom = (event: Event) => {
      event.preventDefault();
    };
    const preventMultiTouchZoom = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      event.preventDefault();
    };

    gestureGuardElements.forEach(element => {
      element.addEventListener("gesturestart", preventGestureZoom, {
        passive: false,
      });
      element.addEventListener("gesturechange", preventGestureZoom, {
        passive: false,
      });
      element.addEventListener("gestureend", preventGestureZoom, {
        passive: false,
      });
      element.addEventListener("touchmove", preventMultiTouchZoom, {
        passive: false,
      });
    });

    return () => {
      gestureGuardElements.forEach(element => {
        element.removeEventListener("gesturestart", preventGestureZoom);
        element.removeEventListener("gesturechange", preventGestureZoom);
        element.removeEventListener("gestureend", preventGestureZoom);
        element.removeEventListener("touchmove", preventMultiTouchZoom);
      });
    };
  }, [isMobileFilterOverlayOpen, isSidePanelLayout]);

  useLayoutEffect(() => {
    if (!isMobileFilterOverlayOpen || isSidePanelLayout) return;

    const frame = window.requestAnimationFrame(() => {
      mobileSearchPanelInputRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isMobileFilterOverlayOpen, isSidePanelLayout]);

  useEffect(() => {
    if (!isMobileFilterOverlayOpen || isSidePanelLayout) return;

    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyOverscrollBehavior =
      document.body.style.overscrollBehavior;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.overscrollBehavior = originalBodyOverscrollBehavior;
    };
  }, [isMobileFilterOverlayOpen, isSidePanelLayout]);

  useEffect(() => {
    if (!isMobileFilterOverlayOpen || isSidePanelLayout) {
      setMobileSearchViewport({ keyboardInset: 0 });
      setIsMobileSearchKeyboardActive(false);
      mobileSearchViewportBaseHeightRef.current = null;
      return;
    }

    const visualViewport = window.visualViewport;
    const syncViewport = () => {
      const height = visualViewport?.height ?? window.innerHeight;
      const offsetTop = visualViewport?.offsetTop ?? 0;
      const effectiveHeight = height + offsetTop;
      const previousBaseHeight = mobileSearchViewportBaseHeightRef.current;
      const baseHeight =
        previousBaseHeight == null
          ? effectiveHeight
          : Math.max(previousBaseHeight, effectiveHeight);
      mobileSearchViewportBaseHeightRef.current = baseHeight;
      const keyboardInset = Math.max(0, baseHeight - effectiveHeight);
      setMobileSearchViewport({
        keyboardInset,
      });
    };

    syncViewport();
    visualViewport?.addEventListener("resize", syncViewport);
    window.addEventListener("resize", syncViewport);

    return () => {
      visualViewport?.removeEventListener("resize", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, [isMobileFilterOverlayOpen, isSidePanelLayout]);

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
  const handleBoundsChange = useCallback(() => undefined, []);
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
  useEffect(() => {
    const isInsideMapZoomSurface = (event: Event) =>
      event
        .composedPath()
        .some(
          target =>
            target instanceof Element &&
            target.closest(MAP_ZOOM_SURFACE_SELECTOR) !== null,
        );
    const handleWheel = (event: WheelEvent) => {
      if (!isInsideMapZoomSurface(event)) return;

      handleUserMapZoomInteraction();
    };
    const handleDoubleClick = (event: MouseEvent) => {
      if (!isInsideMapZoomSurface(event)) return;

      handleUserMapZoomInteraction();
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2 || !isInsideMapZoomSurface(event)) return;

      handleUserMapZoomInteraction();
    };

    document.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: true,
    });
    document.addEventListener("dblclick", handleDoubleClick, {
      capture: true,
    });
    document.addEventListener("touchstart", handleTouchStart, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("wheel", handleWheel, { capture: true });
      document.removeEventListener("dblclick", handleDoubleClick, {
        capture: true,
      });
      document.removeEventListener("touchstart", handleTouchStart, {
        capture: true,
      });
    };
  }, [handleUserMapZoomInteraction]);

  const handleSelectResort = useCallback(
    (id: string) => {
      setHoveredResortId(null);
      saveReturnViewState();
      hasUserInteractedWithMapInDetailRef.current = false;
      setIsCompareOpen(false);
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
    <Flex
      as="main"
      onPointerDownCapture={handleMainPointerDownCapture}
      position="relative"
      h="100vh"
      w="100vw"
      overflow="hidden"
      flexDirection={{ md: "row" }}
      bg="var(--bg-light)"
    >
      {/* --- 地図表示エリア --- */}
      <Box h="100%" w="100%" position="relative">
        <DynamicMap
          resorts={initialResorts}
          filteredResortIdSet={filteredResortIdSet}
          isFilterActive={hasActiveFilters}
          searchResultResortIds={filteredResortIds}
          searchViewportRequestKey={searchViewportRequestKey}
          searchViewportBottomPaddingRatio={searchViewportBottomPaddingRatio}
          mapControlBottomPaddingRatio={searchViewportBottomPaddingRatio}
          selectedResortId={selectedResortId}
          selectedViewportBottomPaddingRatio={
            selectedViewportBottomPaddingRatio
          }
          hoveredResortId={hoveredResortId}
          onSelectResort={handleSelectResort}
          interactionMode={mapInteractionMode}
          selectedCompareIdSet={selectedCompareIdSet}
          onToggleCompare={handleToggleCompare}
          onBoundsChange={handleBoundsChange}
          onViewChange={handleMapViewChange}
          onUserMapInteraction={handleUserMapInteraction}
          onUserMapZoomInteraction={handleUserMapZoomInteraction}
          restoreViewRequest={restoreViewRequest}
        />
        <Box
          display={{
            base: isCompareOpen || isMobileFilterOverlayOpen ? "none" : "flex",
            md: "none",
          }}
          position="fixed"
          top="calc(env(safe-area-inset-top, 0px) + 0.75rem)"
          left={4}
          right={4}
          zIndex={200001}
          pointerEvents="auto"
        >
          <Button
            type="button"
            aria-label="スキー場を検索"
            position="relative"
            zIndex={1}
            justifyContent="flex-start"
            w="100%"
            h={12}
            pl={12}
            pr={4}
            borderRadius="full"
            border="1px solid"
            borderColor="rgba(226, 232, 240, 0.88)"
            bg="rgba(255, 255, 255, 0.97)"
            color={filters.keyword ? "gray.800" : "gray.500"}
            fontSize="1.05rem"
            fontWeight="500"
            boxShadow="0 10px 30px rgba(15, 23, 42, 0.18)"
            backdropFilter="blur(18px)"
            pointerEvents="auto"
            _hover={{ bg: "rgba(255, 255, 255, 0.98)" }}
            onPointerDown={handleMobileSearchButtonPointerDown}
            onClick={handleOpenMobileFilterOverlay}
          >
            <Box
              position="absolute"
              left={4}
              top="50%"
              transform="translateY(-50%)"
              color="gray.500"
              pointerEvents="none"
            >
              <Search size={20} />
            </Box>
            <Box
              as="span"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
            >
              {filters.keyword || "スキー場を検索"}
            </Box>
          </Button>
        </Box>
        <AnimatePresence>
          {isMobileFilterOverlayOpen && !isSidePanelLayout && (
            <Box
              data-mobile-search-panel="true"
              position="fixed"
              top={0}
              right={0}
              bottom={0}
              left={0}
              zIndex={200000}
              display={{ base: "block", md: "none" }}
              bg="rgba(248, 250, 252, 0.98)"
              overflow="hidden"
            >
              <Box
                ref={mobileFilterOverlayRef}
                position="absolute"
                top={0}
                right={0}
                left={0}
                h="100dvh"
                minH={0}
                overflow="hidden"
                style={{ touchAction: "pan-y" }}
              >
                <Flex
                  as="form"
                  position="absolute"
                  top={0}
                  right={0}
                  left={0}
                  zIndex={1}
                  alignItems="center"
                  h="calc(env(safe-area-inset-top, 0px) + 4.5rem)"
                  px={4}
                  pt="calc(env(safe-area-inset-top, 0px) + 0.75rem)"
                  pb={3}
                  bg="rgba(248, 250, 252, 0.98)"
                  borderBottom="1px solid"
                  borderColor="gray.100"
                  onSubmit={handleMobileSearchSubmit}
                >
                  <Flex
                    position="relative"
                    alignItems="center"
                    w="100%"
                    h={12}
                    borderRadius="full"
                    bg="gray.100"
                    overflow="hidden"
                  >
                    <Button
                      type="button"
                      aria-label="検索を閉じる"
                      flexShrink={0}
                      w={12}
                      h={12}
                      minW={12}
                      p={0}
                      borderRadius="full"
                      bg="transparent"
                      color="gray.900"
                      boxShadow="none"
                      _hover={{ bg: "gray.200" }}
                      onClick={handleCloseMobileFilterOverlay}
                    >
                      <ChevronLeft size={30} strokeWidth={2.7} />
                    </Button>
                    <Box position="relative" flex={1} minW={0}>
                      <Input
                        ref={mobileSearchPanelInputRef}
                        aria-label="スキー場を検索"
                        type="text"
                        value={filters.keyword}
                        placeholder="スキー場名を検索"
                        h={12}
                        px={0}
                        pr={filters.keyword ? 9 : 1}
                        borderRadius="0"
                        border="0"
                        borderLeft="0"
                        borderRight="0"
                        borderInlineStart="0"
                        borderInlineEnd="0"
                        appearance="none"
                        bg="transparent"
                        color="gray.800"
                        fontSize="1.1rem"
                        fontWeight="500"
                        boxShadow="none"
                        outline="none"
                        _autofill={{
                          boxShadow: "0 0 0 1000px transparent inset",
                        }}
                        _placeholder={{ color: "gray.500", fontWeight: "500" }}
                        _focus={{ boxShadow: "none" }}
                        _focusVisible={{ boxShadow: "none", outline: "none" }}
                        onFocus={handleMobileSearchFilterInputFocus}
                        onBlur={handleMobileSearchFilterInputBlur}
                        onChange={handleMobileKeywordChange}
                      />
                      {filters.keyword && (
                        <Button
                          type="button"
                          aria-label="検索キーワードをクリア"
                          position="absolute"
                          top="50%"
                          right={0}
                          transform="translateY(-50%)"
                          w={8}
                          h={8}
                          minW={8}
                          p={0}
                          borderRadius="full"
                          bg="transparent"
                          color="gray.500"
                          _hover={{ bg: "gray.200" }}
                          onClick={() =>
                            setFilters(prev => ({ ...prev, keyword: "" }))
                          }
                        >
                          <X size={18} />
                        </Button>
                      )}
                    </Box>
                    <Button
                      type="submit"
                      flexShrink={0}
                      h={10}
                      minW="4.75rem"
                      mr={1}
                      px={4}
                      borderRadius="full"
                      bg="brand.500"
                      color="white"
                      fontSize="0.9rem"
                      fontWeight="900"
                      boxShadow="none"
                      _hover={{ bg: "brand.600" }}
                      aria-label="検索"
                    >
                      検索
                    </Button>
                  </Flex>
                </Flex>
                <Box
                  ref={mobileSearchFilterScrollRef}
                  data-mobile-search-filter-scroll="true"
                  position="absolute"
                  top={mobileSearchFilterTop}
                  right={0}
                  bottom={0}
                  left={0}
                  display="flex"
                  flexDirection="column"
                  overflowY="auto"
                  overscrollBehavior="contain"
                  WebkitOverflowScrolling="touch"
                  pb={mobileSearchFilterBottomPadding}
                  onPointerDown={handleMobileFilterAreaPointerDown}
                  onTouchStart={handleMobileFilterAreaPointerDown}
                >
                  <FilterPanel
                    filters={filters}
                    resorts={initialResorts}
                    resultCount={filteredResorts.length}
                    isExpanded
                    canCollapse={false}
                    onExpandedChange={() => undefined}
                    onFilterChange={handleFilterChange}
                    onKeyboardInputBlur={handleMobileSearchFilterInputBlur}
                    onKeyboardInputFocus={handleMobileSearchFilterInputFocus}
                    onSearch={handleSearch}
                    scrollContent={false}
                    showKeywordSearch={false}
                    title="絞り込み"
                  />
                </Box>
              </Box>
            </Box>
          )}
        </AnimatePresence>
      </Box>

      {/* --- PC用の右カラム --- */}
      <Box
        display={{ base: "none", md: "block" }}
        h="100%"
        w="400px"
        flexShrink={0}
        borderLeft="1px solid"
        borderColor="gray.200"
        bg="rgba(255, 255, 255, 0.8)"
        backdropFilter="blur(16px)"
        position="relative"
        zIndex={10}
        boxShadow="-4px 0 20px rgba(0,0,0,0.05)"
      >
        <Flex h="100%" minH={0} flexDirection="column" overflow="hidden">
          <FilterPanel
            filters={filters}
            resorts={initialResorts}
            resultCount={filteredResorts.length}
            isExpanded={isFilterEditorOpen}
            canCollapse={hasSearched}
            onExpandedChange={setIsFilterEditorOpen}
            onFilterChange={handleFilterChange}
            onKeyboardInputBlur={handleFilterKeyboardInputBlur}
            onKeyboardInputFocus={handleFilterKeyboardInputFocus}
            onSearch={handleSearch}
          />
          {hasSearched && !isFilterEditorOpen && (
            <Box
              data-ski-resort-list-scroll-container="true"
              flexGrow={1}
              minH={0}
            >
              <SkiResortList
                resorts={filteredResorts}
                onSelectResort={handleSelectResort}
                selectedCompareIdSet={selectedCompareIdSet}
                onToggleCompare={handleToggleCompare}
                onHoverResortChange={setHoveredResortId}
                showHeader={false}
              />
            </Box>
          )}
        </Flex>
      </Box>

      {/* --- スマートフォン用のボトムシート --- */}
      {shouldRenderMobileListSheet && (
        <Box>
          {isBottomSheetExpanded(listSheetSnapPoint) && (
            <Box
              as="button"
              position="fixed"
              top={0}
              left={0}
              right={0}
              zIndex={10000}
              h={BOTTOM_SHEET_MAP_PEEK_HEIGHT}
              bg="transparent"
              aria-label="地図を表示"
              onClick={() =>
                setListSheetSnapPoint(BOTTOM_SHEET_SEARCH_SNAP_POINT)
              }
            />
          )}
          <Drawer.Root
            open={isListSheetOpen}
            onOpenChange={open => {
              setIsListSheetOpen(open && (hasSearched || isCompareOpen));
              if (!open && isCompareOpen) {
                handleCloseCompare();
              }
            }}
            activeSnapPoint={listSheetSnapPoint}
            setActiveSnapPoint={setListSheetSnapPoint}
            snapPoints={mobileListSheetSnapPoints}
            dismissible={false}
            modal={false}
            noBodyStyles
            repositionInputs
          >
            <Drawer.Portal>
              <Drawer.Content
                ref={listSheetContentRef}
                style={{
                  position: "fixed",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  zIndex: 9999,
                  display: "flex",
                  flexDirection: "column",
                  borderTopLeftRadius: "1.5rem",
                  borderTopRightRadius: "1.5rem",
                  backgroundColor: "#ffffff",
                  borderTop: "1px solid rgba(0, 0, 0, 0.06)",
                  height: "calc(100dvh + env(safe-area-inset-bottom, 0px))",
                  paddingBottom: "env(safe-area-inset-bottom, 0px)",
                  boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.1)",
                  outline: "none",
                  touchAction: "pan-y",
                }}
              >
                <Drawer.Title
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: "hidden",
                    clip: "rect(0, 0, 0, 0)",
                    border: 0,
                  }}
                >
                  スキー場検索
                </Drawer.Title>
                <Drawer.Handle
                  style={{
                    width: "4rem",
                    height: "0.25rem",
                    flexShrink: 0,
                    borderRadius: "999px",
                    backgroundColor: "#d1d5db",
                    margin: "0.5rem auto 0.25rem",
                  }}
                />
                <Box h="calc(100dvh - 26px)" minH={0} bg="white">
                  {isCompareOpen ? (
                    <SkiResortCompareView
                      resorts={compareResortData}
                      isLoading={isCompareLoading}
                      onClose={handleCloseCompare}
                      presentation="inline"
                      canScrollContent={isBottomSheetExpanded(
                        listSheetSnapPoint,
                      )}
                      onContentScrollIntent={() =>
                        setListSheetSnapPoint(BOTTOM_SHEET_EXPANDED_SNAP_POINT)
                      }
                    />
                  ) : (
                    <Box
                      data-ski-resort-list-scroll-container="true"
                      h="100%"
                      minH={0}
                      overflowY="auto"
                    >
                      {hasSearched && (
                        <SkiResortList
                          resorts={filteredResorts}
                          onSelectResort={handleSelectResort}
                          selectedCompareIdSet={selectedCompareIdSet}
                          onToggleCompare={handleToggleCompare}
                          onHoverResortChange={setHoveredResortId}
                          showHeader={false}
                        />
                      )}
                    </Box>
                  )}
                </Box>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        </Box>
      )}

      {selectedCompareIds.length > 0 && !isCompareOpen && (
        <Button
          position="fixed"
          top={{
            base: isMobileCompareButtonPinnedToTop ? 4 : "auto",
            md: "auto",
          }}
          right={{ base: 4, md: "424px" }}
          bottom={{ base: mobileCompareButtonBottom, md: 6 }}
          zIndex={10000}
          pointerEvents="auto"
          h={12}
          px={5}
          borderRadius="full"
          bg="gray.900"
          color="white"
          fontWeight="800"
          boxShadow="0 12px 30px rgba(0, 0, 0, 0.22)"
          _hover={{ bg: "gray.800", transform: "translateY(-1px)" }}
          onClick={handleOpenCompare}
        >
          {selectedCompareIds.length} 件を比較
        </Button>
      )}

      {/* --- 詳細モーダルの表示 --- */}
      <AnimatePresence>
        {selectedResortId && (
          <SkiResortDetailView
            resortData={selectedResortData}
            isLoading={isPending}
            isCompareSelected={selectedCompareIdSet.has(selectedResortId)}
            sheetSnapPoint={detailSheetSnapPoint}
            setSheetSnapPoint={setDetailSheetSnapPoint}
            onToggleCompare={handleToggleCompare}
            onClose={handleCloseDetail}
          />
        )}
      </AnimatePresence>

      {/* --- 比較モーダルの表示 --- */}
      <AnimatePresence>
        {isCompareOpen && isSidePanelLayout && (
          <SkiResortCompareView
            resorts={compareResortData}
            isLoading={isCompareLoading}
            onClose={handleCloseCompare}
          />
        )}
      </AnimatePresence>
    </Flex>
  );
}
