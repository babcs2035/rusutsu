"use client";

import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { useCallback, useState } from "react";
import type { TileLayerId } from "@/features/slope-edit/types";
import { loadLiftSourceData, setLiftConfirmed } from "./actions";
import { AssignStep } from "./components/AssignStep";
import { ConfirmStep } from "./components/ConfirmStep";
import { DetailStep } from "./components/DetailStep";
import { GeometryStep } from "./components/GeometryStep";
import {
  ResortSelectStep,
  type StartSource,
} from "./components/ResortSelectStep";
import { loadDraft, useDraftStorage } from "./hooks/useDraftStorage";
import type {
  EditorLift,
  EditStep,
  LiftDetailEntry,
  ResortOption,
} from "./types";
import { liftDisplayName } from "./utils/liftOps";
import { sourceDataToLifts } from "./utils/loadSource";

type LiftEditWorkspaceProps = {
  resorts: ResortOption[];
  googleMapsApiKey: string | null;
};

const STEP_LABELS: Array<{ step: EditStep; label: string }> = [
  { step: "select", label: "1. スキー場選択" },
  { step: "assign", label: "2. 所属確認・変更" },
  { step: "geometry", label: "3. 位置補正" },
  { step: "details", label: "4. 詳細情報" },
  { step: "confirm", label: "5. 確認・保存" },
];

export function LiftEditWorkspace({
  resorts,
  googleMapsApiKey,
}: LiftEditWorkspaceProps) {
  const [step, setStep] = useState<EditStep>("select");
  const [resort, setResort] = useState<ResortOption | null>(null);
  const [lifts, setLiftsState] = useState<EditorLift[]>([]);
  const [details, setDetails] = useState<LiftDetailEntry[]>([]);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [selectedLiftId, setSelectedLiftId] = useState<string | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // ステップを移動してもタイルレイヤーの選択を維持する
  const [tileLayerId, setTileLayerId] = useState<TileLayerId>("gsiPale");
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
  ) => {
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

  const setLifts = useCallback(
    (updater: (previous: EditorLift[]) => EditorLift[]) => {
      setLiftsState(updater);
    },
    [],
  );

  const selectedLift = lifts.find(lift => lift.id === selectedLiftId) ?? null;

  const handleStart = async (
    selected: ResortOption,
    source: StartSource,
  ): Promise<void> => {
    setLoadError(null);
    setLoadWarning(null);
    setSaveMessage(null);

    if (source !== "draft" && loadDraft(selected.id)) {
      const confirmed = window.confirm(
        "このスキー場には保存済みの下書きがあります。新しく読み込むと、次の自動保存で下書きが上書きされます。続行しますか？",
      );
      if (!confirmed) return;
    }

    setIsLoadingSource(true);
    try {
      const data = await loadLiftSourceData(selected.id);

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
        setSelectedLiftId(draftLifts[0]?.id ?? null);
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
    setFileHash(null);
    setSelectedLiftId(null);
    setLoadWarning(null);
  };

  const handleSaved = (writtenFiles: string[]) => {
    markSavedToServer();
    setSaveMessage(`保存しました: ${writtenFiles.join(", ")}`);
    handleBackToSelect();
  };

  return (
    <Flex direction="column" h="100dvh" minH={0}>
      <Flex
        as="header"
        align="center"
        gap={4}
        px={4}
        py={2}
        borderBottomWidth="1px"
        borderColor="gray.200"
        bg="white"
      >
        <Heading size="sm">スキー場リフト編集</Heading>
        <Flex gap={1}>
          {STEP_LABELS.map(({ step: stepId, label }) => (
            <Text
              key={stepId}
              fontSize="xs"
              px={2}
              py={1}
              borderRadius="md"
              bg={step === stepId ? "blue.500" : "gray.100"}
              color={step === stepId ? "white" : "gray.600"}
              fontWeight={step === stepId ? "bold" : "normal"}
            >
              {label}
            </Text>
          ))}
        </Flex>
        {resort && step !== "select" && (
          <Text fontSize="sm" color="gray.700" fontWeight="medium">
            対象: {resort.id}
            {selectedLift && (
              <Text as="span" color="gray.500">
                {" "}
                / 選択中: {liftDisplayName(selectedLift)}
              </Text>
            )}
          </Text>
        )}
        <Box flex="1" />
        {loadError && (
          <Text fontSize="xs" color="red.500">
            {loadError}
          </Text>
        )}
        {loadWarning && (
          <Text fontSize="xs" color="orange.600" maxW="360px">
            {loadWarning}
          </Text>
        )}
        {saveMessage && (
          <Text fontSize="xs" color="green.600">
            {saveMessage}
          </Text>
        )}
        {isLoadingSource && (
          <Text fontSize="xs" color="gray.500">
            既存データを読み込み中…
          </Text>
        )}
      </Flex>

      <Box flex="1" minH={0}>
        {step === "select" && (
          <ResortSelectStep
            resorts={effectiveResorts}
            onStart={handleStart}
            onToggleConfirmed={handleToggleConfirmed}
          />
        )}
        {step === "assign" && resort && (
          <AssignStep
            resort={resort}
            resorts={effectiveResorts}
            lifts={lifts}
            setLifts={setLifts}
            googleMapsApiKey={googleMapsApiKey}
            savedAt={savedAt}
            selectedLiftId={selectedLiftId}
            onSelectLift={setSelectedLiftId}
            tileLayerId={tileLayerId}
            onTileLayerIdChange={setTileLayerId}
            onProceed={() => setStep("geometry")}
            onBackToSelect={handleBackToSelect}
          />
        )}
        {step === "geometry" && resort && (
          <GeometryStep
            resort={resort}
            lifts={lifts}
            setLifts={setLifts}
            googleMapsApiKey={googleMapsApiKey}
            savedAt={savedAt}
            selectedLiftId={selectedLiftId}
            onSelectLift={setSelectedLiftId}
            tileLayerId={tileLayerId}
            onTileLayerIdChange={setTileLayerId}
            onProceed={() => setStep("details")}
            onBack={() => setStep("assign")}
          />
        )}
        {step === "details" && resort && (
          <DetailStep
            resort={resort}
            lifts={lifts}
            setLifts={setLifts}
            details={details}
            googleMapsApiKey={googleMapsApiKey}
            savedAt={savedAt}
            selectedLiftId={selectedLiftId}
            onSelectLift={setSelectedLiftId}
            tileLayerId={tileLayerId}
            onTileLayerIdChange={setTileLayerId}
            onProceed={() => setStep("confirm")}
            onBack={() => setStep("geometry")}
          />
        )}
        {step === "confirm" && resort && (
          <ConfirmStep
            resort={resort}
            resorts={effectiveResorts}
            lifts={lifts}
            fileHash={fileHash}
            onBack={() => setStep("details")}
            onSaved={handleSaved}
          />
        )}
      </Box>
    </Flex>
  );
}
