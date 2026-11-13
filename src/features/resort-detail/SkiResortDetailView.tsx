"use client";

import { Portal } from "@radix-ui/react-portal";
import type { ComponentType } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import { CommunityComposer } from "@/features/community/CommunityComposer";
import { CommunityFeed } from "@/features/community/CommunityFeed";
import { CommunityMapPreview } from "@/features/community/CommunityMapPreview";
import {
  COMPOSE_EVENT,
  type ComposeRequest,
  MAP_TARGET_EVENT,
  peekPendingCompose,
  returnFromComposer,
  setCommunityComposeActive,
  setCommunityMapPickMode,
  setCommunityMapPoint,
  takePendingCompose,
} from "@/features/community/composerEvents";
import type { ReportMapTarget } from "@/features/community/contract";
import {
  communityMapData,
  resortReportMap,
} from "@/features/community/mapData";
import {
  highlightCommunityMapEntry,
  openCommunityMapPosts,
  useCommunityMapPostHost,
  useOpenCommunityMapPosts,
} from "@/features/community/mapPostStore";
import {
  type CorrectionLayout,
  type CorrectionLineRef,
  CorrectionPanel,
} from "@/features/corrections/CorrectionPanel";
import {
  CORRECTION_EVENT,
  CORRECTION_QUERY_KEYS,
  type CorrectionRequest,
  correctionRequestFromUrl,
  setCorrectionActive,
} from "@/features/corrections/correctionEvents";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { useScreenState } from "@/features/map/session/useScreenState";
import type {
  ElevationProfileMapPoint,
  JapanResortMapProps,
  SelectedMapFeature,
} from "@/features/map/types";
import { ResortLinksTab } from "@/features/resort-links/ResortLinksTab";
import { useBreakpointValue } from "@/hooks/use-breakpoint-value";
import { getResortSearchName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import { AnimatedPanel } from "@/shared/components/AnimatedPanel";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { PanelHeader } from "@/shared/components/PanelHeader";
import type { MapSkiResort, NullableSkiResortDetail } from "@/types/skiResorts";
import { DetailTabs } from "./components/DetailTabs";
import { FinalizedFeatureDetail } from "./components/FinalizedFeatureDetail";
import { MapAreaTabs } from "./components/MapAreaTabs";
import { resortFeatureDataOf } from "./components/ResortFeatureChips";
import { ResortMapSection } from "./components/ResortMapSection";
import {
  SimultaneousToggle,
  useSimultaneousView,
} from "./components/SimultaneousToggle";
import { TrailMapPanel } from "./components/TrailMapPanel";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import {
  InfoSection,
  OverviewTab,
  TicketsTab,
  WeatherTab,
} from "./tabs/DetailTabContent";
import {
  createFinalizedCourseGroups,
  findSelectedCourseGroup,
} from "./utils/detailMetrics";

type Props = {
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  resortData: NullableSkiResortDetail | null;
  /**
   * 一覧（地図用データ）側の同じスキー場。詳細の取得を待たずに
   * 名前と所在地を出すために使う。URL直打ちでも一覧はSSRで届いている。
   */
  resortSummary?: MapSkiResort | null;
  isLoading: boolean;
  isCompareSelected: boolean;
  onToggleCompare: (id: string, selected: boolean) => void;
  selectedFinalizedFeature: SelectedMapFeature | null;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
  onClose: () => void;
  /** つながっているスキー場・共通券のスキー場の名前を押したときに開く */
  onSelectResort?: (id: string) => void;
  mobileContentTab?: "info" | "map";
  mobilePresentation?: "overlay" | "inline";
  hideMobileInfoSection?: boolean;
  /**
   * デスクトップで左の地図を全画面にしているか。
   * そのときは説明パネルを畳んで地図を見せ、コースを選んだときだけ
   * 右側に小さく重ねて出す。
   */
  isDesktopMapExpanded?: boolean;
  /** 検索画面で指定した料金計算の条件。料金タブの最初の入力にする */
  liftTicketInput?: LiftTicketSearchInput;
};

const tabSchema = z.enum(["ゲレンデ", "料金", "天気", "リンク集", "投稿"]);
const terrainSchema = z.enum(["コース", "リフト"]);
const areaSchema = z.enum(["地図", "ゲレンデマップ"]);
const booleanSchema = z.boolean();
const originSchema = z.enum(["map", "list"]);

const TABS = ["ゲレンデ", "料金", "天気", "リンク集", "投稿"];
const MAP_AREA_TABS = ["地図", "ゲレンデマップ"] as const;

/**
 * 詳細データの取得待ちに出す中身。
 * 一覧側のデータで名前が分かるので、見出し（名前・所在地・閉じる・比較に追加）は
 * 読み込み後と同じ InfoSection をそのまま出し、本文だけスピナーにする。
 * 別物のレイアウトを挟むと、詳細が届いた瞬間に見出しが動いてしまう。
 */
const DetailLoadingPanel = ({
  summary,
  showHeader,
  isCompareSelected,
  onToggleCompare,
  onClose,
  onCancelCompose,
}: {
  summary: MapSkiResort | null;
  /** モバイルは上のコンテキストヘッダーが名前と操作を出すので、パネル側では出さない */
  showHeader: boolean;
  isCompareSelected: boolean;
  onToggleCompare: (id: string, selected: boolean) => void;
  onClose: () => void;
  /**
   * 投稿・編集のURLで開いたとき。詳細の見出しを挟まず、投稿画面の読み込み中と
   * 同じ見出しを出す（届いたら投稿画面がそのまま引き継ぐ）。
   */
  onCancelCompose?: () => void;
}) => (
  <div
    className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white"
    aria-live="polite"
    aria-busy="true"
  >
    {onCancelCompose && (
      <PanelHeader
        title="現地レポート"
        onClose={onCancelCompose}
        closeLabel="投稿を閉じる"
      />
    )}
    {!onCancelCompose && showHeader && summary && (
      <InfoSection
        resort={{
          id: summary.id,
          nameJa: summary.nameJa,
          nameRuby: summary.nameRuby,
          formerNames: summary.formerNames,
          prefecture: summary.prefecture,
          town: summary.town,
          yukiMagi: Boolean(summary.yukiMagiId),
          hasEvCharger: Boolean(summary.evChargerSummary),
        }}
        isCompareSelected={isCompareSelected}
        onToggleCompare={onToggleCompare}
        onClose={onClose}
      />
    )}
    <LoadingSpinner className="min-h-0 flex-1 bg-white" />
  </div>
);

/**
 * スキー場の詳細情報を表示するレスポンシブ対応モーダル
 */
export const SkiResortDetailView = ({
  DynamicMap,
  mapResorts,
  resortData,
  resortSummary = null,
  isLoading,
  isCompareSelected,
  onToggleCompare,
  selectedFinalizedFeature,
  selectedElevationProfilePoint,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
  onClose,
  onSelectResort,
  mobileContentTab = "info",
  mobilePresentation = "overlay",
  hideMobileInfoSection = false,
  isDesktopMapExpanded = false,
  liftTicketInput,
}: Props) => {
  // 「〇〇も同時に表示」中は、地図と地図で選んだ線の詳細を組全体で扱う
  const simultaneous = useSimultaneousView(resortData ?? null);
  const displayedMapData = simultaneous.mapData;
  const stateKey = `rusutsu:detail:v1:${resortData?.id ?? "loading"}`;
  const [activeTab, setActiveTab] = useScreenState<string>(
    `${stateKey}:tab`,
    tabSchema,
    TABS[0],
  );
  const [terrainTab, setTerrainTab] = useScreenState(
    `${stateKey}:terrain`,
    terrainSchema,
    "コース",
  );
  // 「ゲレンデ」タブの中で、概要ではなくコース/リフトの一覧・詳細を見せているか。
  const [showTerrainDetail, setShowTerrainDetail] = useScreenState(
    `${stateKey}:terrainDetail`,
    booleanSchema,
    false,
  );
  // 地図の部分を、通常の地図で見せるか公式のゲレンデマップ画像で見せるか
  const [mapAreaView, setMapAreaView] = useScreenState(
    `${stateKey}:area`,
    areaSchema,
    "地図",
  );
  const isSidePanel = useBreakpointValue({ base: false, md: true }) ?? false;
  // 選択を解除したときの戻り先を決めるために、どこから選んだかを覚えておく。
  // 一覧から選んだときは元の一覧と初期表示の地図へ、
  // 地図から選んだときは今の地図の見え方のまま戻す。
  const [selectionOrigin, setSelectionOrigin] = useScreenState(
    `${stateKey}:origin`,
    originSchema,
    "map",
  );
  const [detailViewportResetKey, setDetailViewportResetKey] = useState(0);
  const [composeRequest, setComposeRequest] = useState<ComposeRequest | null>(
    null,
  );
  const [composeTarget, setComposeTarget] = useState<ReportMapTarget | null>(
    null,
  );
  // 投稿・編集を頼まれて（URLまたは自分の投稿一覧から）、詳細の到着を
  // 待っている間。詳細画面を挟まずに投稿画面の読み込み中を出す。
  const [composePending, setComposePending] = useState(false);
  const summaryId = resortSummary?.id;
  // 描画前に決めて、詳細の見出しが一瞬出るのを防ぐ
  useLayoutEffect(() => {
    setComposePending(
      Boolean(peekPendingCompose(summaryId)) ||
        new URL(window.location.href).searchParams.get("compose") === "1",
    );
  }, [summaryId]);
  // 「情報を修正」。投稿と同じく、詳細パネルを入力画面に切り替える
  const [correctionRequest, setCorrectionRequest] =
    useState<CorrectionRequest | null>(null);
  const [correctionLayout, setCorrectionLayout] =
    useState<CorrectionLayout>("form");
  const [correctionMapHost, setCorrectionMapHost] =
    useState<HTMLElement | null>(null);
  const correctingRef = useRef(false);
  correctingRef.current = correctionRequest != null;
  const composeResortId = resortData?.id;
  const composeResortIds = useRef<string[]>([]);
  composeResortIds.current = [
    composeResortId ?? "",
    ...simultaneous.partners.map(partner => partner.id),
  ];
  const handlePickMode = useCallback(
    (mode: "POINT" | null) => {
      if (composeResortId) setCommunityMapPickMode(composeResortId, mode);
    },
    [composeResortId],
  );
  const handleMapPoint = useCallback(
    (point: [number, number] | null) => {
      if (composeResortId) setCommunityMapPoint(composeResortId, point);
    },
    [composeResortId],
  );
  useEffect(() => {
    setComposeRequest(null);
    setComposeTarget(null);
    setCorrectionRequest(null);
    if (!composeResortId) return;
    const open = (event: Event) => {
      const request = (event as CustomEvent<ComposeRequest>).detail;
      if (!request || !composeResortIds.current.includes(request.resortId))
        return;
      event.preventDefault();
      if (correctingRef.current) return;
      if (request.target) setComposeTarget(request.target);
      setComposeRequest(current =>
        current && !request.postId ? current : request,
      );
    };
    const pick = (event: Event) => {
      const detail = (
        event as CustomEvent<{ resortId: string; target: ReportMapTarget }>
      ).detail;
      if (detail?.resortId === composeResortId) setComposeTarget(detail.target);
    };
    // 修正中に投稿を開くと入力した修正が消えるので、修正を閉じるまで受け付けない
    const openCorrection = (event: Event) => {
      const request = (event as CustomEvent<CorrectionRequest>).detail;
      if (request?.resortId !== composeResortId) return;
      event.preventDefault();
      setCorrectionRequest(current => current ?? request);
    };
    window.addEventListener(COMPOSE_EVENT, open);
    window.addEventListener(MAP_TARGET_EVENT, pick);
    window.addEventListener(CORRECTION_EVENT, openCorrection);
    const url = new URL(window.location.href);
    setCorrectionRequest(correctionRequestFromUrl(composeResortId, url));
    setComposePending(false);
    const pending = takePendingCompose(composeResortId);
    if (pending) setComposeRequest(pending);
    else if (url.searchParams.get("compose") === "1") {
      const courseId = url.searchParams.get("courseId");
      const liftId = url.searchParams.get("liftId");
      setComposeRequest({
        resortId: composeResortId,
        postId: url.searchParams.get("edit") ?? undefined,
        target: courseId
          ? { kind: "COURSE", id: courseId }
          : liftId
            ? { kind: "LIFT", id: liftId }
            : undefined,
      });
    }
    return () => {
      window.removeEventListener(COMPOSE_EVENT, open);
      window.removeEventListener(MAP_TARGET_EVENT, pick);
      window.removeEventListener(CORRECTION_EVENT, openCorrection);
      setCommunityMapPickMode(composeResortId, null);
      // 修正中に別のスキー場へ移ったら、移った先で修正パネルが開かないようURLの印を消す
      if (correctingRef.current) {
        const current = new URL(window.location.href);
        for (const key of CORRECTION_QUERY_KEYS)
          current.searchParams.delete(key);
        window.history.replaceState(
          window.history.state,
          "",
          current.pathname + current.search + current.hash,
        );
      }
    };
  }, [composeResortId]);
  // 投稿中に地図で選んだコース・リフトは投稿の対象にする。閉じたら、
  // 投稿を始める前の選択に戻して元の詳細を出す。
  const selectionBeforeCompose = useRef<SelectedMapFeature | null>(null);
  const composing = composeRequest != null;
  const latestSelection = useRef(selectedFinalizedFeature);
  latestSelection.current = selectedFinalizedFeature;
  useEffect(() => {
    if (composing) selectionBeforeCompose.current = latestSelection.current;
  }, [composing]);
  const composeFeatureKey =
    composing && selectedFinalizedFeature
      ? `${selectedFinalizedFeature.kind}:${selectedFinalizedFeature.id}`
      : null;
  const composeCourseFeatures = displayedMapData?.courses?.features;
  // 投稿で選べるコース・リフトは、詳細の地図で読み込み済みのものから作る
  const composeMapData = useMemo(
    () =>
      resortData
        ? {
            ...communityMapData(
              resortData.nameJa,
              [resortData.longitude, resortData.latitude],
              displayedMapData,
            ),
            resorts: simultaneous.communityResorts,
          }
        : null,
    [resortData, displayedMapData, simultaneous.communityResorts],
  );
  useEffect(() => {
    if (!composeFeatureKey) return;
    const feature = latestSelection.current;
    if (!feature) return;
    if (feature.kind === "lift") {
      setComposeTarget({ kind: "LIFT", id: feature.id });
      return;
    }
    const group = findSelectedCourseGroup(
      createFinalizedCourseGroups(composeCourseFeatures ?? []),
      feature,
    );
    if (group) setComposeTarget({ kind: "COURSE", id: group.id });
  }, [composeCourseFeatures, composeFeatureKey]);
  const handleComposeTargetChange = useCallback(
    (target: { kind: "COURSE" | "LIFT"; id: string } | null) => {
      const current = latestSelection.current;
      if (!target) {
        if (current) onSelectedFinalizedFeatureChange(null);
        return;
      }
      const kind = target.kind === "LIFT" ? "lift" : "course";
      if (current?.kind === kind && current.id === target.id) return;
      onSelectedFinalizedFeatureChange({ kind, id: target.id });
    },
    [onSelectedFinalizedFeatureChange],
  );
  const clearComposeUrl = () => {
    const url = new URL(window.location.href);
    for (const key of ["compose", "edit", "courseId", "liftId"])
      url.searchParams.delete(key);
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  };
  const closeComposer = () => {
    returnFromComposer(composeRequest?.returnTo);
    clearComposeUrl();
    handlePickMode(null);
    setComposeRequest(null);
    setComposeTarget(null);
    onSelectedFinalizedFeatureChange(selectionBeforeCompose.current);
  };
  const activeComposerResortId = composeRequest ? composeResortId : undefined;
  useEffect(() => {
    if (!composeRequest) return;
    const url = new URL(window.location.href);
    url.searchParams.set("compose", "1");
    for (const key of ["edit", "courseId", "liftId"])
      url.searchParams.delete(key);
    if (composeRequest.postId)
      url.searchParams.set("edit", composeRequest.postId);
    if (composeRequest.target)
      url.searchParams.set(
        composeRequest.target.kind === "COURSE" ? "courseId" : "liftId",
        composeRequest.target.id,
      );
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }, [composeRequest]);
  // 読み込み中から投稿中として扱い、スマホ上部のスキー場見出しを出さない
  const pendingComposerResortId =
    composePending && !resortData ? resortSummary?.id : undefined;
  useLayoutEffect(() => {
    if (!pendingComposerResortId) return;
    const resortId = pendingComposerResortId;
    setCommunityComposeActive(resortId, true);
    return () => {
      setCommunityComposeActive(resortId, false);
    };
  }, [pendingComposerResortId]);
  useEffect(() => {
    if (!activeComposerResortId) return;
    const resortId = activeComposerResortId;
    setCommunityComposeActive(resortId, true);
    return () => {
      setCommunityComposeActive(resortId, false);
    };
  }, [activeComposerResortId]);

  // --- 情報を修正 ---------------------------------------------------------
  const correcting = correctionRequest != null;
  const correctionResortId = correcting ? composeResortId : undefined;
  // 修正を始める前の選択。閉じたら元の詳細に戻す
  const selectionBeforeCorrection = useRef<SelectedMapFeature | null>(null);
  useEffect(() => {
    if (correcting) selectionBeforeCorrection.current = latestSelection.current;
    else setCorrectionLayout("form");
  }, [correcting]);
  useEffect(() => {
    if (!correctionResortId) return;
    setCorrectionActive(correctionResortId, true);
    return () => setCorrectionActive(correctionResortId, false);
  }, [correctionResortId]);
  useEffect(() => {
    if (!correctionRequest) return;
    const url = new URL(window.location.href);
    for (const key of CORRECTION_QUERY_KEYS) url.searchParams.delete(key);
    url.searchParams.set("correct", "1");
    if (correctionRequest.target?.ids.length)
      url.searchParams.set(
        correctionRequest.target.kind === "slope"
          ? "correctCourse"
          : "correctLift",
        correctionRequest.target.ids.join(","),
      );
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }, [correctionRequest]);
  const closeCorrection = () => {
    const url = new URL(window.location.href);
    for (const key of CORRECTION_QUERY_KEYS) url.searchParams.delete(key);
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
    setCorrectionRequest(null);
    correctionLine.current = null;
    onSelectedFinalizedFeatureChange(selectionBeforeCorrection.current);
  };
  // 修正パネルが一覧で開いた線。分かれたコースのどの線かを覚えておく
  const correctionLine = useRef<CorrectionLineRef | null>(null);
  const correctionCourses = displayedMapData?.courses?.features;
  const selectedCorrectionLine = useMemo<CorrectionLineRef | null>(() => {
    if (!correcting || !selectedFinalizedFeature) return null;
    if (selectedFinalizedFeature.kind === "lift")
      return { kind: "lift", id: selectedFinalizedFeature.id };
    const group = findSelectedCourseGroup(
      createFinalizedCourseGroups(correctionCourses ?? []),
      selectedFinalizedFeature,
    );
    // 地図の選択はコースのまとまり。パネルが開いている線がその中にあればそれを指す
    const course =
      group?.courses.find(item => item.id === correctionLine.current?.id) ??
      group?.courses[0];
    return course ? { kind: "slope", id: course.id } : null;
  }, [correcting, correctionCourses, selectedFinalizedFeature]);
  const handleCorrectionLineChange = useCallback(
    (line: CorrectionLineRef | null) => {
      correctionLine.current = line;
      const current = latestSelection.current;
      if (!line) {
        if (current) onSelectedFinalizedFeatureChange(null);
        return;
      }
      if (line.kind === "lift") {
        if (current?.kind !== "lift" || current.id !== line.id)
          onSelectedFinalizedFeatureChange({ kind: "lift", id: line.id });
        return;
      }
      const course = correctionCourses?.find(item => item.id === line.id);
      if (!course) return;
      if (current?.kind !== "course" || current.id !== course.groupId)
        onSelectedFinalizedFeatureChange({
          kind: "course",
          id: course.groupId,
        });
    },
    [correctionCourses, onSelectedFinalizedFeatureChange],
  );

  // 地図で開いた投稿は、コースを選んだときと同じ場所（スマホは地図の下、
  // PCは右パネル）に出す。コースの選択・投稿の開始とは同時に開かない。
  const { open: openPosts } = useOpenCommunityMapPosts(composeResortId);
  useCommunityMapPostHost(
    composeResortId,
    isSidePanel || mobileContentTab === "info",
  );
  const openPostsKey = openPosts?.key;
  useEffect(() => {
    if (openPostsKey && latestSelection.current)
      onSelectedFinalizedFeatureChange(null);
  }, [onSelectedFinalizedFeatureChange, openPostsKey]);
  useEffect(() => {
    if (
      composeResortId &&
      (selectedFinalizedFeature || composing || correcting)
    )
      openCommunityMapPosts(composeResortId, null);
  }, [composeResortId, composing, correcting, selectedFinalizedFeature]);

  const selectFeatureFromMap = useCallback(
    (feature: SelectedMapFeature | null) => {
      if (feature) setSelectionOrigin("map");
      onSelectedFinalizedFeatureChange(feature);
    },
    [onSelectedFinalizedFeatureChange, setSelectionOrigin],
  );
  const selectFeatureFromList = useCallback(
    (feature: SelectedMapFeature | null) => {
      if (feature) setSelectionOrigin("list");
      onSelectedFinalizedFeatureChange(feature);
    },
    [onSelectedFinalizedFeatureChange, setSelectionOrigin],
  );

  // 選択が消えたら「地図から選んだ」に戻す。次にどこから選ばれても、
  // 選んだ側のハンドラが上書きするので取り違えが起きない。
  useEffect(() => {
    if (selectedFinalizedFeature) return;
    setSelectionOrigin("map");
  }, [selectedFinalizedFeature, setSelectionOrigin]);

  useBodyScrollLock();
  const shouldRenderMobilePanel = isSidePanel || mobileContentTab === "info";
  // inline: 親（モバイル詳細シート）内に相対配置 / overlay: 画面下部に固定配置
  const mobilePanelPositionClasses =
    mobilePresentation === "inline"
      ? "relative h-full"
      : "fixed left-0 right-0 bottom-0 top-[calc(env(safe-area-inset-top,0px)+6.75rem)]";

  if (isLoading || !resortData) {
    const loadingContent = (
      <DetailLoadingPanel
        summary={resortSummary}
        showHeader={isSidePanel}
        isCompareSelected={isCompareSelected}
        onToggleCompare={onToggleCompare}
        onClose={onClose}
        onCancelCompose={
          composePending
            ? () => {
                returnFromComposer(takePendingCompose(summaryId)?.returnTo);
                clearComposeUrl();
                setComposePending(false);
              }
            : undefined
        }
      />
    );
    return (
      <>
        {isSidePanel && (
          <Portal>
            <div className="fixed inset-0 z-[60] hidden md:flex md:justify-end pointer-events-none">
              <div
                className="absolute inset-0 bg-transparent pointer-events-none"
                aria-hidden="true"
              />
              <AnimatedPanel
                data-ski-resort-detail-panel="true"
                visible={isSidePanel}
                contentClassName="@container/resort-detail relative z-10 flex h-full max-h-none w-[var(--desktop-detail-panel-width)] max-w-none flex-col overflow-hidden bg-white border border-gray-200 pointer-events-auto shadow-2xl"
              >
                {loadingContent}
              </AnimatedPanel>
            </div>
          </Portal>
        )}
        {/*
          読み込み中も本体と同じ箱（h-full + overflow-hidden）に入れる。
          AnimatedPanel が transform を持つため、中の fixed はパネルを基準に
          配置される。箱を揃えないと高さ0の領域からはみ出して、
          地図の上に「読み込み中」だけが浮く。
        */}
        {!isSidePanel && shouldRenderMobilePanel && (
          <div
            data-ski-resort-detail-panel="true"
            className={`z-[300] flex h-full flex-col overflow-hidden bg-white border-t border-gray-200 ${mobilePanelPositionClasses}`}
          >
            {loadingContent}
          </div>
        )}
      </>
    );
  }

  const resort = resortData;
  const trailMapLinks = resort.trailMapLinks;
  const hasTrailMap = (trailMapLinks?.mapUrls.length ?? 0) > 0;
  const resortInfo = {
    id: resort.id,
    nameJa: resort.nameJa,
    nameRuby: resort.nameRuby,
    formerNames: resort.formerNames,
    prefecture: resort.prefecture,
    town: resort.town,
    yukiMagi: Boolean(resort.yukiMagi),
    features: resortFeatureDataOf(resort),
  };
  // 「〇〇も同時に表示」は都道府県・市町村とタブの間に置き、すべてのタブに効かせる
  const simultaneousControl = resort.simultaneousOptions?.length ? (
    <SimultaneousToggle
      resort={resort}
      onSelectResort={onSelectResort}
      size="header"
      className="shadow-none"
    />
  ) : null;
  const desktopDetailHeader = (
    <InfoSection
      resort={resortInfo}
      isCompareSelected={isCompareSelected}
      onToggleCompare={onToggleCompare}
      onClose={onClose}
    >
      {simultaneousControl}
    </InfoSection>
  );
  const finalizedCourseGroups = createFinalizedCourseGroups(
    displayedMapData?.courses?.features ?? [],
  );
  const selectedCourseGroup = findSelectedCourseGroup(
    finalizedCourseGroups,
    selectedFinalizedFeature,
  );
  const selectedLift =
    selectedFinalizedFeature?.kind === "lift"
      ? (displayedMapData?.lifts?.features.find(
          lift => lift.id === selectedFinalizedFeature.id,
        ) ?? null)
      : null;
  const closeFeatureDetail = () => {
    const shouldReturnToList = selectionOrigin === "list";
    onSelectedFinalizedFeatureChange(null);
    onSelectedElevationProfilePointChange(null);
    if (!shouldReturnToList) return;

    // 一覧から選んだ場合は、一覧と初期表示（スキー場全体）の地図へ戻す
    setActiveTab("ゲレンデ");
    setTerrainTab(selectedCourseGroup ? "コース" : "リフト");
    setShowTerrainDetail(true);
    setDetailViewportResetKey(key => key + 1);
  };
  const renderFeatureDetail = (options?: { withOpenList?: boolean }) =>
    selectedCourseGroup || selectedLift ? (
      <FinalizedFeatureDetail
        resortId={resort.id}
        mapData={displayedMapData}
        courseGroup={selectedCourseGroup}
        lift={selectedLift}
        resortLabelName={getResortSearchName(
          resort.id,
          resort.nameJa,
          resort.shortName,
        )}
        courseObservedAt={displayedMapData?.courses?.observedAt}
        liftObservedAt={displayedMapData?.lifts?.observedAt}
        courseSourceUrls={displayedMapData?.courses?.sourceUrls ?? []}
        courseVerificationStatus={displayedMapData?.courses?.verificationStatus}
        liftSourceUrls={displayedMapData?.lifts?.sourceUrls ?? []}
        selectedElevationProfilePoint={selectedElevationProfilePoint}
        onSelectedElevationProfilePointChange={
          onSelectedElevationProfilePointChange
        }
        onClose={closeFeatureDetail}
        onOpenList={
          options?.withOpenList
            ? () => {
                setActiveTab("ゲレンデ");
                setTerrainTab(selectedCourseGroup ? "コース" : "リフト");
                setShowTerrainDetail(true);
                onSelectedFinalizedFeatureChange(null);
                onSelectedElevationProfilePointChange(null);
              }
            : undefined
        }
      />
    ) : null;

  // PCは左の地図とは別に、公式のゲレンデマップ（画像・PDF）を
  // 「ゲレンデ」タブの先頭に置く。スマホの地図切り替えと同じ中身。
  const desktopTrailMapSection =
    hasTrailMap && !showTerrainDetail ? (
      <section aria-label="ゲレンデマップ" className="mb-4 space-y-1.5">
        <h2 className="text-base font-semibold text-slate-900">
          ゲレンデマップ
        </h2>
        <div className="h-[clamp(220px,38vh,440px)] overflow-hidden rounded-xl border border-slate-200">
          <TrailMapPanel links={trailMapLinks} className="h-full" />
        </div>
      </section>
    ) : null;

  const renderTabPanels = () => (
    <div className="relative">
      {activeTab === "ゲレンデ" && isSidePanel && desktopTrailMapSection}
      {activeTab === "ゲレンデ" && (
        <OverviewTab
          resort={resort}
          showTerrainDetail={showTerrainDetail}
          terrainTab={terrainTab}
          onShowTerrainDetail={tab => {
            setTerrainTab(tab);
            setShowTerrainDetail(true);
          }}
          onCloseTerrainDetail={() => setShowTerrainDetail(false)}
          selectedFinalizedFeature={selectedFinalizedFeature}
          onSelectedFinalizedFeatureChange={selectFeatureFromList}
        />
      )}
      {activeTab === "料金" && (
        <TicketsTab resort={resort} searchInput={liftTicketInput} />
      )}
      {activeTab === "天気" && <WeatherTab resort={resort} />}
      {activeTab === "リンク集" && <ResortLinksTab resort={resort} />}
      {/* 外側の余白はほかのタブと同じ（タブ本文の枠が持つ） */}
      {activeTab === "投稿" && (
        <CommunityFeed
          resortId={resort.id}
          resortIds={simultaneous.partners.map(partner => partner.id)}
          highlightOnMap
          correctable
        />
      )}
    </div>
  );

  const composer =
    composeRequest &&
    composeResortIds.current.includes(composeRequest.resortId) &&
    composeMapData ? (
      <div
        className="flex h-full min-h-0 flex-col"
        role="region"
        aria-label="現地レポートの投稿パネル"
      >
        <div className="min-h-0 flex-1">
          <CommunityComposer
            key={`${composeRequest.resortId}:${composeRequest.postId ?? "new"}`}
            resortId={composeRequest.resortId}
            mapData={
              composeRequest.postId
                ? resortReportMap(composeMapData, composeRequest.resortId)
                : composeMapData
            }
            postId={composeRequest.postId}
            embedded
            onClose={closeComposer}
            onStartNew={() => setComposeRequest({ resortId: resort.id })}
            initialTarget={composeRequest.target}
            selectedMapTarget={composeTarget}
            onMapPickModeChange={handlePickMode}
            onMapPointChange={handleMapPoint}
            onTargetChange={handleComposeTargetChange}
            allowPreview={process.env.NODE_ENV === "development"}
          />
        </div>
      </div>
    ) : null;
  const correction =
    correctionRequest && correctionRequest.resortId === resort.id ? (
      <CorrectionPanel
        key={`${resort.id}:${correctionRequest.target?.ids.join(",") ?? "all"}`}
        resortId={resort.id}
        center={[resort.longitude, resort.latitude]}
        target={correctionRequest.target}
        compact={!isSidePanel}
        mapHost={correctionMapHost}
        selectedLine={selectedCorrectionLine}
        onSelectedLineChange={handleCorrectionLineChange}
        onLayoutChange={setCorrectionLayout}
        onClose={closeCorrection}
      />
    ) : null;
  // 位置を直す間は、いつもの地図の上に編集用の地図を重ねる。
  // いつもの地図は作り直さず、閉じたら元の表示のまま戻る。
  const correctionMapActive =
    Boolean(correction) && correctionLayout !== "form";
  const postDetail = openPosts ? (
    <CommunityMapPreview
      key={openPosts.key}
      posts={openPosts.posts}
      onSelect={entry => highlightCommunityMapEntry(resort.id, entry)}
      onClose={() => openCommunityMapPosts(resort.id, null)}
    />
  ) : null;
  // スマホの投稿はコース詳細と同じく、上の地図をそのまま使い下だけを差し替える。
  const mobileFeatureDetail =
    composer && !isSidePanel
      ? composer
      : correction && !isSidePanel
        ? correction
        : (renderFeatureDetail() ?? postDetail);
  const mobileCorrection = Boolean(correction) && !composer && !isSidePanel;

  // スマホは地図を常に同じ位置に置いたまま、その下だけを詳細に差し替える。
  // 位置が変わると地図が作り直され、選択状態が失われる。
  // デスクトップはパネル全体を詳細に切り替える。
  const detailPanelContent = isSidePanel ? (
    (renderFeatureDetail({ withOpenList: true }) ??
    postDetail ?? (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0">{desktopDetailHeader}</div>
        <div
          data-session-scroll={`${stateKey}:desktop:${activeTab}`}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <DetailTabs
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
          <div className="p-3 @min-[30rem]/resort-detail:p-4 text-gray-700">
            {renderTabPanels()}
          </div>
        </div>
      </div>
    ))
  ) : (
    // 選択中の機能（コース・リフト）がないときは、案内・地図・タブまで
    // まとめて 1 つのスクロール領域にする（地図もスクロールで隠れる）。
    // 選択中は、地図とその下の詳細パネルという固定レイアウトのまま。
    <div
      data-session-scroll={`${stateKey}:mobile:${activeTab}:${terrainTab}:${showTerrainDetail}`}
      className={
        mobileFeatureDetail
          ? "flex h-full min-h-0 flex-col"
          : "h-full min-h-0 overflow-y-auto overscroll-contain"
      }
    >
      {composer || correction ? null : hideMobileInfoSection ? (
        // 名前と所在地は上の見出しが出すので、同時表示の操作だけをタブの上に置く
        simultaneousControl &&
        !mobileFeatureDetail && (
          <div className="border-b border-gray-200 px-3 py-1.5">
            {simultaneousControl}
          </div>
        )
      ) : (
        <InfoSection
          resort={resortInfo}
          isCompareSelected={isCompareSelected}
          onToggleCompare={onToggleCompare}
          onClose={onClose}
        >
          {simultaneousControl}
        </InfoSection>
      )}
      {!mobileFeatureDetail && (
        <DetailTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
      {/* 地図は「ゲレンデ」タブ（とそこから選んだコース・リフトの詳細）と、
          投稿の場所を示す「投稿」タブで使う。他のタブでは表示領域を無駄にしないよう出さない。 */}
      {(mobileFeatureDetail ||
        activeTab === "ゲレンデ" ||
        activeTab === "投稿") &&
        (!mobileFeatureDetail &&
        activeTab === "ゲレンデ" &&
        hasTrailMap &&
        mapAreaView === "ゲレンデマップ" ? (
          // 静止画なので、タブとは重ならない専用の帯を上に置く
          <div className="flex h-[clamp(200px,41dvh,396px)] shrink-0 flex-col">
            <div className="flex shrink-0 justify-start border-b border-slate-200 bg-white px-2 py-1.5">
              <MapAreaTabs
                tabs={MAP_AREA_TABS}
                activeTab={mapAreaView}
                onTabChange={setMapAreaView}
              />
            </div>
            <div className="min-h-0 flex-1">
              <TrailMapPanel links={trailMapLinks} className="h-full" />
            </div>
          </div>
        ) : (
          // 地図（航空写真）はボタンの下まで敷いたまま、コース・リフトだけが
          // ボタンの下に潜らないようにする。帯の高さは地図側が余白として読み取る。
          // isolate: 地図に重ねたボタン類（z-20/z-30 や地図ライブラリ内部の
          // 高い z-index）をこの箱の中に閉じ込める。スクロールで上に貼り付く
          // タブ（sticky z-20）の上に出てしまうのを防ぐ。
          <div
            className={
              mobileFeatureDetail
                ? "relative isolate flex min-h-0 flex-1 flex-col"
                : activeTab === "投稿"
                  ? // 投稿を押すと地図に場所が出るので、一覧をスクロールしても
                    // タブ（h-9）の下に貼り付けて見えるようにする
                    "sticky top-9 isolate z-10 h-[clamp(180px,34dvh,320px)] shrink-0 bg-white"
                  : "relative isolate h-[clamp(200px,41dvh,396px)] shrink-0"
            }
          >
            <div
              className={
                mobileFeatureDetail ? "flex min-h-0 flex-1 flex-col" : "h-full"
              }
            >
              <ResortMapSection
                DynamicMap={DynamicMap}
                mapTopControls={
                  hasTrailMap &&
                  !mobileFeatureDetail &&
                  activeTab === "ゲレンデ" ? (
                    <MapAreaTabs
                      tabs={MAP_AREA_TABS}
                      activeTab={mapAreaView}
                      onTabChange={setMapAreaView}
                    />
                  ) : undefined
                }
                resortId={resort.id}
                previewHeightClassName="h-full shrink-0"
                // 修正中は、入力が主役の画面では地図を低く、位置を直す画面では地図を広く使う
                selectedHeightClassName={
                  !mobileCorrection
                    ? "h-[38%] min-h-[180px] shrink-0"
                    : correctionMapActive
                      ? "min-h-0 flex-1"
                      : "h-[30%] min-h-[150px] shrink-0"
                }
                expandedSelectedHeightClassName={
                  mobileCorrection && correctionMapActive
                    ? "min-h-0 flex-1"
                    : undefined
                }
                featureDetailClassName={
                  !mobileCorrection || !correctionMapActive
                    ? undefined
                    : correctionLayout === "map-list"
                      ? "h-[46%] shrink-0"
                      : "flex max-h-[60%] shrink-0 flex-col"
                }
                mapOverlay={
                  mobileCorrection && correctionMapActive ? (
                    <div
                      ref={setCorrectionMapHost}
                      className="absolute inset-0 z-[760]"
                    />
                  ) : undefined
                }
                finalizedMapData={displayedMapData}
                mapResorts={mapResorts}
                selectedFinalizedFeature={selectedFinalizedFeature}
                selectedElevationProfilePoint={selectedElevationProfilePoint}
                onSelectedFinalizedFeatureChange={selectFeatureFromMap}
                onSelectedElevationProfilePointChange={
                  onSelectedElevationProfilePointChange
                }
                featureDetail={mobileFeatureDetail}
                // 投稿中と投稿タブの地図は場所を見るためのもの。地図の操作ボタンは出さない
                minimalControls={
                  Boolean(composer) ||
                  mobileCorrection ||
                  Boolean(postDetail) ||
                  (!mobileFeatureDetail && activeTab === "投稿")
                }
                resizableFeatureDetail={Boolean(composer)}
                detailViewportResetKey={detailViewportResetKey}
              />
            </div>
          </div>
        ))}
      {!mobileFeatureDetail && (
        <div className="p-3 text-gray-700">{renderTabPanels()}</div>
      )}
    </div>
  );

  // 全画面地図では一覧が見えていないので、「一覧へ」の導線は出さない
  const desktopFeatureDetail =
    renderFeatureDetail({
      withOpenList: !isDesktopMapExpanded,
    }) ?? postDetail;
  // 全画面地図では、選択中のコースだけを右に重ねる。
  // 何も選んでいなければパネルごと畳んで地図を邪魔しない。
  const shouldRenderDesktopPanel =
    isSidePanel && (!isDesktopMapExpanded || Boolean(desktopFeatureDetail));

  if (correction && !composer && isSidePanel)
    return (
      <Portal>
        {correctionMapActive && (
          <div
            ref={setCorrectionMapHost}
            className="fixed inset-y-0 left-0 z-[410] bg-gray-200"
            style={{
              right: isDesktopMapExpanded
                ? 0
                : "var(--desktop-detail-panel-width)",
            }}
          />
        )}
        <div
          className={cn(
            "fixed inset-0 z-[420] flex justify-end pointer-events-none",
            isDesktopMapExpanded && "p-3",
          )}
        >
          <AnimatedPanel
            data-ski-resort-detail-panel="true"
            visible
            rootClassName="h-full w-full md:w-auto"
            contentClassName={cn(
              "@container/resort-detail relative flex h-full min-h-0 w-full flex-col overflow-hidden border border-gray-200 bg-white pointer-events-auto shadow-2xl md:w-[var(--desktop-detail-panel-width)]",
              isDesktopMapExpanded && "md:w-[min(400px,40vw)] rounded-xl",
            )}
          >
            {correction}
          </AnimatedPanel>
        </div>
      </Portal>
    );

  if (composer && isSidePanel)
    return (
      <Portal>
        <div
          className={cn(
            "fixed inset-0 z-[420] flex justify-end pointer-events-none",
            isSidePanel && isDesktopMapExpanded && "p-3",
          )}
        >
          <AnimatedPanel
            visible
            rootClassName="h-full w-full md:w-auto"
            contentClassName={cn(
              "@container/resort-detail relative flex h-full min-h-0 w-full flex-col overflow-hidden border border-gray-200 bg-white pointer-events-auto shadow-2xl md:w-[var(--desktop-detail-panel-width)]",
              isSidePanel &&
                isDesktopMapExpanded &&
                "md:w-[min(400px,40vw)] rounded-xl",
            )}
          >
            {composer}
          </AnimatedPanel>
        </div>
      </Portal>
    );

  return (
    <>
      {shouldRenderDesktopPanel && (
        <Portal>
          <div
            className={cn(
              "fixed inset-0 hidden md:flex md:justify-end pointer-events-none",
              isDesktopMapExpanded ? "z-[420] p-3" : "z-[60]",
            )}
          >
            <div
              className="absolute inset-0 bg-transparent pointer-events-none"
              aria-hidden="true"
            />
            <AnimatedPanel
              data-ski-resort-detail-panel="true"
              visible={isSidePanel}
              contentClassName={cn(
                "@container/resort-detail relative z-10 flex h-full max-h-none max-w-none flex-col overflow-hidden bg-white border border-gray-200 pointer-events-auto shadow-2xl",
                isDesktopMapExpanded
                  ? "w-[min(400px,40vw)] rounded-xl"
                  : "w-[var(--desktop-detail-panel-width)]",
              )}
            >
              {isDesktopMapExpanded ? desktopFeatureDetail : detailPanelContent}
            </AnimatedPanel>
          </div>
        </Portal>
      )}
      {!isSidePanel && shouldRenderMobilePanel && (
        <div
          data-ski-resort-detail-panel="true"
          className={`z-[300] flex h-full flex-col overflow-hidden bg-white border-t border-gray-200 ${mobilePanelPositionClasses}`}
        >
          <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
            {detailPanelContent}
          </div>
        </div>
      )}
    </>
  );
};
