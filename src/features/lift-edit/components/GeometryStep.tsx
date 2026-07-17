"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import {
  EditorMap,
  type EditorMapMode,
} from "@/features/slope-edit/components/EditorMap";
import type { TileLayerId } from "@/features/slope-edit/types";
import { RESORT_INITIAL_ZOOM } from "../constants";
import type { EditorLift, LngLat, ResortOption } from "../types";
import {
  createEmptyLift,
  distanceM,
  formatDistanceM,
  hasGeometryChange,
  hasLineChange,
  hasMidstationChange,
  liftDisplayName,
} from "../utils/liftOps";

type GeometryStepProps = {
  resort: ResortOption;
  lifts: EditorLift[];
  setLifts: (updater: (lifts: EditorLift[]) => EditorLift[]) => void;
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

const describeChange = (lift: EditorLift): string | null => {
  const parts: string[] = [];
  if (hasLineChange(lift)) {
    const before = lift.original.coordinates;
    const after = lift.coordinates;
    if (lift.isNew) {
      parts.push("新規");
    } else if (before.length !== after.length) {
      parts.push(`頂点数 ${before.length} → ${after.length}`);
    } else {
      const distances = before.map((pair, index) =>
        distanceM(pair, after[index]),
      );
      const movedCount = distances.filter(distance => distance > 0).length;
      parts.push(
        `${movedCount} 点を移動（最大 ${formatDistanceM(Math.max(...distances))}）`,
      );
    }
  }
  if (hasMidstationChange(lift)) {
    if (lift.midstation === null) parts.push("中間駅削除");
    else if (lift.original.midstation === null) parts.push("中間駅追加");
    else parts.push("中間駅移動");
  }
  return parts.length > 0 ? parts.join(" / ") : null;
};

export function GeometryStep({
  resort,
  lifts,
  setLifts,
  googleMapsApiKey,
  savedAt,
  selectedLiftId,
  onSelectLift,
  tileLayerId,
  onTileLayerIdChange,
  onProceed,
  onBack,
}: GeometryStepProps) {
  const [fitBoundsKey, setFitBoundsKey] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMidstationMode, setIsMidstationMode] = useState(false);

  const selectedLift = lifts.find(lift => lift.id === selectedLiftId) ?? null;

  // Escape キーで描画・中間駅モードを終了する
  useEffect(() => {
    if (!isDrawing && !isMidstationMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDrawing(false);
        setIsMidstationMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawing, isMidstationMode]);

  const updateSelectedLift = (
    updater: (lift: EditorLift) => EditorLift,
  ): void => {
    if (!selectedLiftId) return;
    setLifts(previous =>
      previous.map(lift => (lift.id === selectedLiftId ? updater(lift) : lift)),
    );
  };

  const handleSelectLift = (liftId: string | null) => {
    onSelectLift(liftId);
    setIsDrawing(false);
    setIsMidstationMode(false);
  };

  const handleAddLift = () => {
    const lift = createEmptyLift(resort.id);
    setLifts(previous => [...previous, lift]);
    onSelectLift(lift.id);
    setIsMidstationMode(false);
    setIsDrawing(true);
  };

  const handleDeleteNewLift = () => {
    if (!selectedLift?.isNew) return;
    if (
      !window.confirm(
        `新規リフト「${liftDisplayName(selectedLift)}」を削除します。よろしいですか？`,
      )
    ) {
      return;
    }
    setLifts(previous => previous.filter(lift => lift.id !== selectedLift.id));
    onSelectLift(null);
    setIsDrawing(false);
  };

  const handleResetSelected = () => {
    if (!selectedLift) return;
    if (
      !window.confirm(
        `「${liftDisplayName(selectedLift)}」の位置・中間駅の変更を取り消して、読み込み時の状態へ戻します。よろしいですか？`,
      )
    ) {
      return;
    }
    updateSelectedLift(lift => ({
      ...lift,
      coordinates: lift.original.coordinates.map(pair => [...pair] as LngLat),
      midstation: lift.original.midstation
        ? ([...lift.original.midstation] as LngLat)
        : null,
    }));
  };

  const handleDeleteMidstation = () => {
    if (!selectedLift?.midstation) return;
    updateSelectedLift(lift => ({ ...lift, midstation: null }));
    setIsMidstationMode(false);
  };

  const mode: EditorMapMode = !selectedLift
    ? "view"
    : isDrawing
      ? "draw"
      : isMidstationMode
        ? "midstation"
        : "edit";

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
          <Button size="xs" variant="outline" onClick={onBack}>
            所属確認へ戻る
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
          <Text fontWeight="bold" mb={1}>
            地図の操作
          </Text>
          <Text>・一覧または地図上の線をクリックしてリフトを選択</Text>
          <Text>・赤い点（始点・終点・中間点）: ドラッグで移動</Text>
          <Text>・青い点: クリックで中間に点を追加</Text>
          <Text>・赤い点を右クリックで削除</Text>
          <Text>・緑の点は中間駅（ドラッグで移動）</Text>
          <Text>・破線は編集前の位置</Text>
          <Text>
            ・「リフトを追加」中は地図クリックで点を打つ（Esc で終了）
          </Text>
        </Box>

        <Flex gap={2} flexShrink={0} wrap="wrap">
          <Button size="sm" colorPalette="blue" onClick={handleAddLift}>
            ＋ リフトを追加
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFitBoundsKey(key => key + 1)}
            disabled={lifts.every(lift => lift.coordinates.length === 0)}
          >
            全体表示
          </Button>
        </Flex>

        {selectedLift && (
          <Flex gap={2} flexShrink={0} wrap="wrap">
            {selectedLift.isNew && (
              <Button
                size="xs"
                variant={isDrawing ? "solid" : "outline"}
                colorPalette="orange"
                onClick={() => {
                  setIsMidstationMode(false);
                  setIsDrawing(previous => !previous);
                }}
              >
                {isDrawing ? "描画終了" : "点を追加"}
              </Button>
            )}
            <Button
              size="xs"
              variant={isMidstationMode ? "solid" : "outline"}
              colorPalette="green"
              onClick={() => {
                setIsDrawing(false);
                setIsMidstationMode(previous => !previous);
              }}
            >
              {isMidstationMode
                ? "中間駅の配置を終了"
                : selectedLift.midstation
                  ? "中間駅を置き直す（地図をクリック）"
                  : "中間駅を追加（地図をクリック）"}
            </Button>
            {selectedLift.midstation && (
              <Button
                size="xs"
                variant="outline"
                colorPalette="red"
                onClick={handleDeleteMidstation}
              >
                中間駅を削除
              </Button>
            )}
            {hasGeometryChange(selectedLift) && !selectedLift.isNew && (
              <Button
                size="xs"
                variant="outline"
                colorPalette="red"
                onClick={handleResetSelected}
              >
                位置変更を取り消す
              </Button>
            )}
            {selectedLift.isNew && (
              <Button
                size="xs"
                variant="ghost"
                colorPalette="red"
                onClick={handleDeleteNewLift}
              >
                この新規リフトを削除
              </Button>
            )}
          </Flex>
        )}

        <Box
          flex="1"
          minH="200px"
          borderWidth="1px"
          borderRadius="md"
          overflowY="auto"
        >
          {lifts.map((lift, index) => {
            const isActive = lift.id === selectedLiftId;
            const change = describeChange(lift);
            return (
              <Box
                key={lift.id}
                p={2}
                borderBottomWidth="1px"
                borderColor="gray.100"
                bg={isActive ? "blue.50" : undefined}
                cursor="pointer"
                onClick={() => handleSelectLift(lift.id)}
              >
                <Flex gap={2} align="center">
                  <Text fontSize="xs" color="gray.500" w="24px">
                    {index + 1}
                  </Text>
                  <Text fontSize="sm" fontWeight="medium" flex="1" truncate>
                    {liftDisplayName(lift, index)}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    {lift.coordinates.length} 点
                  </Text>
                  {lift.midstation && (
                    <Text fontSize="xs" color="green.700">
                      中間駅
                    </Text>
                  )}
                  {change && (
                    <Text
                      fontSize="xs"
                      color="orange.700"
                      bg="orange.100"
                      px={2}
                      borderRadius="sm"
                      whiteSpace="nowrap"
                    >
                      {change}
                    </Text>
                  )}
                </Flex>
              </Box>
            );
          })}
          {lifts.length === 0 && (
            <Text p={3} fontSize="sm" color="gray.500">
              「＋
              リフトを追加」を押して、地図上で始点から終点へ順に点を打ってください。
            </Text>
          )}
        </Box>

        <Button colorPalette="blue" flexShrink={0} onClick={onProceed}>
          次へ（リフト詳細情報の入力）
        </Button>
      </Flex>

      <Box flex="1" minW={0}>
        <EditorMap
          center={[resort.longitude, resort.latitude]}
          zoom={RESORT_INITIAL_ZOOM}
          courses={lifts}
          backgroundLines={
            selectedLift && hasLineChange(selectedLift) && !selectedLift.isNew
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
          mode={mode}
          googleMapsApiKey={googleMapsApiKey}
          fitBoundsKey={fitBoundsKey}
          layerId={tileLayerId}
          onLayerIdChange={onTileLayerIdChange}
          midstation={selectedLift?.midstation ?? null}
          onPlaceMidstation={lngLat => {
            updateSelectedLift(lift => ({ ...lift, midstation: lngLat }));
            setIsMidstationMode(false);
          }}
          onMoveMidstation={lngLat =>
            updateSelectedLift(lift => ({ ...lift, midstation: lngLat }))
          }
          onSelectCourse={liftId => {
            if (!isDrawing && !isMidstationMode) handleSelectLift(liftId);
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
              // 既存リフトは 2 点未満にできない（新規は描画中の打ち直しを許可）
              if (!lift.isNew && lift.coordinates.length <= 2) return lift;
              return {
                ...lift,
                coordinates: lift.coordinates.filter(
                  (_, pairIndex) => pairIndex !== index,
                ),
              };
            })
          }
        />
      </Box>
    </Flex>
  );
}
