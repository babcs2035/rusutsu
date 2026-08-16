"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { loadSlopeSourceData } from "./actions";
import { ConfirmStep } from "./components/ConfirmStep";
import { DetailEditStep } from "./components/DetailEditStep";
import { EditorMap, type EditorMapMode } from "./components/EditorMap";
import { LineEditStep } from "./components/LineEditStep";
import { ResortSelectStep } from "./components/ResortSelectStep";
import { TutorialOverlay } from "./components/TutorialOverlay";
import { RESORT_INITIAL_ZOOM, TUTORIAL_SEEN_STORAGE_KEY } from "./constants";
import { loadDraft, useDraftStorage } from "./hooks/useDraftStorage";
import type {
  EditorCourse,
  EditStep,
  ResortOption,
  SlopeBeforeFeature,
  SlopeDetailEntry,
  StartSource,
} from "./types";
import {
  assignUnnamedCourseNames,
  createEmptyDetail,
  fillEmptyCourseSearchWords,
  splitCourseAtVertex,
} from "./utils/courseOps";
import {
  buildLevelNormalizationWarning,
  normalizeLevel,
  sourceDataToCourses,
} from "./utils/loadSource";

type SlopeEditWorkspaceProps = {
  resorts: ResortOption[];
  googleMapsApiKey: string | null;
};

const STEP_LABELS: Array<{ step: EditStep; label: string }> = [
  { step: "select", label: "1. スキー場選択" },
  { step: "lines", label: "2. コース線編集" },
  { step: "details", label: "3. 分割・詳細編集" },
  { step: "confirm", label: "4. 確認・保存" },
];

const normalizeDraftCourse = (course: EditorCourse): EditorCourse => ({
  ...course,
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

  const closeTutorial = () => {
    try {
      window.localStorage.setItem(TUTORIAL_SEEN_STORAGE_KEY, "1");
    } catch {
      // 保存できなくてもチュートリアルは閉じる
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

  const resetMapModes = () => {
    setIsDrawing(false);
    setIsSplitMode(false);
  };

  const handleStart = async (
    selected: ResortOption,
    source: StartSource,
  ): Promise<void> => {
    setLoadError(null);
    setLoadWarning(null);
    setSaveMessage(null);

    if (source !== "draft" && loadDraft(selected.id)) {
      setPendingResort(selected);
      setPendingSource(source);
      setDraftDialogOpen(true);
      return;
    }

    setIsLoadingSource(true);
    try {
      const data = await loadSlopeSourceData(selected.id);
      let nextCourses: EditorCourse[];
      let nextPreservedFeatures: SlopeBeforeFeature[] = [];
      let nextPreservedDetails: SlopeDetailEntry[] = [];
      let nextFileHash = data.fileHash;
      let nextDetailFileHash = data.detailFileHash;
      const nextLoadWarnings: string[] = [];

      if (source === "draft") {
        const draft = loadDraft(selected.id);
        if (!draft) {
          setLoadError("下書きを読み込めませんでした。");
          return;
        }
        nextCourses = draft.courses.map((course, index) => {
          const normalizedCourse = normalizeDraftCourse(course);
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
            "下書きの作成後に slope_before または slope_detail が変更されています。このままでは保存時に競合エラーになります。",
          );
        }
      } else if (source === "existing") {
        if (!data.geojson) {
          setLoadError(
            `${selected.id} の slope_before を読み込めませんでした。`,
          );
          return;
        }
        const result = sourceDataToCourses(data);
        nextCourses = result.courses;
        nextPreservedFeatures = result.preservedFeatures;
        nextPreservedDetails = result.preservedDetails;
        nextLoadWarnings.push(...result.warnings);
        if (
          result.preservedFeatures.length > 0 ||
          result.preservedDetails.length > 0
        ) {
          nextLoadWarnings.push(
            `編集対象外の feature ${result.preservedFeatures.length} 件は slope_before の末尾に保持します。コース線に未対応の slope_detail ${result.preservedDetails.length} 件は読み込み対象外で、元ファイルは変更しません。`,
          );
        }
      } else {
        nextCourses = [];
      }

      setResort(selected);
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
      setStep("lines");
    } catch {
      setLoadError("既存データの読み込みに失敗しました。");
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleProceedToDetails = () => {
    const nextCourses = fillEmptyCourseSearchWords(
      assignUnnamedCourseNames(courses),
      resort?.searchName ?? "",
    );
    setCoursesState(nextCourses);
    if (!activeCourseId) setActiveCourseId(nextCourses[0]?.id ?? null);
    resetMapModes();
    setStep("details");
  };

  const handleDraftDialogConfirm = () => {
    setDraftDialogOpen(false);
    if (pendingResort && pendingSource) {
      handleStart(pendingResort, pendingSource);
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

  const handleSplitAtVertex = (vertexIndex: number) => {
    if (!activeCourseId) return;
    setCoursesState(previous =>
      splitCourseAtVertex(
        previous,
        activeCourseId,
        vertexIndex,
        resort?.searchName ?? "",
      ),
    );
    setIsSplitMode(false);
  };

  const selectedCourse =
    courses.find(course => course.id === activeCourseId) ?? null;
  const mapIsVisible = step === "lines" || step === "details";
  const mapMode: EditorMapMode =
    step === "lines"
      ? isDrawing
        ? "draw"
        : selectedCourse
          ? "edit"
          : "view"
      : step === "details" && isSplitMode
        ? "split"
        : "view";

  return (
    <div className="flex flex-col h-[100dvh] min-h-0">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-b border-gray-200 bg-white">
        <h1 className="text-sm font-bold font-[var(--font-heading)]">
          スキー場コース編集
        </h1>
        <div className="flex flex-wrap gap-1">
          {STEP_LABELS.map(({ step: stepId, label }) => (
            <Badge
              key={stepId}
              className="text-xs"
              variant={step === stepId ? "default" : "secondary"}
            >
              {label}
            </Badge>
          ))}
        </div>
        {resort && step !== "select" && (
          <p className="text-sm text-gray-600">対象: {resort.nameJa}</p>
        )}
        <div className="flex-1" />
        {loadError && <p className="text-xs text-red-500">{loadError}</p>}
        {loadWarning && (
          <p className="text-xs text-orange-900 max-w-[520px] max-h-[72px] overflow-y-auto whitespace-pre-line">
            {loadWarning}
          </p>
        )}
        {saveMessage && <p className="text-xs text-green-900">{saveMessage}</p>}
        {isLoadingSource && (
          <p className="text-xs text-gray-500">既存データを読み込み中…</p>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowTutorial(true)}
        >
          使い方
        </Button>
      </header>

      <div className="flex-1 min-h-0 relative">
        {step === "select" && (
          <ResortSelectStep resorts={resorts} onStart={handleStart} />
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
            onBackToSelect={handleBackToSelect}
          />
        )}
        {step === "details" && resort && (
          <DetailEditStep
            resort={resort}
            courses={courses}
            setCourses={setCourses}
            savedAt={savedAt}
            selectedCourseId={activeCourseId}
            onSelectedCourseIdChange={setActiveCourseId}
            isSplitMode={isSplitMode}
            onSplitModeChange={setIsSplitMode}
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
            courses={courses}
            fileHash={fileHash}
            detailFileHash={detailFileHash}
            preservedFeatures={preservedFeatures}
            preservedDetails={preservedDetails}
            onBack={() => setStep("details")}
            onSaved={handleSaved}
          />
        )}

        {resort && step !== "select" && (
          <div
            className={`absolute top-0 right-0 bottom-0 left-[min(460px,60vw)] lg:left-[460px] ${
              mapIsVisible ? "visible" : "invisible pointer-events-none"
            }`}
          >
            <EditorMap
              center={[resort.longitude, resort.latitude]}
              zoom={RESORT_INITIAL_ZOOM}
              courses={courses}
              activeCourseId={activeCourseId}
              mode={mapMode}
              googleMapsApiKey={googleMapsApiKey}
              fitBoundsKey={fitBoundsKey}
              visible={mapIsVisible}
              onSelectCourse={courseId => {
                if (!isDrawing && !isSplitMode) {
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
          </div>
        )}
      </div>

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
