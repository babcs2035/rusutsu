"use client";

import { Box, Button, Flex, Heading, Input, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { EditorMap } from "@/features/slope-edit/components/EditorMap";
import type { TileLayerId } from "@/features/slope-edit/types";
import {
  AERIALWAY_OPTIONS,
  DETAIL_LABELS,
  MARK_OPTIONS,
  RESORT_INITIAL_ZOOM,
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
  lifts: EditorLift[];
  setLifts: (updater: (lifts: EditorLift[]) => EditorLift[]) => void;
  details: LiftDetailEntry[];
  googleMapsApiKey: string | null;
  savedAt: string | null;
  selectedLiftId: string | null;
  onSelectLift: (liftId: string | null) => void;
  tileLayerId: TileLayerId;
  onTileLayerIdChange: (layerId: TileLayerId) => void;
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
}: {
  value: string;
  onChange: (value: string) => void;
}) => (
  <select
    style={selectStyle}
    value={value}
    onChange={event => onChange(event.target.value)}
  >
    {MARK_OPTIONS.map(option => (
      <option key={option || "empty"} value={option}>
        {option === "" ? "未設定" : option === "○" ? "○（あり）" : "×（なし）"}
      </option>
    ))}
    {value !== "" && !MARK_OPTIONS.includes(value as never) && (
      <option value={value}>{value}</option>
    )}
  </select>
);

export function DetailStep({
  resort,
  lifts,
  setLifts,
  details,
  googleMapsApiKey,
  savedAt,
  selectedLiftId,
  onSelectLift,
  tileLayerId,
  onTileLayerIdChange,
  onProceed,
  onBack,
}: DetailStepProps) {
  const [manualEntryIndex, setManualEntryIndex] = useState<string>("");

  const selectedLift = lifts.find(lift => lift.id === selectedLiftId) ?? null;

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

  const aerialwayOptions: string[] =
    selectedLift &&
    selectedLift.aerialway !== "" &&
    !AERIALWAY_OPTIONS.includes(selectedLift.aerialway as never)
      ? [...AERIALWAY_OPTIONS, selectedLift.aerialway]
      : [...AERIALWAY_OPTIONS];

  return (
    <Flex h="100%" minH={0}>
      <Flex
        direction="column"
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
            <Heading size="md">{resort.nameJa}</Heading>
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
              cursor="pointer"
              borderBottomWidth="1px"
              borderColor="gray.100"
              bg={lift.id === selectedLiftId ? "blue.50" : undefined}
              _hover={{ bg: "gray.50" }}
              onClick={() => onSelectLift(lift.id)}
            >
              <Text fontSize="sm" flex="1" truncate>
                {liftDisplayName(lift, index)}
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
                <Flex gap={2}>
                  <Box flex="2">
                    <FieldLabel>リフト名</FieldLabel>
                    <Input
                      size="sm"
                      value={selectedLift.name}
                      onChange={event =>
                        updateSelectedLift(lift => ({
                          ...lift,
                          name: event.target.value,
                        }))
                      }
                    />
                  </Box>
                  <Box flex="1">
                    <FieldLabel>aerialway</FieldLabel>
                    <select
                      style={selectStyle}
                      value={selectedLift.aerialway}
                      onChange={event =>
                        updateSelectedLift(lift => ({
                          ...lift,
                          aerialway: event.target.value,
                        }))
                      }
                    >
                      {aerialwayOptions.map(option => (
                        <option key={option || "empty"} value={option}>
                          {option === "" ? "未設定" : option}
                        </option>
                      ))}
                    </select>
                  </Box>
                </Flex>

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
                    />
                  </Box>
                  <Box flex="1">
                    <FieldLabel>{DETAIL_LABELS.night}</FieldLabel>
                    <MarkSelect
                      value={selectedLift.detail.night}
                      onChange={value => updateDetail({ night: value })}
                    />
                  </Box>
                  <Box flex="1">
                    <FieldLabel>{DETAIL_LABELS.maker}</FieldLabel>
                    <Input
                      size="sm"
                      value={selectedLift.detail.maker}
                      onChange={event =>
                        updateDetail({ maker: event.target.value })
                      }
                    />
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
                  <FieldLabel>{DETAIL_LABELS.note}</FieldLabel>
                  <Input
                    size="sm"
                    value={selectedLift.detail.note}
                    onChange={event =>
                      updateDetail({ note: event.target.value })
                    }
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

        <Button colorPalette="blue" flexShrink={0} onClick={onProceed}>
          次へ（変更内容の確認・保存）
        </Button>
      </Flex>

      <Box flex="1" minW={0}>
        <EditorMap
          center={[resort.longitude, resort.latitude]}
          zoom={RESORT_INITIAL_ZOOM}
          courses={lifts}
          activeCourseId={selectedLiftId}
          mode="view"
          googleMapsApiKey={googleMapsApiKey}
          fitBoundsKey={1}
          layerId={tileLayerId}
          onLayerIdChange={onTileLayerIdChange}
          midstation={selectedLift?.midstation ?? null}
          onSelectCourse={onSelectLift}
        />
      </Box>
    </Flex>
  );
}
