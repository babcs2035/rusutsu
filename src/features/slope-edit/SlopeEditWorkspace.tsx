"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { loadSlopeSourceData } from "./actions";
import { DetailEditStep } from "./components/DetailEditStep";
import { LineEditStep } from "./components/LineEditStep";
import { ResortSelectStep } from "./components/ResortSelectStep";
import { TutorialOverlay } from "./components/TutorialOverlay";
import { TUTORIAL_SEEN_STORAGE_KEY } from "./constants";
import { loadDraft, useDraftStorage } from "./hooks/useDraftStorage";
import type {
  EditorCourse,
  EditStep,
  ResortOption,
  StartSource,
} from "./types";
import { assignUnnamedCourseNames } from "./utils/courseOps";
import { sourceDataToCourses } from "./utils/loadSource";

type SlopeEditWorkspaceProps = {
  resorts: ResortOption[];
  googleMapsApiKey: string | null;
};

const STEP_LABELS: Array<{ step: EditStep; label: string }> = [
  { step: "select", label: "1. スキー場選択" },
  { step: "lines", label: "2. コース線編集" },
  { step: "details", label: "3. 分割・詳細編集" },
];

export function SlopeEditWorkspace({
  resorts,
  googleMapsApiKey,
}: SlopeEditWorkspaceProps) {
  const [step, setStep] = useState<EditStep>("select");
  const [resort, setResort] = useState<ResortOption | null>(null);
  const [courses, setCoursesState] = useState<EditorCourse[]>([]);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const { savedAt, markExported } = useDraftStorage(
    resort?.id ?? null,
    courses,
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

  const handleStart = async (
    selected: ResortOption,
    source: StartSource,
  ): Promise<void> => {
    setLoadError(null);

    if (source !== "draft" && loadDraft(selected.id)) {
      const confirmed = window.confirm(
        "このスキー場には保存済みの下書きがあります。新しい編集を始めると、次の自動保存で下書きが上書きされます。続行しますか？",
      );
      if (!confirmed) return;
    }

    if (source === "draft") {
      const draft = loadDraft(selected.id);
      setResort(selected);
      setCoursesState(draft?.courses ?? []);
      setStep("lines");
      return;
    }

    if (source === "existing") {
      setIsLoadingSource(true);
      try {
        const data = await loadSlopeSourceData(selected.id);
        if (!data.geojson) {
          setLoadError(
            `${selected.id} の slope_before を読み込めませんでした。`,
          );
          return;
        }
        setResort(selected);
        setCoursesState(sourceDataToCourses(data));
        setStep("lines");
      } catch {
        setLoadError("既存データの読み込みに失敗しました。");
      } finally {
        setIsLoadingSource(false);
      }
      return;
    }

    setResort(selected);
    setCoursesState([]);
    setStep("lines");
  };

  const handleProceedToDetails = () => {
    setCoursesState(previous => assignUnnamedCourseNames(previous));
    setStep("details");
  };

  const handleBackToSelect = () => {
    // 編集内容はローカルキャッシュに自動保存済みなのでそのまま戻れる
    setStep("select");
    setResort(null);
    setCoursesState([]);
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
        <Heading size="sm">スキー場コース入力</Heading>
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
          <Text fontSize="sm" color="gray.600">
            対象: {resort.nameJa}
          </Text>
        )}
        <Box flex="1" />
        {loadError && (
          <Text fontSize="xs" color="red.500">
            {loadError}
          </Text>
        )}
        {isLoadingSource && (
          <Text fontSize="xs" color="gray.500">
            既存データを読み込み中…
          </Text>
        )}
        <Button
          size="xs"
          variant="outline"
          onClick={() => setShowTutorial(true)}
        >
          使い方
        </Button>
      </Flex>

      <Box flex="1" minH={0}>
        {step === "select" && (
          <ResortSelectStep resorts={resorts} onStart={handleStart} />
        )}
        {step === "lines" && resort && (
          <LineEditStep
            resort={resort}
            courses={courses}
            setCourses={setCourses}
            googleMapsApiKey={googleMapsApiKey}
            savedAt={savedAt}
            onProceed={handleProceedToDetails}
            onBackToSelect={handleBackToSelect}
          />
        )}
        {step === "details" && resort && (
          <DetailEditStep
            resort={resort}
            courses={courses}
            setCourses={setCourses}
            googleMapsApiKey={googleMapsApiKey}
            savedAt={savedAt}
            onBackToLines={() => setStep("lines")}
            onExported={markExported}
          />
        )}
      </Box>

      {showTutorial && <TutorialOverlay onClose={closeTutorial} />}
    </Flex>
  );
}
