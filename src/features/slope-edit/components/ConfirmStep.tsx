"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { saveSlopeEdits } from "../actions";
import { COURSE_DETAIL_LABELS } from "../constants";
import type {
  EditorCourse,
  ResortOption,
  SlopeBeforeFeature,
  SlopeDetailEntry,
} from "../types";
import { courseToSavePayload } from "../utils/exportFiles";
import { validateCourses } from "../utils/validation";

type ConfirmStepProps = {
  resort: ResortOption;
  courses: EditorCourse[];
  fileHash: string | null;
  detailFileHash: string | null;
  preservedFeatures: SlopeBeforeFeature[];
  preservedDetails: SlopeDetailEntry[];
  onBack: () => void;
  onSaved: (writtenFiles: string[]) => void;
};

const displayValue = (value: string): string =>
  value.trim() === "" ? "（未入力）" : value;

export function ConfirmStep({
  resort,
  courses,
  fileHash,
  detailFileHash,
  preservedFeatures,
  preservedDetails,
  onBack,
  onSaved,
}: ConfirmStepProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const validation = useMemo(() => validateCourses(courses, true), [courses]);

  const handleSave = async () => {
    if (validation.errors.length > 0 || isSaving) return;
    if (
      !window.confirm(
        "編集結果で slope_before を書き換えます。よろしいですか？",
      )
    ) {
      return;
    }

    setIsSaving(true);
    setServerErrors([]);
    try {
      const result = await saveSlopeEdits({
        resortId: resort.id,
        fileHash,
        detailFileHash,
        courses: courses.map(course => courseToSavePayload(resort.id, course)),
        preservedFeatures,
        preservedDetails,
      });
      if (result.ok) {
        onSaved(result.writtenFiles);
      } else {
        setServerErrors(result.errors);
      }
    } catch (error) {
      setServerErrors([
        `保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Flex h="100%" minH={0} justify="center" overflowY="auto" bg="gray.50">
      <Flex direction="column" w="900px" maxW="100%" p={6} gap={4}>
        <Flex justify="space-between" align="center">
          <Box>
            <Heading size="md">保存内容の確認</Heading>
            <Text fontSize="sm" color="gray.600">
              {resort.nameJa}（{resort.id}） / 全 {courses.length} コース
            </Text>
          </Box>
          <Button size="sm" variant="outline" onClick={onBack}>
            分割・詳細編集へ戻る
          </Button>
        </Flex>

        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
          <Heading size="sm" mb={1}>
            保存後のコース順（{courses.length} 件）
          </Heading>
          <Text fontSize="xs" color="gray.500" mb={3}>
            この順番で slope_before の features に保存されます。
          </Text>
          <Flex direction="column" gap={3}>
            {courses.map((course, index) => (
              <Box
                key={course.id}
                borderTopWidth={index === 0 ? "0" : "1px"}
                borderColor="gray.100"
                pt={index === 0 ? 0 : 3}
              >
                <Text fontSize="sm" fontWeight="bold">
                  {index + 1}. {displayValue(course.name)}（
                  {course.coordinates.length} 点）
                </Text>
                <Flex wrap="wrap" columnGap={4} rowGap={1} mt={1}>
                  {(
                    Object.keys(COURSE_DETAIL_LABELS) as Array<
                      keyof typeof COURSE_DETAIL_LABELS
                    >
                  ).map(key => (
                    <Text key={key} fontSize="xs" color="gray.700">
                      {COURSE_DETAIL_LABELS[key]}:{" "}
                      {displayValue(course.detail[key])}
                    </Text>
                  ))}
                </Flex>
              </Box>
            ))}
          </Flex>
        </Box>

        {preservedFeatures.length > 0 && (
          <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
            <Heading size="sm" mb={1}>
              編集対象外の feature（{preservedFeatures.length} 件）
            </Heading>
            <Text fontSize="xs" color="gray.600">
              LineString 以外、または座標を編集できない feature は内容を変えずに
              slope_before の末尾へ保持します。
            </Text>
          </Box>
        )}

        {preservedDetails.length > 0 && (
          <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
            <Heading size="sm" mb={1}>
              コース線と未対応の slope_detail（{preservedDetails.length} 件）
            </Heading>
            <Text fontSize="xs" color="gray.600">
              コース線と名前が一致しない既存の詳細情報は読み込みません。
              slope_detail ファイル自体は変更しません。
            </Text>
          </Box>
        )}

        {validation.errors.length > 0 && (
          <Box
            borderWidth="1px"
            borderColor="red.300"
            borderRadius="md"
            p={3}
            bg="red.50"
          >
            <Text fontSize="sm" fontWeight="bold" color="red.700" mb={1}>
              エラーがあるため保存できません
            </Text>
            {validation.errors.map(error => (
              <Text key={error} fontSize="xs" color="red.600">
                ・{error}
              </Text>
            ))}
          </Box>
        )}

        {validation.warnings.length > 0 && (
          <Box
            borderWidth="1px"
            borderColor="orange.300"
            borderRadius="md"
            p={3}
            bg="orange.50"
          >
            <Text fontSize="sm" fontWeight="bold" color="orange.700" mb={1}>
              警告
            </Text>
            {validation.warnings.map(warning => (
              <Text key={warning} fontSize="xs" color="orange.700">
                ・{warning}
              </Text>
            ))}
          </Box>
        )}

        {serverErrors.length > 0 && (
          <Box
            borderWidth="1px"
            borderColor="red.300"
            borderRadius="md"
            p={3}
            bg="red.50"
          >
            <Text fontSize="sm" fontWeight="bold" color="red.700" mb={1}>
              保存時にエラーが発生しました
            </Text>
            {serverErrors.map(error => (
              <Text key={error} fontSize="xs" color="red.600">
                ・{error}
              </Text>
            ))}
          </Box>
        )}

        <Flex gap={3} pb={6}>
          <Button
            colorPalette="blue"
            disabled={validation.errors.length > 0 || isSaving}
            onClick={handleSave}
          >
            {isSaving ? "保存中…" : "保存（slope_before を書き換える）"}
          </Button>
          <Button variant="outline" onClick={onBack} disabled={isSaving}>
            戻る
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}
