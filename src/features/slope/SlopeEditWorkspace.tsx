"use client";

import { HelpCircle, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { ResizablePanel } from "@/shared/components/ResizablePanel";
import { StepIndicator } from "@/shared/components/StepIndicator";
import { applySlopeFeatureOrder, loadSlopeSourceData } from "./actions";
import { AssignStep } from "./components/AssignStep";
import { ConfirmStep } from "./components/ConfirmStep";
import { DetailEditStep } from "./components/DetailEditStep";
import {
  type EditorLinePick,
  EditorMap,
  type EditorMapMode,
  type EditorMergePreview,
} from "./components/EditorMap";
import { LineEditStep } from "./components/LineEditStep";
import type { MergeDraft } from "./components/MergeCoursesPanel";
import { ResortSelectStep } from "./components/ResortSelectStep";
import { TutorialOverlay } from "./components/TutorialOverlay";
import { RESORT_INITIAL_ZOOM, TUTORIAL_SEEN_STORAGE_KEY } from "./constants";
import { loadDraft, useDraftStorage } from "./hooks/useDraftStorage";
import type {
  EditorCourse,
  EditStep,
  LngLat,
  ResortOption,
  SlopeBeforeFeature,
  SlopeDetailEntry,
  SlopeSourceKind,
  StartSource,
} from "./types";
import {
  assignUnnamedCourseNames,
  createEmptyDetail,
  fillEmptyCourseSearchWords,
  mergeCourses,
  splitCourseAtVertex,
  suggestMergedName,
} from "./utils/courseOps";
import { reorderItemsByNameOrder } from "./utils/courseOrder";
import {
  defaultSideToKeep,
  joinLines,
  type LinePosition,
  type LineSide,
  positionToCoordinate,
  snapPositionToVertex,
  takeSide,
} from "./utils/lineGeometry";
import {
  buildLevelNormalizationWarning,
  fillDraftDetailFromSource,
  normalizeLevel,
  sourceDataToCourses,
} from "./utils/loadSource";

type SlopeEditWorkspaceProps = {
  resorts: ResortOption[];
  googleMapsApiKey: string | null;
};

const STEPS: Array<{ id: EditStep; label: string }> = [
  { id: "select", label: "スキー場選択" },
  { id: "assign", label: "所属確認" },
  { id: "lines", label: "線・分割・結合" },
  { id: "details", label: "詳細編集" },
  { id: "confirm", label: "保存" },
];

/** 結合のつなぎ目を既存の頂点へ吸い付かせる距離 */
const MERGE_SNAP_M = 20;

const PANEL_WIDTH_KEY = "rusutsu-slope-panel-width";

const normalizeDraftCourse = (
  course: EditorCourse,
  resortId: string,
): EditorCourse => ({
  ...course,
  skiId: course.skiId || resortId,
  originalSkiId: course.originalSkiId || resortId,
  detail: { ...createEmptyDetail(), ...course.detail },
  beforeExtras: course.beforeExtras ?? {},
  detailExtras: course.detailExtras ?? null,
  splitGroupId: course.splitGroupId ?? null,
  splitBaseName: course.splitBaseName ?? null,
});

export function SlopeEditWorkspace({
  resorts,
  googleMapsApiKey,
}: SlopeEditWorkspaceProps) {
  const [step, setStep] = useState<EditStep>("select");
  const [resort, setResort] = useState<ResortOption | null>(null);
  const [sourceKind, setSourceKind] = useState<SlopeSourceKind>("curated");
  const [courses, setCoursesState] = useState<EditorCourse[]>([]);
  const [preservedFeatures, setPreservedFeatures] = useState<
    SlopeBeforeFeature[]
  >([]);
  const [preservedDetails, setPreservedDetails] = useState<SlopeDetailEntry[]>(
    [],
  );
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [detailFileHash, setDetailFileHash] = useState<string | null>(null);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [mergeDraft, setMergeDraft] = useState<MergeDraft | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [fitBoundsKey, setFitBoundsKey] = useState(0);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [pendingResort, setPendingResort] = useState<ResortOption | null>(null);
  const [pendingSource, setPendingSource] = useState<StartSource | null>(null);

  const { savedAt, markExported, markSavedToServer } = useDraftStorage(
    resort?.id ?? null,
    sourceKind,
    fileHash,
    detailFileHash,
    courses,
    preservedFeatures,
    preservedDetails,
    step !== "select",
  );

  useEffect(() => {
    if (!window.localStorage.getItem(TUTORIAL_SEEN_STORAGE_KEY)) {
      setShowTutorial(true);
    }
  }, []);

  const closeTutorial = (dontShowAgain: boolean) => {
    try {
      if (dontShowAgain) {
        window.localStorage.setItem(TUTORIAL_SEEN_STORAGE_KEY, "1");
      } else {
        window.localStorage.removeItem(TUTORIAL_SEEN_STORAGE_KEY);
      }
    } catch {
      // 保存できなくても手引きは閉じる
    }
    setShowTutorial(false);
  };

  const setCourses = useCallback(
    (updater: (previous: EditorCourse[]) => EditorCourse[]) => {
      setCoursesState(updater);
    },
    [],
  );

  const updateActiveCourse = useCallback(
    (updater: (course: EditorCourse) => EditorCourse) => {
      if (!activeCourseId) return;
      setCoursesState(previous =>
        previous.map(course =>
          course.id === activeCourseId ? updater(course) : course,
        ),
      );
    },
    [activeCourseId],
  );

  const resetMapModes = useCallback(() => {
    setIsDrawing(false);
    setIsSplitMode(false);
    setMergeDraft(null);
  }, []);

  const handleStart = async (
    selected: ResortOption,
    source: StartSource,
    ignoreDraftGuard = false,
  ): Promise<void> => {
    setLoadError(null);
    setLoadWarning(null);
    setSaveMessage(null);

    const requestedSourceKind: SlopeSourceKind =
      source === "osm" || source === "draft-osm" ? "osm" : "curated";
    const isDraftSource = source === "draft-curated" || source === "draft-osm";

    if (
      !ignoreDraftGuard &&
      !isDraftSource &&
      loadDraft(selected.id, requestedSourceKind)
    ) {
      setPendingResort(selected);
      setPendingSource(source);
      setDraftDialogOpen(true);
      return;
    }

    setIsLoadingSource(true);
    try {
      const draft = isDraftSource
        ? loadDraft(selected.id, requestedSourceKind)
        : null;
      const nextSourceKind = requestedSourceKind;
      const data = await loadSlopeSourceData(selected.id, nextSourceKind);
      let nextCourses: EditorCourse[];
      let nextPreservedFeatures: SlopeBeforeFeature[] = [];
      let nextPreservedDetails: SlopeDetailEntry[] = [];
      let nextFileHash = data.fileHash;
      let nextDetailFileHash = data.detailFileHash;
      const nextLoadWarnings: string[] = [];

      if (isDraftSource) {
        if (!draft) {
          setLoadError("下書きを読み込めませんでした。");
          return;
        }
        nextCourses = draft.courses.map((course, index) => {
          const normalizedCourse = normalizeDraftCourse(course, selected.id);
          const levelNormalization = normalizeLevel(
            normalizedCourse.detail.level,
          );
          const warning = buildLevelNormalizationWarning(
            normalizedCourse.name,
            index,
            levelNormalization,
          );
          if (warning) nextLoadWarnings.push(warning);
          return {
            ...normalizedCourse,
            detail: {
              ...normalizedCourse.detail,
              level: levelNormalization.level,
            },
          };
        });
        // 下書きの空欄を、いまのファイルの値で埋め直す。
        // 取り込みが不十分だった頃の下書きでも、level などを拾い直せる。
        const filled = fillDraftDetailFromSource(nextCourses, data);
        nextCourses = filled.courses;
        if (filled.filledCourseNames.length > 0) {
          nextLoadWarnings.push(
            `下書きで空欄だった詳細を、${nextSourceKind === "osm" ? "slope_before_osm" : "slope_before / slope_detail"} の値で補いました（${filled.filledCourseNames.length} コース）。`,
          );
        }
        nextPreservedFeatures = draft.preservedFeatures ?? [];
        nextPreservedDetails = draft.preservedDetails ?? [];
        nextFileHash = draft.fileHash ?? data.fileHash;
        nextDetailFileHash = draft.detailFileHash ?? data.detailFileHash;
        if (
          (draft.fileHash !== undefined && draft.fileHash !== data.fileHash) ||
          (draft.detailFileHash !== undefined &&
            draft.detailFileHash !== data.detailFileHash)
        ) {
          nextLoadWarnings.push(
            `下書きの作成後に ${nextSourceKind === "osm" ? "slope_before_osm" : "slope_before または slope_detail"} が変更されています。このままでは保存時に競合エラーになります。`,
          );
        }
      } else if (source === "curated" || source === "osm") {
        if (!data.geojson) {
          setLoadError(
            `${selected.id} の ${nextSourceKind === "osm" ? "slope_before_osm" : "slope_before"} を読み込めませんでした。`,
          );
          return;
        }
        const result = sourceDataToCourses(selected.id, data);
        nextCourses = result.courses;
        nextPreservedFeatures = result.preservedFeatures;
        nextPreservedDetails = result.preservedDetails;
        nextLoadWarnings.push(...result.warnings);
        if (
          result.preservedFeatures.length > 0 ||
          result.preservedDetails.length > 0
        ) {
          nextLoadWarnings.push(
            `編集対象外の feature ${result.preservedFeatures.length} 件は ${nextSourceKind === "osm" ? "slope_before_osm" : "slope_before"} の末尾に保持します。コース線に未対応の slope_detail ${result.preservedDetails.length} 件は読み込み対象外で、元ファイルは変更しません。`,
          );
        }
      } else {
        nextCourses = [];
      }

      setResort(selected);
      setSourceKind(nextSourceKind);
      setCoursesState(nextCourses);
      setPreservedFeatures(nextPreservedFeatures);
      setPreservedDetails(nextPreservedDetails);
      setFileHash(nextFileHash);
      setDetailFileHash(nextDetailFileHash);
      setLoadWarning(
        nextLoadWarnings.length > 0 ? nextLoadWarnings.join("\n") : null,
      );
      setActiveCourseId(nextCourses[0]?.id ?? null);
      resetMapModes();
      setFitBoundsKey(key => key + 1);
      setStep(nextSourceKind === "osm" ? "assign" : "lines");
    } catch {
      setLoadError("既存データの読み込みに失敗しました。");
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleProceedToDetails = () => {
    const searchNameByResortId = new Map(
      resorts.map(option => [option.id, option.searchName]),
    );
    const nextCourses = fillEmptyCourseSearchWords(
      assignUnnamedCourseNames(courses),
      course =>
        searchNameByResortId.get(course.skiId) ?? resort?.searchName ?? "",
    );
    setCoursesState(nextCourses);
    if (!activeCourseId) setActiveCourseId(nextCourses[0]?.id ?? null);
    resetMapModes();
    setStep("details");
  };

  const handleDraftDialogConfirm = () => {
    setDraftDialogOpen(false);
    if (pendingResort && pendingSource) {
      handleStart(pendingResort, pendingSource, true);
    }
    setPendingResort(null);
    setPendingSource(null);
  };

  const handleDraftDialogCancel = () => {
    setDraftDialogOpen(false);
    setPendingResort(null);
    setPendingSource(null);
  };

  const handleBackToSelect = () => {
    setStep("select");
    setResort(null);
    setSourceKind("curated");
    setCoursesState([]);
    setPreservedFeatures([]);
    setPreservedDetails([]);
    setFileHash(null);
    setDetailFileHash(null);
    setActiveCourseId(null);
    resetMapModes();
    setLoadWarning(null);
  };

  const handleSaved = (writtenFiles: string[]) => {
    markSavedToServer();
    setSaveMessage(`保存しました: ${writtenFiles.join(", ")}`);
    handleBackToSelect();
  };

  const resortSearchNameFor = useCallback(
    (course: EditorCourse | undefined) =>
      resorts.find(option => option.id === course?.skiId)?.searchName ??
      resort?.searchName ??
      "",
    [resort?.searchName, resorts],
  );

  const handleSplitAtVertex = (vertexIndex: number) => {
    if (!activeCourseId) return;
    const activeCourse = courses.find(course => course.id === activeCourseId);
    setCoursesState(previous =>
      splitCourseAtVertex(
        previous,
        activeCourseId,
        vertexIndex,
        resortSearchNameFor(activeCourse),
      ),
    );
    setIsSplitMode(false);
  };

  // --- コースの結合 -------------------------------------------------------
  const handleMergeStart = () => {
    setIsDrawing(false);
    setIsSplitMode(false);
    setMergeDraft({
      first: null,
      second: null,
      name: "",
      detailFrom: "first",
    });
  };

  const handlePickLinePoint = useCallback(
    (pick: EditorLinePick) => {
      setMergeDraft(draft => {
        if (!draft) return draft;
        const course = courses.find(item => item.id === pick.lineId);
        if (!course) return draft;

        // 端の頂点に寄せておくと、線まるごとをつなぐ普通の結合が
        // 位置をきっちり合わせなくても決まる
        const position = snapPositionToVertex(
          course.coordinates,
          { segmentIndex: pick.segmentIndex, t: pick.t },
          MERGE_SNAP_M,
        );
        const anchor = {
          courseId: pick.lineId,
          position,
          keep: defaultSideToKeep(course.coordinates, position),
        };

        // 同じコースを押し直したら、その枠を置き直す
        if (draft.first === null || draft.first.courseId === pick.lineId) {
          return {
            ...draft,
            first: anchor,
            name: draft.name || suggestMergedName(course, course),
          };
        }
        if (draft.second?.courseId === pick.lineId) {
          return { ...draft, second: anchor };
        }
        const firstCourse = courses.find(
          item => item.id === draft.first?.courseId,
        );
        return {
          ...draft,
          second: anchor,
          name:
            draft.name ||
            (firstCourse ? suggestMergedName(firstCourse, course) : ""),
        };
      });
    },
    [courses],
  );

  const handleMergeKeepChange = useCallback(
    (slot: "first" | "second", keep: LineSide) => {
      setMergeDraft(draft => {
        const anchor = draft?.[slot];
        if (!draft || !anchor) return draft;
        return { ...draft, [slot]: { ...anchor, keep } };
      });
    },
    [],
  );

  const handleMergeClearSlot = useCallback((slot: "first" | "second") => {
    setMergeDraft(draft => {
      if (!draft) return draft;
      // 1 本目を消したときは 2 本目を繰り上げて、選び直しの手数を減らす
      if (slot === "first") {
        return { ...draft, first: draft.second, second: null };
      }
      return { ...draft, second: null };
    });
  }, []);

  const mergePreview: EditorMergePreview | null = useMemo(() => {
    if (!mergeDraft) return null;
    const anchors: LngLat[] = [];
    const discarded: LngLat[][] = [];
    const arms: Array<{
      coordinates: LngLat[];
      position: LinePosition;
      keep: LineSide;
    }> = [];

    for (const slot of ["first", "second"] as const) {
      const anchor = mergeDraft[slot];
      if (!anchor) continue;
      const course = courses.find(item => item.id === anchor.courseId);
      if (!course) continue;
      const point = positionToCoordinate(course.coordinates, anchor.position);
      if (point) anchors.push(point);
      arms.push({
        coordinates: course.coordinates,
        position: anchor.position,
        keep: anchor.keep,
      });
      discarded.push(
        takeSide(
          course.coordinates,
          anchor.position,
          anchor.keep === "start" ? "end" : "start",
        ),
      );
    }

    const coordinates =
      arms.length === 2
        ? joinLines(arms[0], arms[1])
        : arms.length === 1
          ? takeSide(arms[0].coordinates, arms[0].position, arms[0].keep)
          : [];

    return { anchors, coordinates, discarded };
  }, [courses, mergeDraft]);

  const canMerge =
    mergeDraft?.first != null &&
    mergeDraft.second != null &&
    (mergePreview?.coordinates.length ?? 0) >= 2;

  const handleMergeConfirm = () => {
    if (!mergeDraft?.first || !mergeDraft.second || !canMerge) return;
    const firstCourse = courses.find(
      item => item.id === mergeDraft.first?.courseId,
    );
    const mergedId = mergeDraft.first.courseId;
    setCoursesState(previous =>
      mergeCourses(
        previous,
        mergeDraft.first as NonNullable<MergeDraft["first"]>,
        mergeDraft.second as NonNullable<MergeDraft["second"]>,
        { name: mergeDraft.name, detailFrom: mergeDraft.detailFrom },
        resortSearchNameFor(firstCourse),
      ),
    );
    setActiveCourseId(mergedId);
    setMergeDraft(null);
    setSaveMessage("2 本のコースを 1 本に結合しました。");
  };

  // 結合中は Escape でいつでも抜けられるようにする
  useEffect(() => {
    if (!mergeDraft) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMergeDraft(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mergeDraft]);

  const handleApplyCrawlerOrder = useCallback(
    async (orderedGeojsonNames: string[]) => {
      const targetResortId = resort?.id;
      if (!targetResortId || orderedGeojsonNames.length === 0) {
        return { ok: false, message: "並べ替えるコース線がありません。" };
      }

      setLoadError(null);
      const result = await applySlopeFeatureOrder({
        resortId: targetResortId,
        sourceKind,
        fileHash,
        orderedGeojsonNames,
      });
      if (!result.ok) {
        const message = result.errors.join("\n");
        setLoadError(message);
        return { ok: false, message };
      }

      setCoursesState(previous => {
        const targetCourses = reorderItemsByNameOrder(
          previous.filter(course => course.skiId === targetResortId),
          orderedGeojsonNames,
          course => course.name,
        );
        let targetIndex = 0;
        return previous.map(course =>
          course.skiId === targetResortId
            ? targetCourses[targetIndex++]
            : course,
        );
      });
      setFileHash(result.fileHash);
      const message = `クローラーJSON順を ${result.writtenFile} の features に保存しました。`;
      setSaveMessage(message);
      return { ok: true, message };
    },
    [fileHash, resort?.id, sourceKind],
  );

  const selectedCourse =
    courses.find(course => course.id === activeCourseId) ?? null;
  const mapIsVisible =
    step === "assign" || step === "lines" || step === "details";
  // 分割はコース線編集（工程 3）で行う。結合・描画とは同時に使わない
  const mapMode: EditorMapMode =
    step !== "lines"
      ? "view"
      : mergeDraft
        ? "merge"
        : isSplitMode
          ? "split"
          : isDrawing
            ? "draw"
            : selectedCourse
              ? "edit"
              : "view";

  const messages = [
    loadError && { tone: "error" as const, text: loadError },
    loadWarning && { tone: "warning" as const, text: loadWarning },
    saveMessage && { tone: "success" as const, text: saveMessage },
  ].filter(Boolean) as Array<{
    tone: "error" | "warning" | "success";
    text: string;
  }>;

  const dismissMessages = () => {
    setLoadError(null);
    setLoadWarning(null);
    setSaveMessage(null);
  };

  const messageTone = {
    error: "text-red-700",
    warning: "text-orange-900",
    success: "text-green-800",
  } as const;

  const messagePanel = messages.length > 0 && (
    <div className="pointer-events-auto absolute top-2 left-2 z-20 flex max-h-[30%] w-[min(560px,60%)] items-start gap-2 overflow-y-auto rounded-md border border-gray-200 bg-white/95 px-2 py-1.5 shadow-md">
      <div className="min-w-0 flex-1 space-y-0.5">
        {messages.map(message => (
          <p
            key={message.text}
            className={`text-xs whitespace-pre-line ${messageTone[message.tone]}`}
          >
            {message.text}
          </p>
        ))}
      </div>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="メッセージを閉じる"
        className="shrink-0"
        onClick={dismissMessages}
      >
        <X className="size-3" />
      </Button>
    </div>
  );

  const header = (
    <header className="flex min-w-0 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 py-1.5">
      <h1 className="shrink-0 font-bold font-[var(--font-heading)] text-sm">
        コース編集
      </h1>
      <div className="min-w-0 flex-1">
        <StepIndicator steps={STEPS} currentStepId={step} />
      </div>
      {resort && step !== "select" && (
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="max-w-[200px] truncate text-sm text-gray-700">
            {resort.nameJa}
          </span>
          <Badge
            variant="secondary"
            className={
              sourceKind === "curated"
                ? "bg-green-50 text-green-900"
                : "bg-orange-50 text-orange-900"
            }
          >
            {sourceKind === "curated" ? "✓ 確認済み" : "OSM・未確認"}
          </Badge>
        </div>
      )}
      {isLoadingSource && (
        <span className="shrink-0 text-xs text-gray-500">読み込み中…</span>
      )}
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => setShowTutorial(true)}
      >
        <HelpCircle className="size-3.5" />
        使い方
      </Button>
      <Link
        href="/admin"
        className="shrink-0 rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      >
        管理画面
      </Link>
    </header>
  );

  return (
    <div className="flex h-[100dvh] min-h-0">
      {step === "select" ? (
        <div className="flex min-w-0 flex-1 flex-col">
          {header}
          <div className="relative min-h-0 flex-1">
            <ResortSelectStep resorts={resorts} onStart={handleStart} />
            {messagePanel}
          </div>
        </div>
      ) : (
        <>
          {/* 左は地図。ヘッダーは地図の上だけに置き、右のパネルは上まで使う */}
          <div className="flex min-w-0 flex-1 flex-col">
            {header}
            <div
              className={`relative min-h-0 flex-1 ${
                mapIsVisible ? "visible" : "invisible pointer-events-none"
              }`}
            >
              {resort && (
                <EditorMap
                  center={[resort.longitude, resort.latitude]}
                  zoom={RESORT_INITIAL_ZOOM}
                  courses={courses}
                  activeCourseId={activeCourseId}
                  mode={mapMode}
                  googleMapsApiKey={googleMapsApiKey}
                  fitBoundsKey={fitBoundsKey}
                  visible={mapIsVisible}
                  showLabels={showLabels}
                  mergePreview={mergePreview}
                  onPickLinePoint={handlePickLinePoint}
                  onSelectCourse={courseId => {
                    if (!isDrawing && !isSplitMode && !mergeDraft) {
                      setActiveCourseId(courseId);
                    }
                  }}
                  onAppendVertex={lngLat =>
                    updateActiveCourse(course => ({
                      ...course,
                      coordinates: [...course.coordinates, lngLat],
                    }))
                  }
                  onMoveVertex={(index, lngLat) =>
                    updateActiveCourse(course => ({
                      ...course,
                      coordinates: course.coordinates.map(
                        (coordinate, coordinateIndex) =>
                          coordinateIndex === index ? lngLat : coordinate,
                      ),
                    }))
                  }
                  onInsertVertex={(index, lngLat) =>
                    updateActiveCourse(course => ({
                      ...course,
                      coordinates: [
                        ...course.coordinates.slice(0, index),
                        lngLat,
                        ...course.coordinates.slice(index),
                      ],
                    }))
                  }
                  onDeleteVertex={index =>
                    updateActiveCourse(course => ({
                      ...course,
                      coordinates: course.coordinates.filter(
                        (_, coordinateIndex) => coordinateIndex !== index,
                      ),
                    }))
                  }
                  onFinishDraw={() => setIsDrawing(false)}
                  onSplitVertex={handleSplitAtVertex}
                />
              )}
              {messagePanel}
            </div>
          </div>

          <ResizablePanel
            side="right"
            storageKey={PANEL_WIDTH_KEY}
            defaultWidth={470}
            minWidth={360}
            maxWidth={900}
          >
            {step === "assign" && resort && (
              <AssignStep
                resort={resort}
                resorts={resorts}
                courses={courses}
                setCourses={setCourses}
                selectedCourseId={activeCourseId}
                onSelectCourse={setActiveCourseId}
                onProceed={() => setStep("lines")}
                onBackToSelect={handleBackToSelect}
              />
            )}
            {step === "lines" && resort && (
              <LineEditStep
                resort={resort}
                courses={courses}
                setCourses={setCourses}
                savedAt={savedAt}
                activeCourseId={activeCourseId}
                onActiveCourseIdChange={setActiveCourseId}
                isDrawing={isDrawing}
                onDrawingChange={setIsDrawing}
                onFitBounds={() => setFitBoundsKey(key => key + 1)}
                onProceed={handleProceedToDetails}
                onApplyGeojsonOrder={handleApplyCrawlerOrder}
                onBackToSelect={
                  sourceKind === "osm"
                    ? () => setStep("assign")
                    : handleBackToSelect
                }
                backLabel={
                  sourceKind === "osm" ? "所属確認へ戻る" : "スキー場選択へ"
                }
                showLabels={showLabels}
                onShowLabelsChange={setShowLabels}
                isSplitMode={isSplitMode}
                onSplitModeChange={setIsSplitMode}
                resortSearchName={resortSearchNameFor(
                  selectedCourse ?? undefined,
                )}
                mergeDraft={mergeDraft}
                canMerge={canMerge}
                onMergeStart={handleMergeStart}
                onMergeCancel={() => setMergeDraft(null)}
                onMergeConfirm={handleMergeConfirm}
                onMergeKeepChange={handleMergeKeepChange}
                onMergeClearSlot={handleMergeClearSlot}
                onMergeNameChange={name =>
                  setMergeDraft(draft => (draft ? { ...draft, name } : draft))
                }
                onMergeDetailFromChange={detailFrom =>
                  setMergeDraft(draft =>
                    draft ? { ...draft, detailFrom } : draft,
                  )
                }
              />
            )}
            {step === "details" && resort && (
              <DetailEditStep
                resort={resort}
                resorts={resorts}
                sourceKind={sourceKind}
                courses={courses}
                setCourses={setCourses}
                savedAt={savedAt}
                selectedCourseId={activeCourseId}
                onSelectedCourseIdChange={setActiveCourseId}
                showLabels={showLabels}
                onShowLabelsChange={setShowLabels}
                onBackToLines={() => {
                  resetMapModes();
                  setStep("lines");
                }}
                onProceed={() => {
                  resetMapModes();
                  setStep("confirm");
                }}
                onExported={markExported}
              />
            )}
            {step === "confirm" && resort && (
              <ConfirmStep
                resort={resort}
                resorts={resorts}
                courses={courses}
                sourceKind={sourceKind}
                fileHash={fileHash}
                detailFileHash={detailFileHash}
                preservedFeatures={preservedFeatures}
                preservedDetails={preservedDetails}
                onBack={() => setStep("details")}
                onSaved={handleSaved}
              />
            )}
          </ResizablePanel>
        </>
      )}

      <TutorialOverlay open={showTutorial} onClose={closeTutorial} />
      <ConfirmDialog
        open={draftDialogOpen}
        onOpenChange={open => {
          if (!open) handleDraftDialogCancel();
        }}
        title="下書きの上書き確認"
        description="このスキー場には保存済みの下書きがあります。新しい編集を始めると、次の自動保存で下書きが上書きされます。続行しますか？"
        onConfirm={handleDraftDialogConfirm}
        confirmLabel="読み込む"
      />
    </div>
  );
}
