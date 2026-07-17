"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import type { ValidationResult } from "@/features/slope-edit/types";
import { saveLiftEdits } from "../actions";
import type { EditorLift, ResortOption } from "../types";
import { collectLiftChanges, hasAnyChange } from "../utils/diff";
import { liftDisplayName } from "../utils/liftOps";
import { liftToSavePayload } from "../utils/savePayload";
import { validateLifts } from "../utils/validation";

type ConfirmStepProps = {
  resort: ResortOption;
  resorts: ResortOption[];
  lifts: EditorLift[];
  fileHash: string | null;
  onBack: () => void;
  // 保存成功後に呼ばれる（下書き破棄・選択画面へ戻る）
  onSaved: (writtenFiles: string[]) => void;
};

const ChangeValue = ({ before, after }: { before: string; after: string }) => (
  <Text as="span">
    <Text as="span" color="gray.500" textDecoration="line-through">
      {before === "" ? "（空欄）" : before}
    </Text>
    {" → "}
    <Text as="span" fontWeight="bold">
      {after === "" ? "（空欄）" : after}
    </Text>
  </Text>
);

export function ConfirmStep({
  resort,
  resorts,
  lifts,
  fileHash,
  onBack,
  onSaved,
}: ConfirmStepProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  const resortById = useMemo(
    () => new Map(resorts.map(option => [option.id, option])),
    [resorts],
  );

  const validation: ValidationResult = useMemo(
    () => validateLifts(lifts, new Set(resorts.map(option => option.id))),
    [lifts, resorts],
  );

  const allChanges = useMemo(
    () => lifts.map(collectLiftChanges).filter(hasAnyChange),
    [lifts],
  );

  const resortLabel = (skiId: string): string =>
    `${skiId}（${resortById.get(skiId)?.nameJa ?? "不明"}）`;

  const handleSave = async () => {
    if (validation.errors.length > 0 || isSaving) return;
    if (
      !window.confirm(`編集結果で lift_before を書き換えます。よろしいですか？`)
    ) {
      return;
    }
    setIsSaving(true);
    setServerErrors([]);
    try {
      const result = await saveLiftEdits({
        resortId: resort.id,
        fileHash,
        lifts: lifts.map(liftToSavePayload),
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

  const skiIdChanges = allChanges.filter(change => change.skiIdChange);
  const geometryChanges = allChanges.filter(change => change.geometryChange);
  const fieldChanges = allChanges.filter(
    change => change.fieldChanges.length > 0,
  );
  const mergedChanges = allChanges.filter(
    change => change.mergedFields.length > 0,
  );

  return (
    <Flex h="100%" minH={0} justify="center" overflowY="auto" bg="gray.50">
      <Flex direction="column" w="820px" maxW="100%" p={6} gap={4}>
        <Flex justify="space-between" align="center">
          <Box>
            <Heading size="md">変更内容の確認</Heading>
            <Text fontSize="sm" color="gray.600">
              {resort.nameJa}（{resort.id}）/ 全 {lifts.length} リフト
            </Text>
          </Box>
          <Button size="sm" variant="outline" onClick={onBack}>
            詳細編集へ戻る
          </Button>
        </Flex>

        {allChanges.length === 0 && (
          <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
            <Text fontSize="sm" color="gray.600">
              変更はありません。このまま保存すると、lift_detail
              から自動結合された情報も含めて現在の内容で lift_before
              を書き換えます。
            </Text>
          </Box>
        )}

        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
          <Heading size="sm" mb={2}>
            スキー場IDの変更（{skiIdChanges.length} 件）
          </Heading>
          {skiIdChanges.length === 0 ? (
            <Text fontSize="sm" color="gray.500">
              なし
            </Text>
          ) : (
            skiIdChanges.map(change => (
              <Text key={change.lift.id} fontSize="sm" mb={1}>
                ・{liftDisplayName(change.lift)}:{" "}
                {change.skiIdChange && (
                  <ChangeValue
                    before={resortLabel(change.skiIdChange.before)}
                    after={resortLabel(change.skiIdChange.after)}
                  />
                )}
                （保存時に移動先の lift_before へ追記されます）
              </Text>
            ))
          )}
        </Box>

        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
          <Heading size="sm" mb={2}>
            位置情報の変更（{geometryChanges.length} 件）
          </Heading>
          {geometryChanges.length === 0 ? (
            <Text fontSize="sm" color="gray.500">
              なし
            </Text>
          ) : (
            geometryChanges.map(change => (
              <Text key={change.lift.id} fontSize="sm" mb={1}>
                ・{liftDisplayName(change.lift)}: {change.geometryChange}
              </Text>
            ))
          )}
        </Box>

        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
          <Heading size="sm" mb={2}>
            詳細情報の追加・変更（{fieldChanges.length} 件）
          </Heading>
          {fieldChanges.length === 0 ? (
            <Text fontSize="sm" color="gray.500">
              なし
            </Text>
          ) : (
            fieldChanges.map(change => (
              <Box key={change.lift.id} mb={2}>
                <Text fontSize="sm" fontWeight="bold">
                  ・{liftDisplayName(change.lift)}
                </Text>
                {change.fieldChanges.map(field => (
                  <Text key={field.key} fontSize="sm" pl={4}>
                    {field.label}:{" "}
                    <ChangeValue before={field.before} after={field.after} />
                  </Text>
                ))}
              </Box>
            ))
          )}
        </Box>

        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
          <Heading size="sm" mb={2}>
            lift_detail から結合された情報（{mergedChanges.length} 件）
          </Heading>
          {mergedChanges.length === 0 ? (
            <Text fontSize="sm" color="gray.500">
              なし
            </Text>
          ) : (
            mergedChanges.map(change => (
              <Box key={change.lift.id} mb={2}>
                <Text fontSize="sm" fontWeight="bold">
                  ・{liftDisplayName(change.lift)} ← lift_detail「
                  {change.lift.detailMatch?.detailName}」（
                  {change.lift.detailMatch?.method === "name"
                    ? "名前一致で自動結合"
                    : "手動で結合"}
                  ）
                </Text>
                {change.mergedFields.map(field => (
                  <Text key={field.key} fontSize="sm" pl={4}>
                    {field.label}:{" "}
                    {field.after === "" ? "（空欄）" : field.after}
                    {field.before !== "" && field.before !== field.after && (
                      <Text as="span" color="gray.500">
                        （元の値: {field.before}）
                      </Text>
                    )}
                  </Text>
                ))}
              </Box>
            ))
          )}
        </Box>

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
              保存時にエラーが発生しました（ファイルは変更されていません）
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
            {isSaving ? "保存中…" : "保存（lift_before を書き換える）"}
          </Button>
          <Button variant="outline" onClick={onBack} disabled={isSaving}>
            戻る
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}
