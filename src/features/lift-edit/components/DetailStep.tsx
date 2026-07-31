"use client";

import { Box, Button, Flex, Heading, Input, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { updateDefaultSearchWord } from "@/shared/utils/searchWord";
import {
  BUSINESS_HOURS_MARK_OPTIONS,
  DETAIL_LABELS,
  MAKER_OPTIONS,
  MARK_OPTIONS,
  REQUIRED_DETAIL_KEYS,
  SPEED_OPTIONS,
  TYPE_OPTIONS,
} from "../constants";
import type {
  EditorLift,
  LiftDetail,
  LiftDetailEntry,
  ResortOption,
} from "../types";
import { mergeDetailEntry, unmergeDetailEntry } from "../utils/detailMerge";
import { liftDisplayName } from "../utils/liftOps";

type DetailStepProps = {
  resort: ResortOption;
  resorts: ResortOption[];
  lifts: EditorLift[];
  setLifts: (updater: (lifts: EditorLift[]) => EditorLift[]) => void;
  details: LiftDetailEntry[];
  savedAt: string | null;
  selectedLiftId: string | null;
  onSelectLift: (liftId: string | null) => void;
  onProceed: () => void;
  onBack: () => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: "6px",
  border: "1px solid #cbd5e0",
  fontSize: "14px",
  background: "#fff",
};

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="xs" fontWeight="bold" color="gray.600" mb="2px">
    {children}
  </Text>
);

const MarkSelect = ({
  value,
  onChange,
  options = MARK_OPTIONS,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: readonly string[];
}) => (
  <select
    style={selectStyle}
    value={value}
    onChange={event => onChange(event.target.value)}
  >
    {options.map(option => (
      <option key={option || "empty"} value={option}>
        {option === ""
          ? "未設定"
          : option === "○"
            ? "○（あり）"
            : option === "×"
              ? "×（なし）"
              : "?（不明）"}
      </option>
    ))}
    {value !== "" && !options.includes(value) && (
      <option value={value}>{value}</option>
    )}
  </select>
);

export function DetailStep({
  resort,
  resorts,
  lifts,
  setLifts,
  details,
  savedAt,
  selectedLiftId,
  onSelectLift,
  onProceed,
  onBack,
}: DetailStepProps) {
  const [manualEntryIndex, setManualEntryIndex] = useState<string>("");
  const [showProceedWarning, setShowProceedWarning] = useState(false);
  const [draggedLiftId, setDraggedLiftId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    liftId: string;
    position: "before" | "after";
  } | null>(null);

  const selectedLift = lifts.find(lift => lift.id === selectedLiftId) ?? null;
  const resortSearchNameById = useMemo(
    () => new Map(resorts.map(option => [option.id, option.searchName])),
    [resorts],
  );

  const incompleteLifts = useMemo(
    () =>
      lifts
        .map((lift, index) => ({
          lift,
          index,
          emptyKeys: REQUIRED_DETAIL_KEYS.filter(
            key => lift.detail[key].trim() === "",
          ),
        }))
        .filter(item => item.emptyKeys.length > 0),
    [lifts],
  );

  // すでにどこかのリフトへ結合済みの lift_detail エントリは候補から外す
  const availableEntries = useMemo(() => {
    const consumed = new Set(
      lifts
        .map(lift => lift.detailMatch?.entryIndex)
        .filter((index): index is number => index !== undefined),
    );
    return details
      .map((entry, index) => ({ entry, index }))
      .filter(item => !consumed.has(item.index));
  }, [details, lifts]);

  const updateSelectedLift = (
    updater: (lift: EditorLift) => EditorLift,
  ): void => {
    if (!selectedLiftId) return;
    setLifts(previous =>
      previous.map(lift => (lift.id === selectedLiftId ? updater(lift) : lift)),
    );
  };

  const updateDetail = (patch: Partial<LiftDetail>) => {
    updateSelectedLift(lift => ({
      ...lift,
      detail: { ...lift.detail, ...patch },
    }));
  };

  const handleManualMerge = () => {
    const index = Number(manualEntryIndex);
    const item = availableEntries.find(candidate => candidate.index === index);
    if (!item || !selectedLift) return;
    updateSelectedLift(lift =>
      mergeDetailEntry(lift, item.entry, item.index, "manual"),
    );
    setManualEntryIndex("");
  };

  const handleUnmerge = () => {
    if (!selectedLift?.detailMatch) return;
    if (
      !window.confirm(
        "lift_detail との結合を解除し、詳細情報を読み込み時点の内容へ戻します。よろしいですか？",
      )
    ) {
      return;
    }
    updateSelectedLift(unmergeDetailEntry);
  };

  const reorderLift = (
    sourceLiftId: string,
    targetLiftId: string,
    position: "before" | "after",
  ): void => {
    if (sourceLiftId === targetLiftId) return;
    setLifts(previous => {
      const sourceIndex = previous.findIndex(lift => lift.id === sourceLiftId);
      if (sourceIndex < 0) return previous;

      const reordered = [...previous];
      const [draggedLift] = reordered.splice(sourceIndex, 1);
      const targetIndex = reordered.findIndex(lift => lift.id === targetLiftId);
      if (targetIndex < 0) return previous;

      const insertionIndex =
        position === "after" ? targetIndex + 1 : targetIndex;
      reordered.splice(insertionIndex, 0, draggedLift);
      return reordered;
    });
  };

  const clearDragState = (): void => {
    setDraggedLiftId(null);
    setDropTarget(null);
  };

  const handleProceed = (): void => {
    if (incompleteLifts.length === 0) {
      onProceed();
      return;
    }
    setShowProceedWarning(true);
    onSelectLift(incompleteLifts[0].lift.id);
  };

  return (
    <Flex
      direction="column"
      h="100%"
      minH={0}
      w="480px"
      minW="480px"
      borderRightWidth="1px"
      borderColor="gray.200"
      p={4}
      gap={3}
      overflowY="auto"
    >
      <Flex justify="space-between" align="center">
        <Box>
          <Heading size="md" fontFamily={resort.nameJa ? undefined : "mono"}>
            {resort.nameJa || resort.id}
          </Heading>
          <Text fontSize="xs" color="gray.500">
            {savedAt
              ? `最終保存: ${formatDateTime(savedAt)}（下書き自動保存）`
              : "未保存"}
          </Text>
        </Box>
        <Button size="xs" variant="outline" onClick={onBack}>
          位置補正へ戻る
        </Button>
      </Flex>

      <Box
        borderWidth="1px"
        borderRadius="md"
        maxH="180px"
        minH="80px"
        flexShrink={0}
        overflowY="auto"
      >
        {lifts.map((lift, index) => (
          <Flex
            key={lift.id}
            px={3}
            py={2}
            gap={2}
            align="center"
            cursor="grab"
            borderBottomWidth="1px"
            borderColor="gray.100"
            bg={lift.id === selectedLiftId ? "blue.50" : undefined}
            opacity={lift.id === draggedLiftId ? 0.45 : 1}
            boxShadow={
              dropTarget?.liftId === lift.id
                ? dropTarget.position === "before"
                  ? "inset 0 3px 0 var(--chakra-colors-blue-500)"
                  : "inset 0 -3px 0 var(--chakra-colors-blue-500)"
                : undefined
            }
            _hover={{ bg: "gray.50" }}
            _active={{ cursor: "grabbing" }}
            draggable
            onDragStart={event => {
              setDraggedLiftId(lift.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", lift.id);
            }}
            onDragOver={event => {
              if (draggedLiftId === null || draggedLiftId === lift.id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              const bounds = event.currentTarget.getBoundingClientRect();
              const position =
                event.clientY < bounds.top + bounds.height / 2
                  ? "before"
                  : "after";
              setDropTarget({ liftId: lift.id, position });
            }}
            onDrop={event => {
              event.preventDefault();
              const sourceLiftId =
                draggedLiftId || event.dataTransfer.getData("text/plain");
              const bounds = event.currentTarget.getBoundingClientRect();
              const position =
                event.clientY < bounds.top + bounds.height / 2
                  ? "before"
                  : "after";
              reorderLift(sourceLiftId, lift.id, position);
              clearDragState();
            }}
            onDragEnd={clearDragState}
            onClick={() => onSelectLift(lift.id)}
          >
            <Text
              aria-hidden="true"
              color="gray.400"
              fontSize="lg"
              lineHeight="1"
              userSelect="none"
            >
              ⠿
            </Text>
            <Text fontSize="sm" flex="1" truncate>
              {index + 1}. {liftDisplayName(lift, index)}
            </Text>
            {lift.detailMatch && (
              <Text
                fontSize="xs"
                color="green.700"
                bg="green.50"
                px={2}
                borderRadius="sm"
                whiteSpace="nowrap"
              >
                {lift.detailMatch.method === "name"
                  ? "詳細結合（名前一致）"
                  : "詳細結合（手動）"}
              </Text>
            )}
          </Flex>
        ))}
      </Box>
      <Text fontSize="xs" color="gray.500" mt={-2}>
        リフトをドラッグして並び替えられます。変更した順番が、保存後の GeoJSON
        のリフト順になります。
      </Text>

      {selectedLift ? (
        <>
          <Box
            borderWidth="1px"
            borderColor={selectedLift.detailMatch ? "green.200" : "gray.200"}
            bg={selectedLift.detailMatch ? "green.50" : "gray.50"}
            borderRadius="md"
            p={2}
            flexShrink={0}
            fontSize="xs"
            color="gray.700"
          >
            {selectedLift.detailMatch ? (
              <>
                <Text fontWeight="bold" color="green.700">
                  lift_detail「{selectedLift.detailMatch.detailName}」を
                  {selectedLift.detailMatch.method === "name"
                    ? "名前一致で自動結合済み"
                    : "手動で結合済み"}
                </Text>
                <Text mt={1}>
                  取り込んだ項目:{" "}
                  {Object.keys(selectedLift.detailMatch.mergedFields)
                    .map(key => DETAIL_LABELS[key as keyof LiftDetail] ?? key)
                    .join(", ") || "なし"}
                </Text>
                <Button
                  mt={2}
                  size="xs"
                  variant="outline"
                  colorPalette="red"
                  onClick={handleUnmerge}
                >
                  結合を解除
                </Button>
              </>
            ) : (
              <>
                <Text fontWeight="bold">
                  lift_detail は未結合です
                  {availableEntries.length > 0 &&
                    "（名前が一致しないため自動結合していません。必要なら手動で選択してください）"}
                </Text>
                {availableEntries.length > 0 ? (
                  <Flex mt={2} gap={2}>
                    <select
                      style={{ ...selectStyle, fontSize: "12px" }}
                      value={manualEntryIndex}
                      onChange={event =>
                        setManualEntryIndex(event.target.value)
                      }
                    >
                      <option value="">結合するエントリを選択…</option>
                      {availableEntries.map(item => (
                        <option key={item.index} value={item.index}>
                          {typeof item.entry.name === "string" &&
                          item.entry.name !== ""
                            ? item.entry.name
                            : `（名前なし: ${item.index + 1} 番目）`}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="xs"
                      colorPalette="green"
                      disabled={manualEntryIndex === ""}
                      onClick={handleManualMerge}
                    >
                      結合
                    </Button>
                  </Flex>
                ) : (
                  <Text mt={1}>
                    結合できる lift_detail エントリはありません。
                  </Text>
                )}
              </>
            )}
          </Box>

          <Box borderWidth="1px" borderRadius="md" p={3} flexShrink={0}>
            <Flex direction="column" gap={2}>
              <Box>
                <FieldLabel>リフト名</FieldLabel>
                <Input
                  size="sm"
                  value={selectedLift.name}
                  onChange={event =>
                    updateSelectedLift(lift => {
                      const nextName = event.target.value;
                      return {
                        ...lift,
                        name: nextName,
                        detail: {
                          ...lift.detail,
                          searchWord: updateDefaultSearchWord(
                            lift.detail.searchWord,
                            resortSearchNameById.get(lift.skiId) ?? lift.skiId,
                            lift.name,
                            nextName,
                          ),
                        },
                      };
                    })
                  }
                />
              </Box>

              <Flex gap={2}>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.type}</FieldLabel>
                  <select
                    style={selectStyle}
                    value={selectedLift.detail.type}
                    onChange={event =>
                      updateDetail({ type: event.target.value })
                    }
                  >
                    {TYPE_OPTIONS.map(option => (
                      <option key={option || "empty"} value={option}>
                        {option === "" ? "未設定" : option}
                      </option>
                    ))}
                    {selectedLift.detail.type !== "" &&
                      !TYPE_OPTIONS.includes(
                        selectedLift.detail.type as never,
                      ) && (
                        <option value={selectedLift.detail.type}>
                          {selectedLift.detail.type}
                        </option>
                      )}
                  </select>
                </Box>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.speed}</FieldLabel>
                  <select
                    style={selectStyle}
                    value={selectedLift.detail.speed}
                    onChange={event =>
                      updateDetail({ speed: event.target.value })
                    }
                  >
                    {SPEED_OPTIONS.map(option => (
                      <option key={option || "empty"} value={option}>
                        {option === "" ? "未設定" : option}
                      </option>
                    ))}
                  </select>
                </Box>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.capacity}</FieldLabel>
                  <Input
                    size="sm"
                    type="number"
                    value={selectedLift.detail.capacity}
                    onChange={event =>
                      updateDetail({ capacity: event.target.value })
                    }
                  />
                </Box>
              </Flex>

              <Flex gap={2}>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.distance}</FieldLabel>
                  <Input
                    size="sm"
                    type="number"
                    value={selectedLift.detail.distance}
                    onChange={event =>
                      updateDetail({ distance: event.target.value })
                    }
                  />
                </Box>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.vertical}</FieldLabel>
                  <Input
                    size="sm"
                    type="number"
                    value={selectedLift.detail.vertical}
                    onChange={event =>
                      updateDetail({ vertical: event.target.value })
                    }
                  />
                </Box>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.towers}</FieldLabel>
                  <Input
                    size="sm"
                    type="number"
                    value={selectedLift.detail.towers}
                    onChange={event =>
                      updateDetail({ towers: event.target.value })
                    }
                  />
                </Box>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.year}</FieldLabel>
                  <Input
                    size="sm"
                    value={selectedLift.detail.year}
                    onChange={event =>
                      updateDetail({ year: event.target.value })
                    }
                  />
                </Box>
              </Flex>

              <Flex gap={2}>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.top}</FieldLabel>
                  <Input
                    size="sm"
                    value={selectedLift.detail.top}
                    onChange={event =>
                      updateDetail({ top: event.target.value })
                    }
                  />
                </Box>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.bottom}</FieldLabel>
                  <Input
                    size="sm"
                    value={selectedLift.detail.bottom}
                    onChange={event =>
                      updateDetail({ bottom: event.target.value })
                    }
                  />
                </Box>
              </Flex>

              <Flex gap={2}>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.hood}</FieldLabel>
                  <MarkSelect
                    value={selectedLift.detail.hood}
                    onChange={value => updateDetail({ hood: value })}
                  />
                </Box>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.footrest}</FieldLabel>
                  <MarkSelect
                    value={selectedLift.detail.footrest}
                    onChange={value => updateDetail({ footrest: value })}
                  />
                </Box>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.oilShield}</FieldLabel>
                  <MarkSelect
                    value={selectedLift.detail.oilShield}
                    onChange={value => updateDetail({ oilShield: value })}
                  />
                </Box>
              </Flex>

              <Flex gap={2}>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.morning}</FieldLabel>
                  <MarkSelect
                    value={selectedLift.detail.morning}
                    onChange={value => updateDetail({ morning: value })}
                    options={BUSINESS_HOURS_MARK_OPTIONS}
                  />
                </Box>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.night}</FieldLabel>
                  <MarkSelect
                    value={selectedLift.detail.night}
                    onChange={value => updateDetail({ night: value })}
                    options={BUSINESS_HOURS_MARK_OPTIONS}
                  />
                </Box>
                <Box flex="1">
                  <FieldLabel>{DETAIL_LABELS.maker}</FieldLabel>
                  <select
                    style={selectStyle}
                    value={selectedLift.detail.maker}
                    onChange={event =>
                      updateDetail({ maker: event.target.value })
                    }
                  >
                    {MAKER_OPTIONS.map(option => (
                      <option key={option || "empty"} value={option}>
                        {option === "" ? "未設定" : option}
                      </option>
                    ))}
                    {selectedLift.detail.maker !== "" &&
                      !MAKER_OPTIONS.includes(
                        selectedLift.detail.maker as never,
                      ) && (
                        <option value={selectedLift.detail.maker}>
                          {selectedLift.detail.maker}
                        </option>
                      )}
                  </select>
                </Box>
              </Flex>

              <Box>
                <FieldLabel>{DETAIL_LABELS.searchWord}</FieldLabel>
                <Input
                  size="sm"
                  value={selectedLift.detail.searchWord}
                  onChange={event =>
                    updateDetail({ searchWord: event.target.value })
                  }
                />
              </Box>
              <Box>
                <FieldLabel>{DETAIL_LABELS.link}</FieldLabel>
                <Input
                  size="sm"
                  value={selectedLift.detail.link}
                  onChange={event => updateDetail({ link: event.target.value })}
                />
              </Box>
              <Box>
                <FieldLabel>{DETAIL_LABELS.note}</FieldLabel>
                <Input
                  size="sm"
                  value={selectedLift.detail.note}
                  onChange={event => updateDetail({ note: event.target.value })}
                />
              </Box>
            </Flex>
          </Box>
        </>
      ) : (
        <Text fontSize="sm" color="gray.500">
          上の一覧からリフトを選ぶと詳細を編集できます。
        </Text>
      )}

      {showProceedWarning && incompleteLifts.length > 0 && (
        <Box
          borderWidth="1px"
          borderColor="orange.300"
          borderRadius="md"
          p={3}
          bg="orange.50"
          flexShrink={0}
        >
          <Text fontSize="sm" fontWeight="bold" color="orange.800">
            未入力の詳細情報があります
          </Text>
          <Text fontSize="xs" color="orange.700" mt={1}>
            次の項目を修正するか、未入力のまま次へ進んでください。
          </Text>
          <Flex direction="column" gap={1} mt={2} maxH="140px" overflowY="auto">
            {incompleteLifts.map(({ lift, index, emptyKeys }) => (
              <Button
                key={lift.id}
                size="xs"
                variant="ghost"
                justifyContent="flex-start"
                colorPalette="orange"
                onClick={() => onSelectLift(lift.id)}
              >
                {index + 1}. {liftDisplayName(lift, index)}:{" "}
                {emptyKeys.map(key => DETAIL_LABELS[key]).join("、")}
              </Button>
            ))}
          </Flex>
          <Flex gap={2} mt={3}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowProceedWarning(false);
                onSelectLift(incompleteLifts[0].lift.id);
              }}
            >
              入力を修正する
            </Button>
            <Button size="sm" colorPalette="orange" onClick={onProceed}>
              未入力のまま進む
            </Button>
          </Flex>
        </Box>
      )}

      {(!showProceedWarning || incompleteLifts.length === 0) && (
        <Button colorPalette="blue" flexShrink={0} onClick={handleProceed}>
          次へ（全体情報リンク）
        </Button>
      )}
    </Flex>
  );
}
