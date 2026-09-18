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
import { z } from "zod";
import { getSkiResortById } from "@/actions/skiResorts";
import { DEFAULT_FILTERS } from "@/features/filters/constants";
import type { Filters } from "@/features/filters/types";
import {
  areFiltersEqual,
  isFilterActive,
  matchesFilters,
} from "@/features/filters/utils/filterResorts";
import {
  readDetailCache,
  readOverviewCache,
  retainDetailCaches,
  writeDetailCache,
  writeOverviewCache,
} from "@/features/map/session/detailCache";
import { MapSessionProvider } from "@/features/map/session/MapSessionProvider";
import { prepareDetail } from "@/features/map/session/prepareDetail";
import {
  HOME_SESSION_KEY,
  type HomeSession,
  homeSessionSchema,
  initializeTabSession,
  readStorage,
  resolveHomeSession,
  retainResortSession,
  writeStorage,
} from "@/features/map/session/storage";
import type {
  ElevationProfileMapPoint,
  SelectedMapFeature,
} from "@/features/map/types";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type {
  MapSkiResort,
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";
import {
  BOTTOM_SHEET_COLLAPSED_SNAP_POINT,
  BOTTOM_SHEET_EXPANDED_SNAP_POINT,
  BOTTOM_SHEET_INITIAL_SNAP_POINT,
  BOTTOM_SHEET_SEARCH_SNAP_POINT,
  BOTTOM_SHEET_SNAP_POINTS,
  getBottomSheetHeightRatio,
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
  scheduleRestoreSearchResultListScroll,
} from "./utils/dom";

type Props = {
  initialResorts: MapSkiResort[];
};

export function HomeClient({ initialResorts }: Props) {
  const [boot, setBoot] = useState<{
    session: HomeSession | null;
    resorts: MapSkiResort[];
  } | null>(null);
  useEffect(() => {
    initializeTabSession();
    const stored = readStorage(HOME_SESSION_KEY, homeSessionSchema);
    const defaults: HomeSession = {
      version: 1,
      selectedResortId: null,
      selectedFeature: null,
      mobileContentTab: "map",
      filters: DEFAULT_FILTERS,
      hasSearched: false,
      isFilterEditorOpen: true,
      isListSheetOpen: false,
      listSheetSnapPoint: BOTTOM_SHEET_INITIAL_SNAP_POINT,
    };
    const tokenKey = `${HOME_SESSION_KEY}:data`;
    const token =
      readStorage(tokenKey, z.string()) ??
      crypto.randomUUID?.() ??
      `${Date.now()}-${Math.random()}`;
    writeStorage(tokenKey, token);
    let disposed = false;
    void readOverviewCache(token).then(cached => {
      if (disposed) return;
      const resorts = cached ?? initialResorts;
      if (!cached) void writeOverviewCache(token, initialResorts);
      setBoot({
        resorts,
        session: resolveHomeSession(
          stored ?? defaults,
          new URL(window.location.href),
          new Set(resorts.map(resort => resort.id)),
        ),
      });
    });
    return () => {
      disposed = true;
    };
  }, [initialResorts]);
  // 親（body直下）に確定した高さがないので、ここで画面いっぱいの高さを渡す。
  // 渡さないと h-full が潰れて、スピナーが画面の上端に貼り付く。
  if (!boot)
    return <LoadingSpinner className="h-dvh" text="地図を準備しています..." />;
  return (
    <HomeClientContent initialResorts={boot.resorts} session={boot.session} />
  );
}

function HomeClientContent({
  initialResorts,
  session,
}: Props & { session: HomeSession | null }) {
  // マップコンポーネントを SSR 無効で動的インポート
  const DynamicMap = useMemo(
    () =>
      dynamic(
        () =>
          import("@/features/map/MapLibreResortMap").then(
            mod => mod.MapLibreResortMap,
          ),
        {
          loading: () => <LoadingSpinner text="地図を読み込んでいます..." />,
          ssr: false,
        },
      ),
    [],
  );

  // --- State管理 ---
  const [filters, setFilters] = useState<Filters>(
    session?.filters ?? DEFAULT_FILTERS,
  );
  const [mobileDraftFilters, setMobileDraftFilters] = useState<Filters>(
    session?.mobileDraftFilters ?? session?.filters ?? DEFAULT_FILTERS,
  );
  const [isFilterEditorOpen, setIsFilterEditorOpen] = useState(
    session?.isFilterEditorOpen ?? true,
  );
  const [hasSearched, setHasSearched] = useState(session?.hasSearched ?? false);
  const [selectedResortId, setSelectedResortId] = useState<string | null>(
    session?.selectedResortId ?? null,
  );
  const [selectedResortData, setSelectedResortData] =
    useState<NullableSkiResortDetail | null>(null);
  const [selectedFinalizedFeature, setSelectedFinalizedFeature] =
    useState<SelectedMapFeature | null>(session?.selectedFeature ?? null);
  const [selectedElevationProfilePoint, setSelectedElevationProfilePoint] =
    useState<ElevationProfileMapPoint | null>(
      session?.selectedElevationProfilePoint ?? null,
    );
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>(
    session?.selectedCompareIds ?? [],
  );
  const [compareResortData, setCompareResortData] = useState<SkiResortDetail[]>(
    [],
  );
  const [isCompareOpen, setIsCompareOpen] = useState(
    session?.isCompareOpen ?? false,
  );
  const [isCompareLoading, setIsCompareLoading] = useState(false);
  const [isMobileFilterOverlayOpen, setIsMobileFilterOverlayOpen] = useState(
    session?.isMobileFilterOverlayOpen ?? false,
  );
  const [isListSheetOpen, setIsListSheetOpen] = useState(
    session?.isListSheetOpen ?? false,
  );
  const [listSheetSnapPoint, setListSheetSnapPoint] = useState<
    number | string | null
  >(session?.listSheetSnapPoint ?? BOTTOM_SHEET_INITIAL_SNAP_POINT);
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
  const [mobileContentTab, setMobileContentTab] = useState<"info" | "map">(
    session?.mobileContentTab ?? "map",
  );
  const [isPending, startTransition] = useTransition();
  const [discardFilterChangesDialogOpen, setDiscardFilterChangesDialogOpen] =
    useState(false);
  const latestMapViewRef = useRef<MapViewSnapshot | null>(null);
  const listSheetContentRef = useRef<HTMLDivElement | null>(null);
  const mobileFilterOverlayRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchPanelInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchFilterScrollRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchViewportBaseHeightRef = useRef<number | null>(null);
  const returnViewStateRef = useRef<ReturnViewState | null>(null);
  const mobileSearchReturnStateRef = useRef<MobileSearchReturnState | null>(
    session?.mobileSearchReturn
      ? { ...session.mobileSearchReturn, selectedResortData: null }
      : null,
  );
  const hasUserInteractedWithMapInDetailRef = useRef(false);
  const keyboardReturnSnapPointRef = useRef<number | string | null>(null);
  const isSidePanelLayout = useSidePanelLayout();

  useHomeGestureGuards({
    isMobileFilterOverlayOpen,
    isSidePanelLayout,
    listSheetContentRef,
    mobileFilterOverlayRef,
  });
  useMobileSearchOverlayEffects({
    isOpen: isMobileFilterOverlayOpen,
    isSidePanelLayout,
    overlayRef: mobileFilterOverlayRef,
    viewportBaseHeightRef: mobileSearchViewportBaseHeightRef,
    setIsKeyboardActive: setIsMobileSearchKeyboardActive,
    setViewport: setMobileSearchViewport,
  });

  useEffect(() => {
    const retainedIds = retainResortSession(selectedResortId);
    const tabId = readStorage(`${HOME_SESSION_KEY}:data`, z.string());
    if (tabId) void retainDetailCaches(tabId, retainedIds);
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    void navigator.serviceWorker.ready.then(registration => {
      if (!disposed)
        registration.active?.postMessage({
          type: "SET_VIEW",
          id: selectedResortId,
          tabId,
          retainedIds,
        });
    });
    return () => {
      disposed = true;
    };
  }, [selectedResortId]);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailRetry, setDetailRetry] = useState(0);
  useEffect(() => {
    void detailRetry;
    if (!selectedResortId) {
      setSelectedResortData(null);
      setDetailLoading(false);
      setDetailError(false);
      return;
    }
    let disposed = false;
    let generation = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const refresh = async () => {
      const current = ++generation;
      setDetailLoading(true);
      setDetailError(false);
      // キャッシュは先に表示。ネットワークの応答待ちで地図を塞がない。
      void readDetailCache(selectedResortId).then(cached => {
        if (!disposed && current === generation && cached) {
          setSelectedResortData(previous =>
            previous?.id === selectedResortId ? previous : cached,
          );
          void prepareDetail(cached, true);
        }
      });
      if (!navigator.onLine) {
        setDetailLoading(false);
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const data = await Promise.race([
          getSkiResortById(selectedResortId),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("timeout")), 12000);
            timers.add(timer);
          }),
        ]);
        if (disposed || current !== generation) return;
        if (!data) {
          setDetailError(true);
          return;
        }
        setSelectedResortData(data);
        void writeDetailCache(
          data,
          readStorage(`${HOME_SESSION_KEY}:data`, z.string()) ?? undefined,
        ).then(saved => prepareDetail(data, saved));
      } catch {
        if (!disposed && current === generation) setDetailError(true);
      } finally {
        if (timer) {
          clearTimeout(timer);
          timers.delete(timer);
        }
        if (!disposed && current === generation) setDetailLoading(false);
      }
    };
    const resume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      for (const timer of timers) clearTimeout(timer);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [selectedResortId, detailRetry]);

  useEffect(() => {
    if (
      !selectedFinalizedFeature ||
      !selectedResortData ||
      selectedResortData.id !== selectedResortId
    )
      return;
    const geometry = selectedResortData.finalizedMapData;
    const selected = selectedFinalizedFeature;
    const exists =
      selected.kind === "course"
        ? geometry?.courses?.features.some(
            course =>
              course.id === selected.id || course.groupId === selected.id,
          )
        : geometry?.lifts?.features.some(lift => lift.id === selected.id);
    if (!exists) setSelectedFinalizedFeature(null);
  }, [selectedFinalizedFeature, selectedResortData, selectedResortId]);

  useEffect(() => {
    const value: HomeSession = {
      version: 1,
      mobileDraftFilters,
      isMobileFilterOverlayOpen,
      selectedCompareIds,
      isCompareOpen,
      selectedElevationProfilePoint,
      mobileSearchReturn: mobileSearchReturnStateRef.current
        ? ({
            ...mobileSearchReturnStateRef.current,
            selectedResortData: undefined,
          } as HomeSession["mobileSearchReturn"])
        : null,
      selectedResortId,
      selectedFeature: selectedFinalizedFeature,
      mobileContentTab,
      filters,
      hasSearched,
      isFilterEditorOpen,
      isListSheetOpen,
      listSheetSnapPoint,
    };
    writeStorage(HOME_SESSION_KEY, value);
    // 地図移動は URL 履歴を増やさない。スキー場への直接リンクだけ保持する。
    const url = new URL(window.location.href);
    if (selectedResortId) url.searchParams.set("resort", selectedResortId);
    else url.searchParams.delete("resort");
    if (url.href !== window.location.href)
      window.history.replaceState(window.history.state, "", url);
  }, [
    selectedResortId,
    selectedFinalizedFeature,
    mobileContentTab,
    filters,
    hasSearched,
    isFilterEditorOpen,
    isListSheetOpen,
    listSheetSnapPoint,
    isMobileFilterOverlayOpen,
    mobileDraftFilters,
    selectedCompareIds,
    isCompareOpen,
    selectedElevationProfilePoint,
  ]);

  useEffect(() => {
    if (!session?.isCompareOpen) return;
    let disposed = false;
    void Promise.all(
      (session.selectedCompareIds ?? []).map(getCachedResort),
    ).then(data => {
      if (!disposed) setCompareResortData(data.filter(item => item !== null));
    });
    return () => {
      disposed = true;
    };
  }, [session]);

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
  const mobileDraftFilteredResortCount = useMemo(() => {
    let count = 0;
    for (const resort of initialResorts) {
      if (matchesFilters(resort, mobileDraftFilters)) {
        count += 1;
      }
    }
    return count;
  }, [initialResorts, mobileDraftFilters]);
  const hasActiveFilters = isFilterActive(filters);
  const hasMobileDraftFilterChanges = useMemo(
    () => !areFiltersEqual(mobileDraftFilters, filters),
    [filters, mobileDraftFilters],
  );
  const selectedCompareIdSet = useMemo(
    () => new Set(selectedCompareIds),
    [selectedCompareIds],
  );
  // 詳細データの取得を待たずに名前と所在地を出すための素材。
  // 一覧（地図用データ）はページのSSRに含まれるので、リストや地図から選んだ
  // ときはもちろん、URL直打ちでも初回描画の時点で手元にある。
  const selectedResortSummary = useMemo(
    () =>
      selectedResortId
        ? (initialResorts.find(resort => resort.id === selectedResortId) ??
          null)
        : null,
    [initialResorts, selectedResortId],
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

  const searchViewportBottomPaddingRatio =
    !isSidePanelLayout && isListSheetOpen && mobileContentTab === "info"
      ? getBottomSheetHeightRatio(listSheetSnapPoint)
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
    const returnState = mobileSearchReturnStateRef.current;
    mobileSearchReturnStateRef.current = null;
    const nextMobileContentTab = isSidePanelLayout
      ? "info"
      : (returnState?.mobileContentTab ?? mobileContentTab);

    setMobileContentTab(nextMobileContentTab);
    setHasSearched(true);
    setIsFilterEditorOpen(false);
    setIsMobileFilterOverlayOpen(false);
    setIsListSheetOpen(nextMobileContentTab === "info");
    keyboardReturnSnapPointRef.current = null;
    setListSheetSnapPoint(
      nextMobileContentTab === "info"
        ? BOTTOM_SHEET_SEARCH_SNAP_POINT
        : BOTTOM_SHEET_INITIAL_SNAP_POINT,
    );
    setSearchViewportRequestKey(key => key + 1);
  }, [isSidePanelLayout, mobileContentTab]);
  const handleMobileSearch = useCallback(() => {
    if (!hasMobileDraftFilterChanges) return;

    setFilters(mobileDraftFilters);
    handleSearch();
  }, [handleSearch, hasMobileDraftFilterChanges, mobileDraftFilters]);
  const handleMobileKeywordChange = useCallback(
    (event: ReactChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setMobileDraftFilters(prev => ({ ...prev, keyword: value }));
    },
    [],
  );
  const handleMobileKeywordClear = useCallback(() => {
    setMobileDraftFilters(prev => ({ ...prev, keyword: "" }));
  }, []);
  const handleMobileSearchButtonKeywordClear = useCallback(() => {
    const nextFilters = { ...filters, keyword: "" };
    const shouldKeepSearchResults = isFilterActive(nextFilters);

    setFilters(nextFilters);
    setMobileDraftFilters(nextFilters);

    // キーワード以外の条件が残る場合は、その条件で検索結果を出し続ける。
    // 何も条件が残らない場合は、全件表示の重い検索結果ではなく未検索状態へ戻す。
    if (shouldKeepSearchResults) {
      setHasSearched(true);
      setIsFilterEditorOpen(false);
      setIsListSheetOpen(mobileContentTab === "info");
      setListSheetSnapPoint(BOTTOM_SHEET_SEARCH_SNAP_POINT);
      setSearchViewportRequestKey(key => key + 1);
      return;
    }

    setHasSearched(false);
    setIsFilterEditorOpen(true);
    setIsListSheetOpen(mobileContentTab === "info");
    setListSheetSnapPoint(BOTTOM_SHEET_INITIAL_SNAP_POINT);
  }, [filters, mobileContentTab]);
  const handleMobileSearchSubmit = useCallback(
    (event: ReactFormEvent<HTMLElement>) => {
      event.preventDefault();
      event.currentTarget.querySelector("input")?.blur();
      handleMobileSearch();
    },
    [handleMobileSearch],
  );
  const handleOpenMobileFilterOverlay = useCallback(() => {
    if (isSidePanelLayout) return;

    mobileSearchReturnStateRef.current ??= {
      mobileContentTab,
      isListSheetOpen,
      listSheetSnapPoint,
      selectedResortId,
      selectedResortData,
      isCompareOpen,
    };

    if (selectedResortId) {
      setSelectedResortId(null);
      setSelectedResortData(null);
    }
    if (isCompareOpen) {
      setIsCompareOpen(false);
    }

    setMobileDraftFilters(filters);
    flushSync(() => {
      setIsMobileFilterOverlayOpen(true);
    });
    // モバイルブラウザでは、ユーザー操作から遅れた focus だと
    // input にフォーカスしてもソフトウェアキーボードが開かないことがある。
    // flushSync で overlay の input を同期的に mount してから、
    // 検索ボタンを押した同じイベントの流れの中で focus する。
    mobileSearchPanelInputRef.current?.focus({ preventScroll: true });
  }, [
    isCompareOpen,
    isListSheetOpen,
    isSidePanelLayout,
    listSheetSnapPoint,
    filters,
    mobileContentTab,
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
  const handleMobileContentTabChange = useCallback(
    (tab: "info" | "map") => {
      setMobileContentTab(tab);
      if (tab === "map") {
        setSearchViewportRequestKey(key => key + 1);
        return;
      }

      if (!selectedResortId) {
        setIsListSheetOpen(true);
      }
    },
    [selectedResortId],
  );
  const handleConfirmCloseMobileFilterOverlay = useCallback(() => {
    mobileSearchPanelInputRef.current?.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsMobileSearchKeyboardActive(false);
    setIsMobileFilterOverlayOpen(false);
    setMobileDraftFilters(filters);

    const returnState = mobileSearchReturnStateRef.current;
    mobileSearchReturnStateRef.current = null;

    if (!returnState) {
      setMobileContentTab("map");
      setIsListSheetOpen(false);
      setListSheetSnapPoint(BOTTOM_SHEET_INITIAL_SNAP_POINT);
      return;
    }

    setMobileContentTab(returnState.mobileContentTab);
    setSelectedResortId(returnState.selectedResortId);
    setSelectedResortData(returnState.selectedResortData);
    setIsCompareOpen(returnState.isCompareOpen);
    setIsListSheetOpen(
      returnState.mobileContentTab === "info" && returnState.isListSheetOpen,
    );
    setListSheetSnapPoint(returnState.listSheetSnapPoint);
  }, [filters]);

  const handleCloseMobileFilterOverlay = useCallback(() => {
    if (hasMobileDraftFilterChanges) {
      setDiscardFilterChangesDialogOpen(true);
      return;
    }
    handleConfirmCloseMobileFilterOverlay();
  }, [hasMobileDraftFilterChanges, handleConfirmCloseMobileFilterOverlay]);
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
      if (id === selectedResortId) return;
      setMobileContentTab("info");
      setHoveredResortId(null);
      saveReturnViewState();
      hasUserInteractedWithMapInDetailRef.current = false;
      setIsCompareOpen(false);
      setSelectedFinalizedFeature(null);
      setSelectedElevationProfilePoint(null);
      setSelectedResortId(id);
      setIsListSheetOpen(false); // モーダルを開くときにボトムシートを閉じる
      setSelectedResortData(null);
    },
    [saveReturnViewState, selectedResortId],
  );

  // 詳細・比較を閉じる際，タブを開く前の状態へ戻す。
  // 開く前にリストシートが開いていれば restoreReturnViewState がリストを再開する
  // （タブは "info" を維持）。開いていなければ（マップから開いた場合）マップタブへ
  // 戻す。戻さないとリストもマップも描画されず，コンテンツエリアが白抜きになる。
  const closeMobileContentTab = useCallback(() => {
    const returnState = returnViewStateRef.current;
    const shouldReturnToMap =
      !isSidePanelLayout && !hasSearched && !returnState?.isListSheetOpen;
    setMobileContentTab(shouldReturnToMap ? "map" : "info");
  }, [hasSearched, isSidePanelLayout]);

  const handleCloseDetail = () => {
    closeMobileContentTab();
    const shouldRestoreMap = !hasUserInteractedWithMapInDetailRef.current;
    setSelectedResortId(null);
    setSelectedResortData(null);
    setSelectedFinalizedFeature(null);
    setSelectedElevationProfilePoint(null);
    setHoveredResortId(null);
    hasUserInteractedWithMapInDetailRef.current = false;
    if (!isSidePanelLayout && hasSearched) {
      setIsListSheetOpen(true);
      setListSheetSnapPoint(BOTTOM_SHEET_SEARCH_SNAP_POINT);
    }
    window.requestAnimationFrame(() => {
      restoreReturnViewState(shouldRestoreMap);
      if (!isSidePanelLayout && hasSearched) {
        setIsListSheetOpen(true);
        setListSheetSnapPoint(BOTTOM_SHEET_SEARCH_SNAP_POINT);
      }
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
        const data = await getCachedResort(id);
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

    setMobileContentTab("info");
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
      selectedCompareIds.map(id => getCachedResort(id)),
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
    closeMobileContentTab();
    setIsCompareOpen(false);
    restoreReturnViewState();
  };
  const handleClearCompare = useCallback(() => {
    setSelectedCompareIds([]);
    setCompareResortData([]);
    setIsCompareLoading(false);
    if (isCompareOpen) {
      closeMobileContentTab();
      setIsCompareOpen(false);
      restoreReturnViewState();
    }
  }, [closeMobileContentTab, isCompareOpen, restoreReturnViewState]);
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
  const mobileSearchKeyboardInset =
    isMobileSearchKeyboardActive &&
    mobileSearchViewport.keyboardInset > MOBILE_KEYBOARD_INSET_THRESHOLD
      ? mobileSearchViewport.keyboardInset
      : 0;
  const mobileSearchFilterBottomPadding = `calc(env(safe-area-inset-bottom, 0px) + ${mobileSearchKeyboardInset}px + 1rem)`;
  // 比較はモバイル専用画面として常に出す（地図タブに切り替える導線を持たない）
  const shouldRenderMobileListSheet =
    !isSidePanelLayout &&
    !selectedResortId &&
    (isCompareOpen ||
      (mobileContentTab === "info" && (isListSheetOpen || hasSearched)));

  return (
    <MapSessionProvider onSelectResort={handleSelectResort}>
      {detailError && !selectedResortData && (
        <div
          role="status"
          className="fixed left-1/2 top-24 z-[1000] w-72 -translate-x-1/2 rounded-md border bg-white p-3 text-sm shadow-lg"
        >
          スキー場を読み込めませんでした。
          <button
            type="button"
            onClick={() => setDetailRetry(value => value + 1)}
            className="ml-2 min-h-11 text-blue-600"
          >
            再試行
          </button>
        </div>
      )}
      <HomeLayout
        DynamicMap={DynamicMap}
        compareResortData={compareResortData}
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
        isMobileFilterOverlayOpen={isMobileFilterOverlayOpen}
        isPending={isPending || (detailLoading && !selectedResortData)}
        isSidePanelLayout={isSidePanelLayout}
        listSheetContentRef={listSheetContentRef}
        listSheetSnapPoint={listSheetSnapPoint}
        mapInteractionMode={mapInteractionMode}
        mobileContentTab={mobileContentTab}
        mobileFilterOverlayRef={mobileFilterOverlayRef}
        mobileListSheetSnapPoints={mobileListSheetSnapPoints}
        mobileDraftFilteredResortCount={mobileDraftFilteredResortCount}
        mobileDraftHasChanges={hasMobileDraftFilterChanges}
        mobileDraftFilters={mobileDraftFilters}
        mobileSearchFilterBottomPadding={mobileSearchFilterBottomPadding}
        mobileSearchFilterScrollRef={mobileSearchFilterScrollRef}
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
        selectedResortSummary={selectedResortSummary}
        shouldRenderMobileListSheet={shouldRenderMobileListSheet}
        onCloseCompare={handleCloseCompare}
        onClearCompare={handleClearCompare}
        onCloseDetail={handleCloseDetail}
        onCloseMobileFilterOverlay={handleCloseMobileFilterOverlay}
        onFilterChange={handleFilterChange}
        onFilterKeyboardInputBlur={handleFilterKeyboardInputBlur}
        onFilterKeyboardInputFocus={handleFilterKeyboardInputFocus}
        onMainPointerDownCapture={handleMainPointerDownCapture}
        onMapViewChange={handleMapViewChange}
        onMobileFilterAreaPointerDown={handleMobileFilterAreaPointerDown}
        onMobileFilterChange={setMobileDraftFilters}
        onMobileKeywordChange={handleMobileKeywordChange}
        onMobileKeywordClear={handleMobileKeywordClear}
        onMobileSearchButtonKeywordClear={handleMobileSearchButtonKeywordClear}
        onMobileSearchButtonPointerDown={handleMobileSearchButtonPointerDown}
        onMobileContentTabChange={handleMobileContentTabChange}
        onMobileSearchFilterInputBlur={handleMobileSearchFilterInputBlur}
        onMobileSearchFilterInputFocus={handleMobileSearchFilterInputFocus}
        onMobileSearchSubmit={handleMobileSearchSubmit}
        onOpenCompare={handleOpenCompare}
        onOpenMobileFilterOverlay={handleOpenMobileFilterOverlay}
        onSearch={handleSearch}
        onMobileSearch={handleMobileSearch}
        onSelectResort={handleSelectResort}
        onSelectedFinalizedFeatureChange={handleSelectedFinalizedFeatureChange}
        onSelectedElevationProfilePointChange={setSelectedElevationProfilePoint}
        onSetFilterEditorOpen={setIsFilterEditorOpen}
        onSetHoveredResortId={setHoveredResortId}
        onSetListSheetOpen={setIsListSheetOpen}
        onSetListSheetSnapPoint={setListSheetSnapPoint}
        onToggleCompare={handleToggleCompare}
        onUserMapInteraction={handleUserMapInteraction}
        onUserMapZoomInteraction={handleUserMapZoomInteraction}
      />
      <ConfirmDialog
        open={discardFilterChangesDialogOpen}
        onOpenChange={setDiscardFilterChangesDialogOpen}
        title="変更の破棄"
        description="変更を破棄しますか？"
        onConfirm={handleConfirmCloseMobileFilterOverlay}
        confirmLabel="破棄する"
      />
    </MapSessionProvider>
  );
}

async function getCachedResort(id: string): Promise<SkiResortDetail | null> {
  const cached = await readDetailCache(id);
  if (!navigator.onLine) return cached;
  try {
    const data = await getSkiResortById(id);
    return data ?? cached;
  } catch {
    return cached;
  }
}
