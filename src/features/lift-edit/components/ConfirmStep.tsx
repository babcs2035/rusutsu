"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import type { ValidationResult } from "@/features/slope-edit/types";
import { saveLiftEdits, saveResortLinks } from "../actions";
import { RESORT_LINK_KEYS, RESORT_LINK_LABELS } from "../constants";
import type { EditorLift, ResortLinks, ResortOption } from "../types";
import { collectLiftChanges, hasAnyChange } from "../utils/diff";
import { liftDisplayName } from "../utils/liftOps";
import { validateResortLinks } from "../utils/linkValidation";
import { liftToSavePayload } from "../utils/savePayload";
import { validateLifts } from "../utils/validation";
import { LinkListField } from "./LinksStep";

type ConfirmStepProps = {
  resort: ResortOption;
  resorts: ResortOption[];
  lifts: EditorLift[];
  deletedLifts: EditorLift[];
  links: ResortLinks;
  setLinks: (links: ResortLinks) => void;
  fileHash: string | null;
  onBack: () => void;
  // 保存成功後に呼ばれる（下書き破棄・選択画面へ戻る）
  onSaved: (writtenFiles: string[]) => void;
  // 確認済みフラグの切り替え（lift_confirmed.json を更新する）
  onToggleConfirmed: (
    resort: ResortOption,
    confirmed: boolean,
  ) => Promise<void>;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
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
  deletedLifts,
  links,
  setLinks,
  fileHash,
  onBack,
  onSaved,
  onToggleConfirmed,
}: ConfirmStepProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [isTogglingConfirmed, setIsTogglingConfirmed] = useState(false);

  const handleToggleConfirmed = async () => {
    setIsTogglingConfirmed(true);
    try {
      await onToggleConfirmed(resort, resort.confirmedAt === null);
    } finally {
      setIsTogglingConfirmed(false);
    }
  };

  const resortById = useMemo(
    () => new Map(resorts.map(option => [option.id, option])),
    [resorts],
  );

  const validation: ValidationResult = useMemo(() => {
    const liftValidation = validateLifts(
      lifts,
      new Set(resorts.map(option => option.id)),
    );
    return {
      errors: liftValidation.errors,
      warnings: [
        ...liftValidation.warnings,
        ...validateResortLinks(resort.id, links, lifts),
      ],
    };
  }, [lifts, links, resort.id, resorts]);

  const allChanges = useMemo(
    () => lifts.map(collectLiftChanges).filter(hasAnyChange),
    [lifts],
  );

  const resortLabel = (skiId: string): string => {
    const nameJa = resortById.get(skiId)?.nameJa;
    return nameJa ? `${skiId}（${nameJa}）` : skiId;
  };

  const handleSave = async () => {
    if (validation.errors.length > 0 || isSaving) return;
    if (
      !window.confirm(
        deletedLifts.length > 0
          ? `編集結果で lift_before とスキー場全体リンクを書き換え、${deletedLifts.length} 件のリフトを削除します。よろしいですか？`
          : "編集結果で lift_before とスキー場全体リンクを書き換えます。よろしいですか？",
      )
    ) {
      return;
    }
    setIsSaving(true);
    setServerErrors([]);
    try {
      // 手順6でリンクを追加・修正した場合も、リフトと同じ保存操作で反映する。
      await saveResortLinks(resort.id, links);
      const result = await saveLiftEdits({
        resortId: resort.id,
        fileHash,
        lifts: lifts.map(liftToSavePayload),
      });
      if (result.ok) {
        onSaved([...result.writtenFiles, "SkiResortLinks.json"]);
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
              {resort.nameJa ? `${resort.nameJa}（${resort.id}）` : resort.id} /
              全 {lifts.length} リフト
            </Text>
            {resort.confirmedAt && (
              <Text fontSize="xs" color="green.700">
                ✓ 確認済み（{formatDateTime(resort.confirmedAt)}）
              </Text>
            )}
          </Box>
          <Flex gap={2}>
            <Button
              size="sm"
              variant="outline"
              colorPalette={resort.confirmedAt ? "orange" : "green"}
              disabled={isTogglingConfirmed}
              onClick={handleToggleConfirmed}
            >
              {resort.confirmedAt ? "確認済みを解除" : "✓ 確認済みにする"}
            </Button>
            <Button size="sm" variant="outline" onClick={onBack}>
              全体情報リンクへ戻る
            </Button>
          </Flex>
        </Flex>

        {allChanges.length === 0 && deletedLifts.length === 0 && (
          <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
            <Text fontSize="sm" color="gray.600">
              リフトの変更はありません。このまま保存すると、lift_detail
              から自動結合された情報も含めて現在の内容で lift_before
              を書き換えます。
            </Text>
          </Box>
        )}

        {deletedLifts.length > 0 && (
          <Box
            borderWidth="1px"
            borderColor="red.300"
            borderRadius="md"
            p={4}
            bg="red.50"
          >
            <Heading size="sm" mb={2} color="red.700">
              削除するリフト（{deletedLifts.length} 件）
            </Heading>
            <Text fontSize="xs" color="red.700" mb={2}>
              保存すると lift_before から削除されます。
            </Text>
            {deletedLifts.map(lift => (
              <Text key={lift.id} fontSize="sm">
                ・{liftDisplayName(lift)}
              </Text>
            ))}
          </Box>
        )}

        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
          <Heading size="sm" mb={1}>
            保存後のリフト順（{lifts.length} 件）
          </Heading>
          <Text fontSize="xs" color="gray.500" mb={2}>
            この順番で GeoJSON の features に保存されます。
          </Text>
          {lifts.map((lift, index) => (
            <Text key={lift.id} fontSize="sm">
              {index + 1}. {liftDisplayName(lift, index)}
            </Text>
          ))}
        </Box>

        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
          <Heading size="sm" mb={1}>
            スキー場全体のリンク
          </Heading>
          <Text fontSize="xs" color="gray.500" mb={4}>
            手順5で追加した内容を確認できます。この画面でも追加・修正できます。
          </Text>
          <Flex direction="column" gap={4}>
            {RESORT_LINK_KEYS.map(key => (
              <LinkListField
                key={key}
                label={RESORT_LINK_LABELS[key]}
                values={links[key] ?? []}
                onChange={values => setLinks({ ...links, [key]: values })}
              />
            ))}
          </Flex>
        </Box>

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
            {isSaving ? "保存中…" : "保存（リフト・リンクを書き換える）"}
          </Button>
          <Button variant="outline" onClick={onBack} disabled={isSaving}>
            戻る
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}
