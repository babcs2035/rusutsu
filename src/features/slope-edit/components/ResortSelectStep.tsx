"use client";

import { Box, Button, Flex, Heading, Input, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { TILE_LAYERS } from "../constants";
import { discardDraft, listDraftSummaries } from "../hooks/useDraftStorage";
import type { DraftSummary, ResortOption, StartSource } from "../types";

type ResortSelectStepProps = {
  resorts: ResortOption[];
  onStart: (resort: ResortOption, source: StartSource) => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

export function ResortSelectStep({ resorts, onStart }: ResortSelectStepProps) {
  const [query, setQuery] = useState("");
  const [pendingResortId, setPendingResortId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Map<string, DraftSummary>>(new Map());

  useEffect(() => {
    setDrafts(
      new Map(listDraftSummaries().map(summary => [summary.resortId, summary])),
    );
  }, []);

  const filteredResorts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (keyword === "") return resorts;
    return resorts.filter(
      resort =>
        resort.nameJa.toLowerCase().includes(keyword) ||
        resort.nameEn.toLowerCase().includes(keyword) ||
        resort.prefecture.toLowerCase().includes(keyword) ||
        resort.id.toLowerCase().includes(keyword),
    );
  }, [resorts, query]);

  const pendingResort =
    resorts.find(resort => resort.id === pendingResortId) ?? null;
  const pendingDraft = pendingResort
    ? (drafts.get(pendingResort.id) ?? null)
    : null;

  const handleDiscardDraft = () => {
    if (!pendingResort || !pendingDraft) return;
    if (
      !window.confirm(
        `「${pendingResort.nameJa}」の下書き（${formatDateTime(pendingDraft.updatedAt)} 保存）を破棄します。よろしいですか？`,
      )
    ) {
      return;
    }
    discardDraft(pendingResort.id);
    setDrafts(previous => {
      const next = new Map(previous);
      next.delete(pendingResort.id);
      return next;
    });
  };

  const gsiPale = TILE_LAYERS.gsiPale;

  return (
    <Flex h="100%" minH={0}>
      <Flex
        direction="column"
        w="420px"
        minW="420px"
        borderRightWidth="1px"
        borderColor="gray.200"
        p={4}
        gap={3}
        overflow="hidden"
      >
        <Heading size="md">スキー場を選ぶ</Heading>
        <Text fontSize="sm" color="gray.600">
          リストから選ぶか、右の地図上のマーカーをクリックしてください。
        </Text>
        <Input
          placeholder="スキー場名・都道府県で検索"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />

        {pendingResort && (
          <Box
            borderWidth="2px"
            borderColor="blue.400"
            borderRadius="md"
            p={3}
            bg="blue.50"
          >
            <Text fontWeight="bold">{pendingResort.nameJa}</Text>
            <Text fontSize="xs" color="gray.600" mb={2}>
              {pendingResort.prefecture} / {pendingResort.id}
            </Text>
            <Flex direction="column" gap={2}>
              {pendingDraft && (
                <>
                  <Button
                    size="sm"
                    colorPalette="orange"
                    onClick={() => onStart(pendingResort, "draft")}
                  >
                    下書きを復元して編集（
                    {formatDateTime(pendingDraft.updatedAt)} 保存・
                    {pendingDraft.courseCount} コース）
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    colorPalette="red"
                    onClick={handleDiscardDraft}
                  >
                    下書きを破棄
                  </Button>
                </>
              )}
              {pendingResort.hasSlopeBefore && (
                <Button
                  size="sm"
                  colorPalette="blue"
                  onClick={() => onStart(pendingResort, "existing")}
                >
                  既存の slope_before を読み込んで編集
                </Button>
              )}
              <Button
                size="sm"
                variant={
                  pendingResort.hasSlopeBefore || pendingDraft
                    ? "outline"
                    : "solid"
                }
                colorPalette="blue"
                onClick={() => onStart(pendingResort, "new")}
              >
                新規作成
              </Button>
            </Flex>
          </Box>
        )}

        <Box flex="1" overflowY="auto" borderWidth="1px" borderRadius="md">
          {filteredResorts.map(resort => (
            <Flex
              key={resort.id}
              px={3}
              py={2}
              gap={2}
              align="center"
              cursor="pointer"
              borderBottomWidth="1px"
              borderColor="gray.100"
              bg={resort.id === pendingResortId ? "blue.100" : undefined}
              _hover={{ bg: "gray.50" }}
              onClick={() => setPendingResortId(resort.id)}
            >
              <Box flex="1" minW={0}>
                <Text fontSize="sm" fontWeight="medium" truncate>
                  {resort.nameJa}
                </Text>
                <Text fontSize="xs" color="gray.500">
                  {resort.prefecture}
                </Text>
              </Box>
              {drafts.has(resort.id) && (
                <Text
                  fontSize="xs"
                  color="orange.600"
                  bg="orange.50"
                  px={2}
                  borderRadius="sm"
                  whiteSpace="nowrap"
                >
                  下書きあり
                </Text>
              )}
              {resort.hasSlopeBefore && (
                <Text
                  fontSize="xs"
                  color="blue.600"
                  bg="blue.50"
                  px={2}
                  borderRadius="sm"
                  whiteSpace="nowrap"
                >
                  既存データあり
                </Text>
              )}
            </Flex>
          ))}
          {filteredResorts.length === 0 && (
            <Text p={3} fontSize="sm" color="gray.500">
              該当するスキー場がありません。
            </Text>
          )}
        </Box>
      </Flex>

      <Box flex="1" minW={0}>
        <MapContainer
          center={[38.25, 138.0]}
          zoom={6}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url={gsiPale.url}
            attribution={gsiPale.attribution}
            maxZoom={gsiPale.maxZoom}
          />
          {resorts.map(resort => (
            <CircleMarker
              key={resort.id}
              center={[resort.latitude, resort.longitude]}
              radius={resort.id === pendingResortId ? 9 : 6}
              pathOptions={{
                color: "#fff",
                weight: 1.5,
                fillColor:
                  resort.id === pendingResortId
                    ? "#dd6b20"
                    : resort.hasSlopeBefore
                      ? "#3182ce"
                      : "#718096",
                fillOpacity: 0.9,
              }}
              eventHandlers={{
                click: () => setPendingResortId(resort.id),
              }}
            >
              <Tooltip>{resort.nameJa}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </Box>
    </Flex>
  );
}
