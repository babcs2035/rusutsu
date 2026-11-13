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
import {
  COMPOSER_RETURN_EVENT,
  type ComposeRequest,
  OPEN_RESORT_COMPOSER_EVENT,
} from "@/features/community/composerEvents";
import {
  CompareListsProvider,
  useCompareLists,
} from "@/features/compare-lists/CompareListsProvider";
import type {
  CompareListSummary,
  CompareSource,
} from "@/features/compare-lists/types";
import {
  RecommendationProvider,
  usePrefetchRecommendations,
} from "@/features/course-recommendations/RecommendationProvider";
import {
  CourseNavigationContext,
  ResortLabelNameContext,
} from "@/features/course-recommendations/SimilarCourses";
import {
  FavoritesProvider,
  useFavorites,
} from "@/features/favorites/FavoritesProvider";
import { DEFAULT_FILTERS } from "@/features/filters/constants";
import type { Filters } from "@/features/filters/types";
import {
  areFiltersEqual,
  isFilterActive,
  matchesFilters,
} from "@/features/filters/utils/filterResorts";
import { useResortAliases } from "@/features/map/hooks/useResortAliases";
import {
  readDetailCache,
  retainComparedDetails,
  writeDetailCache,
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
import { useWarmShareImage } from "@/features/share/useWarmShareImage";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import {
  COMPARE_PARAM,
  createCompareUrlCodec,
} from "@/shared/utils/comparePath";
import {
  resortDocumentTitle,
  resortIdFromPathname,
  resortPathname,
} from "@/shared/utils/resortPath";
import { reloadIfStaleBuild } from "@/shared/utils/staleBuild";
import type { MapSkiResort, NullableSkiResortDetail } from "@/types/skiResorts";
import { HomeCompareContext } from "./compareContext";
import {
  BOTTOM_SHEET_COLLAPSED_SNAP_POINT,
  BOTTOM_SHEET_EXPANDED_SNAP_POINT,
  BOTTOM_SHEET_INITIAL_SNAP_POINT,
  BOTTOM_SHEET_SEARCH_SNAP_POINT,
  BOTTOM_SHEET_SNAP_POINTS,
  getBottomSheetHeightRatio,
  MOBILE_KEYBOARD_INSET_THRESHOLD,
} from "./constants";
import { useCompareResorts } from "./hooks/useCompareResorts";
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
import { idsAfterFavoriteCompareTabChange } from "./utils/compareFavorites";
import {
  getSearchResultListScrollElement,
  isKeyboardInputElement,
  scheduleRestoreSearchResultListScroll,
} from "./utils/dom";

const SELECTION_SOURCE: CompareSource = { kind: "selection" };
const FAVORITES_SOURCE: CompareSource = { kind: "favorites" };
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
      isFilterEditorOpen: false,
      isListSheetOpen: false,
      listSheetSnapPoint: BOTTOM_SHEET_INITIAL_SNAP_POINT,
    };
    // 一覧は HTML に含まれる値をそのまま使う。圏外では SW が保存した HTML の値になる。
    const returnUrl = new URL(window.location.href);
    if (returnUrl.searchParams.has("favoriteLogin")) {
      returnUrl.searchParams.delete("favoriteLogin");
      window.history.replaceState(window.history.state, "", returnUrl);
    }
    setBoot({
      resorts: initialResorts,
      session: resolveHomeSession(
        stored ?? defaults,
        new URL(window.location.href),
        new Set(initialResorts.map(resort => resort.id)),
        createCompareUrlCodec(initialResorts),
      ),
    });
  }, [initialResorts]);
  // 親（body直下）に確定した高さがないので、ここで画面いっぱいの高さを渡す。
  // 渡さないと h-full が潰れて、スピナーが画面の上端に貼り付く。
  if (!boot)
    return <LoadingSpinner className="h-dvh" text="地図を準備しています..." />;
  return (
    <FavoritesProvider resortIds={boot.resorts.map(resort => resort.id)}>
      <CompareListsProvider resortIds={boot.resorts.map(resort => resort.id)}>
        <RecommendationProvider>
          <HomeClientContent
            initialResorts={boot.resorts}
            session={boot.session}
          />
        </RecommendationProvider>
      </CompareListsProvider>
    </FavoritesProvider>
  );
}

function HomeClientContent({
  initialResorts,
  session,
}: Props & { session: HomeSession | null }) {
  const favorites = useFavorites();
  const compareLists = useCompareLists();
  const resortLabelNames = useResortAliases(initialResorts);
  const compareUrl = useMemo(
    () => createCompareUrlCodec(initialResorts),
    [initialResorts],
  );
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
    session?.isFilterEditorOpen ?? false,
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
  // お気に入り比較は一時的な表示。手動で選んだ比較リストは書き換えない。
  const [favoriteCompareIds, setFavoriteCompareIds] = useState<string[] | null>(
    session?.favoriteCompareIds ?? null,
  );
  // 手で選んだ比較の画面で外したスキー場。タブを切り替えるまでカードを残す
  const [pendingCompareRemovals, setPendingCompareRemovals] = useState<
    string[]
  >([]);
  // 比較をお気に入り・保存したリストから開いたか。お気に入りや保存の表示を切り替える
  const [compareSource, setCompareSource] = useState<CompareSource>(
    session?.compareSource ?? SELECTION_SOURCE,
  );
  const [isCompareOpen, setIsCompareOpen] = useState(
    session?.isCompareOpen ?? false,
  );
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
  const [isPending] = useTransition();
  const [discardFilterChangesDialogOpen, setDiscardFilterChangesDialogOpen] =
    useState(false);
  const [clearCompareDialogOpen, setClearCompareDialogOpen] = useState(false);
  const latestMapViewRef = useRef<MapViewSnapshot | null>(null);
  const listSheetContentRef = useRef<HTMLDivElement | null>(null);
  const mobileFilterOverlayRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchPanelInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchFilterScrollRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchViewportBaseHeightRef = useRef<number | null>(null);
  const returnViewStateRef = useRef<ReturnViewState | null>(null);
  // 初回の URL 正規化（旧 ?resort= や末尾スラッシュ）は履歴を増やさない。
  const urlHistoryModeRef = useRef<"push" | "replace">("replace");
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
    retainResortSession(selectedResortId);
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    void navigator.serviceWorker.ready.then(registration => {
      if (!disposed)
        registration.active?.postMessage({
          type: "SET_VIEW",
          id: selectedResortId,
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
        void writeDetailCache(data).then(saved => prepareDetail(data, saved));
      } catch (error) {
        if (reloadIfStaleBuild(error)) return;
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
    // タブへ戻っただけなら、表示中の詳細と地図をそのまま使う。
    return () => {
      disposed = true;
      for (const timer of timers) clearTimeout(timer);
      window.removeEventListener("online", resume);
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
      favoriteCompareIds,
      compareSource,
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
    // 地図移動は URL 履歴を増やさない。スキー場の切り替えだけ履歴に積み、
    // ブラウザの戻る・進むで前のスキー場（またはホーム）へ戻れるようにする。
    const url = new URL(window.location.href);
    const compareIds = isCompareOpen
      ? (favoriteCompareIds ?? selectedCompareIds)
      : [];
    const shouldShowCompareUrl = isCompareOpen && compareIds.length > 0;
    url.pathname = resortPathname(
      shouldShowCompareUrl ? null : selectedResortId,
    );
    url.searchParams.delete("resort");
    compareUrl.write(url, shouldShowCompareUrl ? compareIds : []);
    const historyMode = urlHistoryModeRef.current;
    urlHistoryModeRef.current = "push";
    if (url.href === window.location.href) return;
    const nextResortId = shouldShowCompareUrl ? null : selectedResortId;
    const isResortChange =
      resortIdFromPathname(window.location.pathname) !== nextResortId;
    const wasCompareOpen = new URL(window.location.href).searchParams.has(
      COMPARE_PARAM,
    );
    const isCompareTransition = wasCompareOpen !== shouldShowCompareUrl;
    // state は null で渡す。Next の内部 state を渡すとルーターに反映されず、
    // 次の再描画で元の URL に書き戻される。
    if (historyMode === "push" && (isResortChange || isCompareTransition))
      window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
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
    favoriteCompareIds,
    compareSource,
    isCompareOpen,
    selectedElevationProfilePoint,
    compareUrl,
  ]);

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
  const activeCompareIds =
    isCompareOpen && favoriteCompareIds !== null
      ? favoriteCompareIds
      : selectedCompareIds;
  useWarmShareImage(
    isCompareOpen
      ? activeCompareIds
      : selectedResortId
        ? [selectedResortId]
        : [],
    isCompareOpen,
  );
  const selectedCompareIdSet = useMemo(
    () => new Set(activeCompareIds),
    [activeCompareIds],
  );
  const compareCacheKey = activeCompareIds.join(",");
  const {
    resorts: compareResortData,
    isLoading: isCompareLoading,
    prioritize: onCompareMapResortsNeeded,
  } = useCompareResorts(activeCompareIds, isCompareOpen);
  usePrefetchRecommendations([
    selectedResortData?.id === selectedResortId ? selectedResortId : null,
    ...(isCompareOpen ? compareResortData.slice(0, 4).map(r => r.id) : []),
  ]);
  useEffect(() => {
    void retainComparedDetails(
      compareCacheKey ? compareCacheKey.split(",") : [],
    );
  }, [compareCacheKey]);
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
      mobileContentTab,
      isListSheetOpen,
      listSheetSnapPoint,
      listScrollTop: getSearchResultListScrollElement()?.scrollTop ?? 0,
      mapView: latestMapViewRef.current,
    };
  }, [isListSheetOpen, listSheetSnapPoint, mobileContentTab]);
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
    if (returnState?.isCompareOpen) setFavoriteCompareIds(null);
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
    setIsFilterEditorOpen(false);
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
      // 検索を閉じれば元のスキー場へ戻るので、一時的なホーム表示は履歴に積まない。
      urlHistoryModeRef.current = "replace";
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
    urlHistoryModeRef.current = "replace";
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
      setFavoriteCompareIds(null);
      setSelectedFinalizedFeature(null);
      setSelectedElevationProfilePoint(null);
      setSelectedResortId(id);
      setIsListSheetOpen(false); // モーダルを開くときにボトムシートを閉じる
      setSelectedResortData(null);
    },
    [saveReturnViewState, selectedResortId],
  );

  // 詳細・比較を閉じる際，開く前のタブへ戻す。地図タブから開いたなら地図タブ，
  // リストタブから開いたならリストタブ。戻り状態がない（リロード後に復元した詳細を
  // 閉じた場合など）ときだけ，検索済みならリスト・未検索なら地図へフォールバックする。
  // 白抜きを避けるため，タブは必ずどちらかを指定する。
  const closeMobileContentTab = useCallback(() => {
    const returnState = returnViewStateRef.current;
    if (isSidePanelLayout) {
      setMobileContentTab("info");
      return;
    }
    if (returnState) {
      setMobileContentTab(returnState.mobileContentTab);
      return;
    }
    setMobileContentTab(hasSearched ? "info" : "map");
  }, [hasSearched, isSidePanelLayout]);

  const handleCloseDetail = () => {
    // 戻り状態の有無で復帰方法が変わるため、閉じる前に確認しておく
    // （closeMobileContentTab / restoreReturnViewState が参照・破棄する）。
    const hasReturnViewState = returnViewStateRef.current !== null;
    closeMobileContentTab();
    const shouldRestoreMap = !hasUserInteractedWithMapInDetailRef.current;
    setSelectedResortId(null);
    setSelectedResortData(null);
    setSelectedFinalizedFeature(null);
    setSelectedElevationProfilePoint(null);
    setHoveredResortId(null);
    hasUserInteractedWithMapInDetailRef.current = false;
    // 戻り状態がある場合はそれがシートの開閉・スナップを復元するので触らない。
    // ない場合だけ、検索済みならリストを開いた状態にフォールバックする。
    if (!hasReturnViewState && !isSidePanelLayout && hasSearched) {
      setIsListSheetOpen(true);
      setListSheetSnapPoint(BOTTOM_SHEET_SEARCH_SNAP_POINT);
    }
    window.requestAnimationFrame(() => {
      restoreReturnViewState(shouldRestoreMap);
    });
  };

  // ブラウザ履歴を URL のスキー場・比較状態へ同期する。
  const historyNavigationRef = useRef({
    selectedResortId,
    isCompareOpen,
    select: handleSelectResort,
    close: handleCloseDetail,
    closeCompare: () => {},
    restoreCompare: (_ids: string[]) => {},
  });
  useEffect(() => {
    historyNavigationRef.current = {
      selectedResortId,
      isCompareOpen,
      select: handleSelectResort,
      close: handleCloseDetail,
      closeCompare: () => handleCloseCompare(true),
      restoreCompare: ids => {
        setSelectedResortId(null);
        setSelectedResortData(null);
        setSelectedFinalizedFeature(null);
        setSelectedElevationProfilePoint(null);
        setFavoriteCompareIds(ids);
        setCompareSource(SELECTION_SOURCE);
        setIsCompareOpen(true);
        setMobileContentTab("info");
        setHoveredResortId(null);
        if (isSidePanelLayout) setIsListSheetOpen(false);
        else {
          setListSheetSnapPoint(BOTTOM_SHEET_SEARCH_SNAP_POINT);
          setIsListSheetOpen(true);
        }
      },
    };
  });
  // 自分の投稿一覧から編集したとき。画面を移らずにそのスキー場の詳細を開き、
  // 投稿画面を閉じたら詳細も閉じて一覧（ダイアログ）へ戻す。
  // 開く前に見ていたスキー場（なければ一覧）。閉じたらそこへ戻す
  const openedForComposerRef = useRef<{
    previousResortId: string | null;
  } | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const request = (event as CustomEvent<ComposeRequest>).detail;
      if (!request) return;
      const navigation = historyNavigationRef.current;
      if (navigation.isCompareOpen) navigation.closeCompare();
      openedForComposerRef.current = {
        previousResortId: navigation.selectedResortId,
      };
      navigation.select(request.resortId);
    };
    const back = () => {
      const opened = openedForComposerRef.current;
      if (!opened) return;
      openedForComposerRef.current = null;
      if (opened.previousResortId) {
        historyNavigationRef.current.select(opened.previousResortId);
        return;
      }
      // 投稿画面の地図操作で寄った分は、自分で動かしたものではないので元の地図へ戻す
      hasUserInteractedWithMapInDetailRef.current = false;
      historyNavigationRef.current.close();
    };
    window.addEventListener(OPEN_RESORT_COMPOSER_EVENT, open);
    window.addEventListener(COMPOSER_RETURN_EVENT, back);
    return () => {
      window.removeEventListener(OPEN_RESORT_COMPOSER_EVENT, open);
      window.removeEventListener(COMPOSER_RETURN_EVENT, back);
    };
  }, []);
  useEffect(() => {
    const resortIds = new Set(initialResorts.map(resort => resort.id));
    const handlePopState = () => {
      const url = new URL(window.location.href);
      const pathId = resortIdFromPathname(url.pathname);
      const navigation = historyNavigationRef.current;
      urlHistoryModeRef.current = "replace";
      if (pathId) {
        if (navigation.isCompareOpen) navigation.closeCompare();
        if (resortIds.has(pathId) && pathId !== navigation.selectedResortId)
          navigation.select(pathId);
        else if (!resortIds.has(pathId) && navigation.selectedResortId)
          navigation.close();
        return;
      }
      const compareIds = compareUrl.read(url) ?? [];
      if (compareIds.length > 0) {
        navigation.restoreCompare(compareIds);
        return;
      }
      if (navigation.isCompareOpen) navigation.closeCompare();
      if (navigation.selectedResortId) navigation.close();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialResorts, compareUrl]);
  useEffect(() => {
    const resort = initialResorts.find(item => item.id === selectedResortId);
    document.title = isCompareOpen
      ? `スキー場比較 ${activeCompareIds.length}件 | Rusutsu`
      : resortDocumentTitle(resort?.nameJa ?? null);
  }, [
    initialResorts,
    selectedResortId,
    isCompareOpen,
    activeCompareIds.length,
  ]);

  const handleToggleCompare = useCallback(
    (id: string, selected: boolean) => {
      setHoveredResortId(null);
      const setCompareIds =
        isCompareOpen && favoriteCompareIds !== null
          ? setFavoriteCompareIds
          : setSelectedCompareIds;
      setCompareIds((prev: string[] | null) => {
        const ids = prev ?? [];
        if (selected) return ids.includes(id) ? ids : [...ids, id];
        return ids.filter(compareId => compareId !== id);
      });

      if (!isCompareOpen) return;

      if (!selected) {
        if (activeCompareIds.length === 1) {
          setFavoriteCompareIds(null);
          setCompareSource(SELECTION_SOURCE);
          setIsCompareOpen(false);
        }
        return;
      }
    },
    [activeCompareIds, isCompareOpen, favoriteCompareIds],
  );

  /** 比較画面で外したスキー場を、手で選んだ比較から実際に外す */
  const commitCompareRemovals = useCallback(() => {
    if (pendingCompareRemovals.length === 0) return selectedCompareIds;
    const removed = new Set(pendingCompareRemovals);
    const next = selectedCompareIds.filter(id => !removed.has(id));
    setSelectedCompareIds(next);
    setPendingCompareRemovals([]);
    return next;
  }, [pendingCompareRemovals, selectedCompareIds]);

  const handleOpenCompare = useCallback(
    (ids?: string[], source: CompareSource = SELECTION_SOURCE) => {
      const selectionIds = commitCompareRemovals();
      ids ??= selectionIds;
      if (ids.length === 0 && source.kind !== "list") return;
      urlHistoryModeRef.current = "push";
      // お気に入り・保存したリストの比較は一時的な表示。手で選んだ比較は書き換えない
      setFavoriteCompareIds(source.kind === "selection" ? null : ids);
      setCompareSource(source);

      setMobileContentTab("info");
      setHoveredResortId(null);
      saveReturnViewState();
      setSelectedResortId(null);
      setSelectedResortData(null);
      setSelectedFinalizedFeature(null);
      setSelectedElevationProfilePoint(null);
      setIsCompareOpen(true);
      if (isSidePanelLayout) {
        setIsListSheetOpen(false);
      } else {
        setListSheetSnapPoint(BOTTOM_SHEET_SEARCH_SNAP_POINT);
        setIsListSheetOpen(true);
      }
    },
    [commitCompareRemovals, isSidePanelLayout, saveReturnViewState],
  );

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

  const handleCloseCompare = (fromHistory = false) => {
    if (!fromHistory) urlHistoryModeRef.current = "push";
    commitCompareRemovals();
    closeMobileContentTab();
    setIsCompareOpen(false);
    setFavoriteCompareIds(null);
    setCompareSource(SELECTION_SOURCE);
    restoreReturnViewState();
  };
  const handleClearCompare = useCallback(() => {
    urlHistoryModeRef.current = "push";
    if (favoriteCompareIds === null) setSelectedCompareIds([]);
    setPendingCompareRemovals([]);
    setFavoriteCompareIds(null);
    setCompareSource(SELECTION_SOURCE);
    if (isCompareOpen) {
      closeMobileContentTab();
      setIsCompareOpen(false);
      restoreReturnViewState();
    }
  }, [
    closeMobileContentTab,
    favoriteCompareIds,
    isCompareOpen,
    restoreReturnViewState,
  ]);
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
    (isCompareOpen || mobileContentTab === "info");

  const homeCompare = {
    source: compareSource,
    ids: activeCompareIds,
    pendingRemovals: pendingCompareRemovals,
    togglePendingRemoval: (id: string) =>
      setPendingCompareRemovals(ids =>
        ids.includes(id) ? ids.filter(other => other !== id) : [...ids, id],
      ),
    onTabChange: () => {
      if (compareSource.kind === "selection") {
        // 外したスキー場は、タブを切り替えたときに消す。全部外したら比較を閉じる
        if (commitCompareRemovals().length === 0) {
          setFavoriteCompareIds(null);
          setIsCompareOpen(false);
        }
        return;
      }
      if (compareSource.kind === "list") {
        // 比較リストから外したスキー場は、タブを切り替えたときに消す
        const list = compareLists?.ready
          ? compareLists.lists.find(item => item.id === compareSource.id)
          : undefined;
        if (!list) return;
        const kept = new Set(list.resortIds);
        setFavoriteCompareIds(ids =>
          ids === null ? null : ids.filter(id => kept.has(id)),
        );
        return;
      }
      if (compareSource.kind !== "favorites" || !favorites?.ready) return;
      setFavoriteCompareIds(ids =>
        ids === null
          ? null
          : idsAfterFavoriteCompareTabChange(
              compareSource,
              ids,
              favorites?.ids ?? [],
            ),
      );
    },
    openList: (list: CompareListSummary) =>
      void handleOpenCompare(list.resortIds, {
        kind: "list",
        id: list.id,
        name: list.name,
      }),
    onListSaved: (list: CompareListSummary) => {
      setFavoriteCompareIds(list.resortIds);
      setCompareSource({ kind: "list", id: list.id, name: list.name });
    },
  };

  return (
    <HomeCompareContext.Provider value={homeCompare}>
      <CourseNavigationContext.Provider
        value={(id, feature) => {
          handleSelectResort(id);
          setSelectedFinalizedFeature(feature);
          setSelectedElevationProfilePoint(null);
        }}
      >
        <ResortLabelNameContext.Provider value={resortLabelNames}>
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
              hoveredResortId={hoveredResortId}
              initialResorts={initialResorts}
              isCompareLoading={isCompareLoading}
              isCompareOpen={isCompareOpen}
              onCompareMapResortsNeeded={onCompareMapResortsNeeded}
              isFilterEditorOpen={isFilterEditorOpen}
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
              searchViewportBottomPaddingRatio={
                searchViewportBottomPaddingRatio
              }
              searchViewportRequestKey={searchViewportRequestKey}
              selectedCompareIdSet={selectedCompareIdSet}
              selectedCompareIds={activeCompareIds}
              selectedElevationProfilePoint={selectedElevationProfilePoint}
              selectedFinalizedFeature={selectedFinalizedFeature}
              selectedResortData={selectedResortData}
              selectedResortId={selectedResortId}
              selectedResortSummary={selectedResortSummary}
              shouldRenderMobileListSheet={shouldRenderMobileListSheet}
              onCloseCompare={handleCloseCompare}
              onClearCompare={() => setClearCompareDialogOpen(true)}
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
              onMobileSearchButtonKeywordClear={
                handleMobileSearchButtonKeywordClear
              }
              onMobileSearchButtonPointerDown={
                handleMobileSearchButtonPointerDown
              }
              onMobileContentTabChange={handleMobileContentTabChange}
              onMobileSearchFilterInputBlur={handleMobileSearchFilterInputBlur}
              onMobileSearchFilterInputFocus={
                handleMobileSearchFilterInputFocus
              }
              onMobileSearchSubmit={handleMobileSearchSubmit}
              onOpenCompare={() => void handleOpenCompare()}
              onCompareFavorites={() =>
                void handleOpenCompare(
                  favorites?.ids.filter(id =>
                    initialResorts.some(r => r.id === id),
                  ) ?? [],
                  FAVORITES_SOURCE,
                )
              }
              onOpenMobileFilterOverlay={handleOpenMobileFilterOverlay}
              onSearch={handleSearch}
              onMobileSearch={handleMobileSearch}
              onSelectResort={handleSelectResort}
              onSelectedFinalizedFeatureChange={
                handleSelectedFinalizedFeatureChange
              }
              onSelectedElevationProfilePointChange={
                setSelectedElevationProfilePoint
              }
              onSetFilterEditorOpen={setIsFilterEditorOpen}
              onSetHoveredResortId={setHoveredResortId}
              onSetListSheetOpen={setIsListSheetOpen}
              onSetListSheetSnapPoint={setListSheetSnapPoint}
              onToggleCompare={handleToggleCompare}
              onUserMapInteraction={handleUserMapInteraction}
              onUserMapZoomInteraction={handleUserMapZoomInteraction}
            />
            <ConfirmDialog
              open={clearCompareDialogOpen}
              onOpenChange={setClearCompareDialogOpen}
              title="比較の選択をクリアしますか？"
              description=""
              onConfirm={handleClearCompare}
              confirmLabel="クリアする"
              className="z-[1000]"
              overlayClassName="z-[999]"
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
        </ResortLabelNameContext.Provider>
      </CourseNavigationContext.Provider>
    </HomeCompareContext.Provider>
  );
}
