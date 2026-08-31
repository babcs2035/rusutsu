"use client";

import { HelpCircle, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  EditorMap,
  type EditorMapMode,
} from "@/features/slope/components/EditorMap";
import type { TileLayerId } from "@/features/slope/types";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { ResizablePanel } from "@/shared/components/ResizablePanel";
import { StepIndicator } from "@/shared/components/StepIndicator";
import {
  loadLiftSourceData,
  loadResortLinks,
  setLiftConfirmed,
} from "./actions";
import { AssignStep } from "./components/AssignStep";
import { ConfirmStep } from "./components/ConfirmStep";
import { DetailStep } from "./components/DetailStep";
import { GeometryStep } from "./components/GeometryStep";
import { LiftTutorialOverlay } from "./components/LiftTutorialOverlay";
import { LinksStep } from "./components/LinksStep";
import {
  ResortSelectStep,
  type StartSource,
} from "./components/ResortSelectStep";
import {
  EMPTY_RESORT_LINKS,
  LIFT_TUTORIAL_SEEN_STORAGE_KEY,
  RESORT_INITIAL_ZOOM,
} from "./constants";
import { loadDraft, useDraftStorage } from "./hooks/useDraftStorage";
import type {
  EditorLift,
  EditStep,
  LiftDetailEntry,
  ResortLinks,
  ResortOption,
} from "./types";
import {
  fillEmptyLiftSearchWords,
  hasLineChange,
  liftDisplayName,
} from "./utils/liftOps";
import { sourceDataToLifts } from "./utils/loadSource";

type LiftEditWorkspaceProps = {
  resorts: ResortOption[];
  googleMapsApiKey: string | null;
};

const STEPS: Array<{ id: EditStep; label: string }> = [
  { id: "select", label: "スキー場選択" },
  { id: "assign", label: "所属確認" },
  { id: "geometry", label: "位置補正" },
  { id: "details", label: "詳細情報" },
  { id: "links", label: "リンク" },
  { id: "confirm", label: "保存" },
];

const PANEL_WIDTH_KEY = "rusutsu-lift-panel-width";

export function LiftEditWorkspace({
  resorts,
  googleMapsApiKey,
}: LiftEditWorkspaceProps) {
  const [step, setStep] = useState<EditStep>("select");
  const [resort, setResort] = useState<ResortOption | null>(null);
  const [lifts, setLiftsState] = useState<EditorLift[]>([]);
  const [details, setDetails] = useState<LiftDetailEntry[]>([]);
  const [resortLinks, setResortLinks] =
    useState<ResortLinks>(EMPTY_RESORT_LINKS);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [selectedLiftId, setSelectedLiftId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMidstationMode, setIsMidstationMode] = useState(false);
  const [fitBoundsKey, setFitBoundsKey] = useState(0);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // 下書き上書き確認ダイアログ
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [pendingResort, setPendingResort] = useState<ResortOption | null>(null);
  const [pendingSource, setPendingSource] = useState<StartSource | null>(null);
  // ステップを移動してもタイルレイヤーの選択を維持する
  const [tileLayerId, setTileLayerId] = useState<TileLayerId>("gsiPale");
  const [showLabels, setShowLabels] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  // 確認済みフラグのクライアント側上書き（サーバー更新後の値）
  const [confirmedOverrides, setConfirmedOverrides] = useState<
    Record<string, string | null>
  >({});

  const effectiveResorts = resorts.map(option =>
    option.id in confirmedOverrides
      ? { ...option, confirmedAt: confirmedOverrides[option.id] }
      : option,
  );

  const handleToggleConfirmed = async (
    target: ResortOption,
    confirmed: boolean,
  ): Promise<void> => {
    try {
      const result = await setLiftConfirmed(target.id, confirmed);
      setConfirmedOverrides(previous => ({
        ...previous,
        [target.id]: result.confirmedAt,
      }));
    } catch {
      setLoadError(`${target.id} の確認済みフラグを更新できませんでした。`);
    }
  };

  const { savedAt, markSavedToServer } = useDraftStorage(
    resort?.id ?? null,
    fileHash,
    lifts,
    step !== "select",
  );

  useEffect(() => {
    if (!window.localStorage.getItem(LIFT_TUTORIAL_SEEN_STORAGE_KEY)) {
      setShowTutorial(true);
    }
  }, []);

  const closeTutorial = (dontShowAgain: boolean) => {
    try {
      if (dontShowAgain) {
        window.localStorage.setItem(LIFT_TUTORIAL_SEEN_STORAGE_KEY, "1");
      } else {
        window.localStorage.removeItem(LIFT_TUTORIAL_SEEN_STORAGE_KEY);
      }
    } catch {
      // 保存できなくても手引きは閉じる
    }
    setShowTutorial(false);
  };

  const setLifts = useCallback(
    (updater: (previous: EditorLift[]) => EditorLift[]) => {
      setLiftsState(updater);
    },
    [],
  );

  const updateSelectedLift = useCallback(
    (updater: (lift: EditorLift) => EditorLift) => {
      if (!selectedLiftId) return;
      setLiftsState(previous =>
        previous.map(lift =>
          lift.id === selectedLiftId ? updater(lift) : lift,
        ),
      );
    },
    [selectedLiftId],
  );

  const resetMapModes = () => {
    setIsDrawing(false);
    setIsMidstationMode(false);
  };

  const activeLifts = lifts.filter(lift => !lift.isDeleted);
  const deletedLifts = lifts.filter(lift => lift.isDeleted);
  const selectedLift =
    activeLifts.find(lift => lift.id === selectedLiftId) ?? null;
  // resort state に確認済みフラグの最新値を反映する（ConfirmStep でのトグル直後に表示へ反映するため）
  const effectiveResort = resort
    ? (effectiveResorts.find(option => option.id === resort.id) ?? resort)
    : null;

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
      const [data, links] = await Promise.all([
        loadLiftSourceData(selected.id),
        loadResortLinks(selected.id),
      ]);
      setResortLinks(links);

      if (source === "draft") {
        const draft = loadDraft(selected.id);
        if (!draft) {
          setLoadError("下書きを読み込めませんでした。");
          return;
        }
        if (data.fileHash !== draft.fileHash) {
          setLoadWarning(
            "下書きの作成後に lift_before ファイルが変更されています。このまま編集しても保存時にエラーになります。",
          );
        }
        // 旧バージョンの下書きに中間駅フィールドが無い場合を補完する
        const draftLifts = draft.lifts.map(lift => ({
          ...lift,
          midstation: lift.midstation ?? null,
          midstationRaw: lift.midstationRaw ?? null,
          original: {
            ...lift.original,
            midstation: lift.original.midstation ?? null,
          },
        }));
        setResort(selected);
        setLiftsState(draftLifts);
        setDetails(data.details ?? []);
        setFileHash(draft.fileHash);
        setSelectedLiftId(draftLifts.find(lift => !lift.isDeleted)?.id ?? null);
        resetMapModes();
        setFitBoundsKey(key => key + 1);
        setStep("assign");
        return;
      }

      if (source === "new") {
        // lift_before が無いスキー場: 空の状態から新規にリフトを描く
        setResort(selected);
        setLiftsState([]);
        setDetails(data.details ?? []);
        setFileHash(data.fileHash);
        setSelectedLiftId(null);
        resetMapModes();
        setStep("geometry");
        return;
      }

      if (!data.geojson) {
        setLoadError(`${selected.id} の lift_before を読み込めませんでした。`);
        return;
      }
      const result = sourceDataToLifts(selected.id, data);
      if (result.skipped > 0) {
        setLoadWarning(
          `LineString 以外など ${result.skipped} 件の feature は編集対象外です（保存すると失われるため、該当データがある場合は手動で確認してください）。`,
        );
      }
      setResort(selected);
      setLiftsState(result.lifts);
      setDetails(data.details ?? []);
      setFileHash(data.fileHash);
      setSelectedLiftId(result.lifts[0]?.id ?? null);
      resetMapModes();
      setFitBoundsKey(key => key + 1);
      setStep("assign");
    } catch {
      setLoadError("既存データの読み込みに失敗しました。");
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleBackToSelect = () => {
    // 編集内容は下書きとして自動保存済みなのでそのまま戻れる
    setStep("select");
    setResort(null);
    setLiftsState([]);
    setDetails([]);
    setResortLinks(EMPTY_RESORT_LINKS);
    setFileHash(null);
    setSelectedLiftId(null);
    resetMapModes();
    setLoadWarning(null);
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

  const handleSaved = (writtenFiles: string[]) => {
    markSavedToServer();
    setSaveMessage(`保存しました: ${writtenFiles.join(", ")}`);
    handleBackToSelect();
  };

  const mapIsVisible =
    step === "assign" || step === "geometry" || step === "details";
  const mapMode: EditorMapMode =
    step !== "geometry" || !selectedLift
      ? "view"
      : isDrawing
        ? "draw"
        : isMidstationMode
          ? "midstation"
          : "edit";

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
      <h2 className="shrink-0 font-bold font-[var(--font-heading)] text-sm">
        リフト編集
      </h2>
      <div className="min-w-0 flex-1">
        <StepIndicator steps={STEPS} currentStepId={step} />
      </div>
      {resort && step !== "select" && (
        <span className="max-w-[240px] shrink-0 truncate text-sm text-gray-700">
          {resort.nameJa || resort.id}
          {selectedLift && (
            <span className="text-gray-500">
              {" / "}
              {liftDisplayName(selectedLift)}
            </span>
          )}
        </span>
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
            <ResortSelectStep
              resorts={effectiveResorts}
              onStart={handleStart}
              onToggleConfirmed={handleToggleConfirmed}
            />
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
                  courses={activeLifts}
                  backgroundLines={
                    step === "geometry" &&
                    selectedLift &&
                    hasLineChange(selectedLift) &&
                    !selectedLift.isNew
                      ? [
                          {
                            id: `${selectedLift.id}-original`,
                            name: `${liftDisplayName(selectedLift)}（編集前）`,
                            coordinates: selectedLift.original.coordinates,
                          },
                        ]
                      : []
                  }
                  activeCourseId={selectedLiftId}
                  mode={mapMode}
                  googleMapsApiKey={googleMapsApiKey}
                  fitBoundsKey={fitBoundsKey}
                  layerId={tileLayerId}
                  onLayerIdChange={setTileLayerId}
                  visible={mapIsVisible}
                  showLabels={showLabels}
                  labelText={(line, index) => line.name || `リフト${index + 1}`}
                  midstation={selectedLift?.midstation ?? null}
                  onPlaceMidstation={lngLat => {
                    updateSelectedLift(lift => ({
                      ...lift,
                      midstation: lngLat,
                    }));
                    setIsMidstationMode(false);
                  }}
                  onMoveMidstation={lngLat =>
                    updateSelectedLift(lift => ({
                      ...lift,
                      midstation: lngLat,
                    }))
                  }
                  onSelectCourse={liftId => {
                    if (
                      step !== "geometry" ||
                      (!isDrawing && !isMidstationMode)
                    ) {
                      setSelectedLiftId(liftId);
                      if (step === "geometry") resetMapModes();
                    }
                  }}
                  onAppendVertex={lngLat =>
                    updateSelectedLift(lift => ({
                      ...lift,
                      coordinates: [...lift.coordinates, lngLat],
                    }))
                  }
                  onFinishDraw={() => setIsDrawing(false)}
                  onMoveVertex={(index, lngLat) =>
                    updateSelectedLift(lift => ({
                      ...lift,
                      coordinates: lift.coordinates.map((pair, pairIndex) =>
                        pairIndex === index ? lngLat : pair,
                      ),
                    }))
                  }
                  onInsertVertex={(index, lngLat) =>
                    updateSelectedLift(lift => ({
                      ...lift,
                      coordinates: [
                        ...lift.coordinates.slice(0, index),
                        lngLat,
                        ...lift.coordinates.slice(index),
                      ],
                    }))
                  }
                  onDeleteVertex={index =>
                    updateSelectedLift(lift => {
                      if (!lift.isNew && lift.coordinates.length <= 2) {
                        return lift;
                      }
                      return {
                        ...lift,
                        coordinates: lift.coordinates.filter(
                          (_, pairIndex) => pairIndex !== index,
                        ),
                      };
                    })
                  }
                />
              )}
              {messagePanel}
            </div>
          </div>

          <ResizablePanel
            side="right"
            storageKey={PANEL_WIDTH_KEY}
            defaultWidth={480}
            minWidth={360}
            maxWidth={900}
          >
            {step === "assign" && resort && (
              <AssignStep
                resort={resort}
                resorts={effectiveResorts}
                lifts={activeLifts}
                setLifts={setLifts}
                savedAt={savedAt}
                selectedLiftId={selectedLiftId}
                onSelectLift={liftId => {
                  setSelectedLiftId(liftId);
                  resetMapModes();
                }}
                onProceed={() => {
                  resetMapModes();
                  setStep("geometry");
                }}
                onBackToSelect={handleBackToSelect}
              />
            )}
            {step === "geometry" && resort && (
              <GeometryStep
                resort={resort}
                lifts={activeLifts}
                deletedLifts={deletedLifts}
                setLifts={setLifts}
                savedAt={savedAt}
                selectedLiftId={selectedLiftId}
                onSelectLift={setSelectedLiftId}
                isDrawing={isDrawing}
                onDrawingChange={setIsDrawing}
                isMidstationMode={isMidstationMode}
                onMidstationModeChange={setIsMidstationMode}
                onFitBounds={() => setFitBoundsKey(key => key + 1)}
                showLabels={showLabels}
                onShowLabelsChange={setShowLabels}
                onProceed={() => {
                  resetMapModes();
                  setLiftsState(previous =>
                    fillEmptyLiftSearchWords(
                      previous,
                      new Map(
                        effectiveResorts.map(option => [
                          option.id,
                          option.searchName,
                        ]),
                      ),
                    ),
                  );
                  setStep("details");
                }}
                onBack={() => {
                  resetMapModes();
                  setStep("assign");
                }}
              />
            )}
            {step === "details" && resort && (
              <DetailStep
                resort={resort}
                resorts={effectiveResorts}
                lifts={activeLifts}
                setLifts={setLifts}
                details={details}
                savedAt={savedAt}
                selectedLiftId={selectedLiftId}
                onSelectLift={setSelectedLiftId}
                onProceed={() => setStep("links")}
                onBack={() => {
                  resetMapModes();
                  setStep("geometry");
                }}
              />
            )}
            {step === "links" && resort && (
              <LinksStep
                resort={resort}
                links={resortLinks}
                setLinks={setResortLinks}
                onProceed={() => setStep("confirm")}
                onBack={() => setStep("details")}
              />
            )}
            {step === "confirm" && effectiveResort && (
              <ConfirmStep
                resort={effectiveResort}
                resorts={effectiveResorts}
                lifts={activeLifts}
                deletedLifts={deletedLifts}
                links={resortLinks}
                setLinks={setResortLinks}
                fileHash={fileHash}
                onBack={() => setStep("links")}
                onSaved={handleSaved}
                onToggleConfirmed={handleToggleConfirmed}
              />
            )}
          </ResizablePanel>
        </>
      )}

      <LiftTutorialOverlay open={showTutorial} onClose={closeTutorial} />
      <ConfirmDialog
        open={draftDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) handleDraftDialogCancel();
        }}
        title="下書きの上書き確認"
        description="このスキー場には保存済みの下書きがあります。新しく読み込むと、次の自動保存で下書きが上書きされます。続行しますか？"
        onConfirm={handleDraftDialogConfirm}
        confirmLabel="読み込む"
      />
    </div>
  );
}
