"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { EditorMap } from "@/features/slope-edit/components/EditorMap";
import type { TileLayerId } from "@/features/slope-edit/types";
import { RESORT_INITIAL_ZOOM } from "../constants";
import type { EditorLift, ResortOption } from "../types";
import { distanceM, formatDistanceM, liftDisplayName } from "../utils/liftOps";

type AssignStepProps = {
  resort: ResortOption;
  resorts: ResortOption[];
  lifts: EditorLift[];
  setLifts: (updater: (lifts: EditorLift[]) => EditorLift[]) => void;
  googleMapsApiKey: string | null;
  savedAt: string | null;
  selectedLiftId: string | null;
  onSelectLift: (liftId: string | null) => void;
  tileLayerId: TileLayerId;
  onTileLayerIdChange: (layerId: TileLayerId) => void;
  onProceed: () => void;
  onBackToSelect: () => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  borderRadius: "6px",
  border: "1px solid #cbd5e0",
  fontSize: "13px",
  background: "#fff",
};

// 所属候補として距離の近い順に表示するスキー場数
const NEARBY_OPTION_COUNT = 20;

export function AssignStep({
  resort,
  resorts,
  lifts,
  setLifts,
  googleMapsApiKey,
  savedAt,
  selectedLiftId,
  onSelectLift,
  tileLayerId,
  onTileLayerIdChange,
  onProceed,
  onBackToSelect,
}: AssignStepProps) {
  const resortById = useMemo(
    () => new Map(resorts.map(option => [option.id, option])),
    [resorts],
  );

  // リフトごとに近いスキー場を候補として並べる（現在値・元の値は必ず含める）
  const optionsByLiftId = useMemo(() => {
    const map = new Map<
      string,
      Array<{ id: string; label: string; distance: number }>
    >();
    for (const lift of lifts) {
      const origin = lift.coordinates[0];
      if (!origin) {
        map.set(lift.id, []);
        continue;
      }
      const sorted = resorts
        .map(option => ({
          id: option.id,
          nameJa: option.nameJa,
          distance: distanceM(origin, [option.longitude, option.latitude]),
        }))
        .sort((a, b) => a.distance - b.distance);
      const nearby = sorted.slice(0, NEARBY_OPTION_COUNT);
      for (const requiredId of [lift.skiId, lift.original.skiId]) {
        if (!nearby.some(option => option.id === requiredId)) {
          const found = sorted.find(option => option.id === requiredId);
          if (found) nearby.push(found);
        }
      }
      map.set(
        lift.id,
        nearby.map(option => ({
          id: option.id,
          label: `${option.id}（${option.nameJa}, ${formatDistanceM(option.distance)}）`,
          distance: option.distance,
        })),
      );
    }
    return map;
  }, [lifts, resorts]);

  const changedCount = lifts.filter(
    lift => lift.skiId !== lift.original.skiId,
  ).length;

  const updateLiftSkiId = (liftId: string, skiId: string) => {
    setLifts(previous =>
      previous.map(lift => (lift.id === liftId ? { ...lift, skiId } : lift)),
    );
  };

  return (
    <Flex h="100%" minH={0}>
      <Flex
        direction="column"
        w="460px"
        minW="460px"
        borderRightWidth="1px"
        borderColor="gray.200"
        p={4}
        gap={3}
        overflow="hidden"
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
          <Button size="xs" variant="outline" onClick={onBackToSelect}>
            スキー場選択へ戻る
          </Button>
        </Flex>

        <Box
          borderWidth="1px"
          borderRadius="md"
          p={2}
          flexShrink={0}
          bg="gray.50"
          fontSize="xs"
          color="gray.600"
        >
          <Text>
            各リフトの所属スキー場IDを確認し、誤っていれば近隣のスキー場へ変更してください。
          </Text>
          <Text>
            別のスキー場へ変更したリフトは、保存時にそのスキー場の lift_before
            へ移動します。
          </Text>
          {changedCount > 0 && (
            <Text mt={1} color="orange.600" fontWeight="bold">
              所属変更: {changedCount} 件
            </Text>
          )}
        </Box>

        <Box
          flex="1"
          minH="200px"
          borderWidth="1px"
          borderRadius="md"
          overflowY="auto"
        >
          {lifts.map((lift, index) => {
            const isActive = lift.id === selectedLiftId;
            const isChanged = lift.skiId !== lift.original.skiId;
            const options = optionsByLiftId.get(lift.id) ?? [];
            return (
              <Box
                key={lift.id}
                p={2}
                borderBottomWidth="1px"
                borderColor="gray.100"
                bg={isActive ? "blue.50" : undefined}
                cursor="pointer"
                onClick={() => onSelectLift(lift.id)}
              >
                <Flex gap={2} align="center">
                  <Text fontSize="xs" color="gray.500" w="24px">
                    {index + 1}
                  </Text>
                  <Text fontSize="sm" fontWeight="medium" flex="1" truncate>
                    {liftDisplayName(lift, index)}
                  </Text>
                  {lift.aerialway && (
                    <Text fontSize="xs" color="gray.500">
                      {lift.aerialway}
                    </Text>
                  )}
                  {isChanged && (
                    <Text
                      fontSize="xs"
                      color="orange.700"
                      bg="orange.100"
                      px={2}
                      borderRadius="sm"
                      whiteSpace="nowrap"
                    >
                      変更
                    </Text>
                  )}
                </Flex>
                <Flex mt={1} pl="32px" direction="column" gap={1}>
                  <select
                    style={selectStyle}
                    value={lift.skiId}
                    onClick={event => event.stopPropagation()}
                    onChange={event =>
                      updateLiftSkiId(lift.id, event.target.value)
                    }
                  >
                    {options.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {isChanged && (
                    <Flex gap={2} align="center">
                      <Text fontSize="xs" color="orange.700">
                        {lift.original.skiId}（
                        {resortById.get(lift.original.skiId)?.nameJa ?? "不明"}
                        ） → {lift.skiId}（
                        {resortById.get(lift.skiId)?.nameJa ?? "不明"}）
                      </Text>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={event => {
                          event.stopPropagation();
                          updateLiftSkiId(lift.id, lift.original.skiId);
                        }}
                      >
                        元に戻す
                      </Button>
                    </Flex>
                  )}
                </Flex>
              </Box>
            );
          })}
          {lifts.length === 0 && (
            <Text p={3} fontSize="sm" color="gray.500">
              このスキー場の lift_before にリフトがありません。
            </Text>
          )}
        </Box>

        <Button
          colorPalette="blue"
          flexShrink={0}
          onClick={onProceed}
          disabled={lifts.length === 0}
        >
          次へ（リフト位置の補正）
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
          onSelectCourse={onSelectLift}
        />
      </Box>
    </Flex>
  );
}
