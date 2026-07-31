"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
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
  deletedLifts: EditorLift[];
  setLifts: (updater: (lifts: EditorLift[]) => EditorLift[]) => void;
  savedAt: string | null;
  selectedLiftId: string | null;
  onSelectLift: (liftId: string | null) => void;
  isDrawing: boolean;
  onDrawingChange: (isDrawing: boolean) => void;
  isMidstationMode: boolean;
  onMidstationModeChange: (isMidstationMode: boolean) => void;
  onFitBounds: () => void;
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
  deletedLifts,
  setLifts,
  savedAt,
  selectedLiftId,
  onSelectLift,
  isDrawing,
  onDrawingChange,
  isMidstationMode,
  onMidstationModeChange,
  onFitBounds,
  onProceed,
  onBack,
}: GeometryStepProps) {
  const [draggedLiftId, setDraggedLiftId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    liftId: string;
    position: "before" | "after";
  } | null>(null);
  const selectedLift = lifts.find(lift => lift.id === selectedLiftId) ?? null;

  // Escape キーで描画・中間駅モードを終了する
  useEffect(() => {
    if (!isDrawing && !isMidstationMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDrawingChange(false);
        onMidstationModeChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawing, isMidstationMode, onDrawingChange, onMidstationModeChange]);

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
    onDrawingChange(false);
    onMidstationModeChange(false);
  };

  const handleAddLift = () => {
    const lift = createEmptyLift(resort.id);
    setLifts(previous => [...previous, lift]);
    onSelectLift(lift.id);
    onMidstationModeChange(false);
    onDrawingChange(true);
  };

  const handleDeleteLift = () => {
    if (!selectedLift) return;
    const selectedIndex = lifts.findIndex(lift => lift.id === selectedLift.id);
    const nextSelectedId =
      lifts[selectedIndex + 1]?.id ?? lifts[selectedIndex - 1]?.id ?? null;
    const message = selectedLift.isNew
      ? `新規リフト「${liftDisplayName(selectedLift)}」を削除します。よろしいですか？`
      : `「${liftDisplayName(selectedLift)}」を削除予定にします。保存すると lift_before から削除されます。よろしいですか？`;
    if (!window.confirm(message)) return;

    setLifts(previous =>
      selectedLift.isNew
        ? previous.filter(lift => lift.id !== selectedLift.id)
        : previous.map(lift =>
            lift.id === selectedLift.id ? { ...lift, isDeleted: true } : lift,
          ),
    );
    onSelectLift(nextSelectedId);
    onDrawingChange(false);
    onMidstationModeChange(false);
  };

  const handleRestoreLift = (liftId: string) => {
    setLifts(previous =>
      previous.map(lift =>
        lift.id === liftId ? { ...lift, isDeleted: false } : lift,
      ),
    );
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
    onMidstationModeChange(false);
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

      reordered.splice(
        position === "after" ? targetIndex + 1 : targetIndex,
        0,
        draggedLift,
      );
      return reordered;
    });
  };

  const clearDragState = (): void => {
    setDraggedLiftId(null);
    setDropTarget(null);
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
      overflow="hidden"
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
        <Text>・「リフトを追加」中は地図クリックで点を打つ（Esc で終了）</Text>
      </Box>

      <Flex gap={2} flexShrink={0} wrap="wrap">
        <Button size="sm" colorPalette="blue" onClick={handleAddLift}>
          ＋ リフトを追加
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onFitBounds}
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
                onMidstationModeChange(false);
                onDrawingChange(!isDrawing);
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
              onDrawingChange(false);
              onMidstationModeChange(!isMidstationMode);
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
          <Button
            size="xs"
            variant="ghost"
            colorPalette="red"
            onClick={handleDeleteLift}
          >
            {selectedLift.isNew ? "この新規リフトを削除" : "このリフトを削除"}
          </Button>
        </Flex>
      )}

      {deletedLifts.length > 0 && (
        <Box
          borderWidth="1px"
          borderColor="red.200"
          borderRadius="md"
          bg="red.50"
          maxH="120px"
          overflowY="auto"
          flexShrink={0}
        >
          <Text px={3} py={2} fontSize="xs" fontWeight="bold" color="red.700">
            削除予定（{deletedLifts.length} 件）
          </Text>
          {deletedLifts.map(lift => (
            <Flex
              key={lift.id}
              px={3}
              py={2}
              gap={2}
              align="center"
              borderTopWidth="1px"
              borderColor="red.100"
            >
              <Text fontSize="sm" flex="1" truncate>
                {liftDisplayName(lift)}
              </Text>
              <Button
                size="xs"
                variant="outline"
                colorPalette="red"
                onClick={() => handleRestoreLift(lift.id)}
              >
                元に戻す
              </Button>
            </Flex>
          ))}
        </Box>
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
              opacity={lift.id === draggedLiftId ? 0.45 : 1}
              boxShadow={
                dropTarget?.liftId === lift.id
                  ? dropTarget.position === "before"
                    ? "inset 0 3px 0 var(--chakra-colors-blue-500)"
                    : "inset 0 -3px 0 var(--chakra-colors-blue-500)"
                  : undefined
              }
              cursor="pointer"
              onDragOver={event => {
                if (draggedLiftId === null || draggedLiftId === lift.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const bounds = event.currentTarget.getBoundingClientRect();
                setDropTarget({
                  liftId: lift.id,
                  position:
                    event.clientY < bounds.top + bounds.height / 2
                      ? "before"
                      : "after",
                });
              }}
              onDrop={event => {
                event.preventDefault();
                const sourceLiftId =
                  draggedLiftId || event.dataTransfer.getData("text/plain");
                const bounds = event.currentTarget.getBoundingClientRect();
                reorderLift(
                  sourceLiftId,
                  lift.id,
                  event.clientY < bounds.top + bounds.height / 2
                    ? "before"
                    : "after",
                );
                clearDragState();
              }}
              onClick={() => handleSelectLift(lift.id)}
            >
              <Flex gap={2} align="center">
                <Text
                  aria-label={`${liftDisplayName(lift, index)}を並び替え`}
                  color="gray.400"
                  fontSize="lg"
                  lineHeight="1"
                  cursor="grab"
                  userSelect="none"
                  draggable
                  onDragStart={event => {
                    setDraggedLiftId(lift.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", lift.id);
                  }}
                  onDragEnd={clearDragState}
                  onClick={event => event.stopPropagation()}
                >
                  ⠿
                </Text>
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
      {lifts.length > 1 && (
        <Text fontSize="xs" color="gray.500" mt={-2}>
          ⠿をドラッグして並び替えられます。変更した順番が保存後の GeoJSON
          のリフト順になります。
        </Text>
      )}

      <Button colorPalette="blue" flexShrink={0} onClick={onProceed}>
        次へ（リフト詳細情報の入力）
      </Button>
    </Flex>
  );
}
