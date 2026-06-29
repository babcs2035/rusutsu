"use client";

import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  NativeSelect,
  Table,
  Text,
} from "@chakra-ui/react";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import type { SelectedMapFeature } from "@/features/map/JapanResortMap";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { ElevationProfile } from "../components/ElevationProfile";
import { StatCard } from "../components/StatCard";
import type { Resort } from "../types";
import {
  createElevationProfile,
  formatLiftStatus,
  formatMeters,
  getLiftElevationDiff,
} from "../utils/detailMetrics";

export const LiftsTab = ({
  resort,
  finalizedMapData,
  selectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
}: {
  resort: Resort;
  finalizedMapData: FinalizedResortMapData | null;
  selectedFinalizedFeature: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
}) => {
  const finalizedLifts = finalizedMapData?.lifts?.features ?? [];
  const selectedFinalizedLift =
    selectedFinalizedFeature?.kind === "lift"
      ? (finalizedLifts.find(lift => lift.id === selectedFinalizedFeature.id) ??
        null)
      : null;
  const lifts = resort.lifts;
  const [typeFilter, setTypeFilter] = useState("全て");

  const typeOptions = useMemo(
    () => [
      "全て",
      ...Array.from(
        new Set(lifts.map(l => l.type).filter(Boolean) as string[]),
      ),
    ],
    [lifts],
  );

  const processedLifts = useMemo(() => {
    if (typeFilter === "全て") return lifts;
    return lifts.filter(l => l.type === typeFilter);
  }, [lifts, typeFilter]);

  if (selectedFinalizedLift) {
    const profilePoints = createElevationProfile(
      selectedFinalizedLift.coordinates,
    );

    return (
      <Flex flexDirection="column" gap={5}>
        <Button
          type="button"
          alignSelf="flex-start"
          variant="ghost"
          color="gray.700"
          fontWeight="800"
          px={2}
          onClick={() => onSelectedFinalizedFeatureChange(null)}
        >
          <ArrowLeft size={18} />
          リフト一覧へ戻る
        </Button>
        <Box>
          <Heading size="lg" color="gray.900">
            {selectedFinalizedLift.name}
          </Heading>
          <Text mt={1} color="gray.600" fontWeight="800">
            {selectedFinalizedLift.properties.type ?? "リフト"}
          </Text>
        </Box>

        <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap={3}>
          <StatCard
            title="営業状況"
            value={formatLiftStatus(selectedFinalizedLift.properties.status)}
          />
          <StatCard
            title="速度"
            value={selectedFinalizedLift.properties.speed ?? "--"}
          />
          <StatCard
            title="距離"
            value={formatMeters(
              selectedFinalizedLift.properties.slopeDistMap ??
                selectedFinalizedLift.properties.distance,
            )}
          />
          <StatCard
            title="標高差"
            value={formatMeters(getLiftElevationDiff(selectedFinalizedLift))}
          />
          <StatCard
            title="定員"
            value={
              selectedFinalizedLift.properties.capacity == null
                ? "--"
                : `${selectedFinalizedLift.properties.capacity}名`
            }
          />
          <StatCard
            title="フード"
            value={selectedFinalizedLift.properties.hood ?? "--"}
          />
        </Grid>

        <ElevationProfile points={profilePoints} showSlope={false} />

        {(selectedFinalizedLift.properties.latestNote ||
          selectedFinalizedLift.properties.note) && (
          <Text color="gray.700" lineHeight="1.7">
            {selectedFinalizedLift.properties.latestNote ??
              selectedFinalizedLift.properties.note}
          </Text>
        )}
      </Flex>
    );
  }

  if (finalizedLifts.length > 0) {
    return (
      <Flex flexDirection="column" gap={6}>
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard title="全リフト数" value={`${finalizedLifts.length}`} />
          <StatCard
            title="最長距離"
            value={formatMeters(
              Math.max(
                ...finalizedLifts.map(
                  lift =>
                    lift.properties.slopeDistMap ??
                    lift.properties.distance ??
                    0,
                ),
              ),
            )}
          />
          <StatCard
            title="最大高低差"
            value={formatMeters(
              Math.max(
                ...finalizedLifts.map(lift => getLiftElevationDiff(lift) ?? 0),
              ),
            )}
          />
          <StatCard
            title="データ"
            value={finalizedMapData?.lifts?.fileName ?? "--"}
          />
        </Grid>

        <Box as="section">
          <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
            リフト一覧
          </Heading>
          <Box
            mt={4}
            w="100%"
            overflowX="auto"
            borderRadius="xl"
            border="1px solid"
            borderColor="gray.200"
            bg="white"
          >
            <Table.Root size="md">
              <Table.Header>
                <Table.Row bg="gray.100">
                  <Table.ColumnHeader px={6} py={4}>
                    名称
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    タイプ
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    速度
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    距離
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    状況
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {finalizedLifts.map(lift => {
                  const isSelected =
                    selectedFinalizedFeature?.kind === "lift" &&
                    selectedFinalizedFeature.id === lift.id;
                  return (
                    <Table.Row
                      key={lift.id}
                      cursor="pointer"
                      bg={isSelected ? "blue.50" : "white"}
                      borderColor="gray.200"
                      _hover={{ bg: isSelected ? "blue.100" : "gray.50" }}
                      onClick={() =>
                        onSelectedFinalizedFeatureChange({
                          kind: "lift",
                          id: lift.id,
                        })
                      }
                    >
                      <Table.Cell
                        px={6}
                        py={4}
                        fontWeight="800"
                        whiteSpace="nowrap"
                      >
                        {lift.name}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {lift.properties.type ?? "--"}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {lift.properties.speed ?? "--"}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {formatMeters(
                          lift.properties.slopeDistMap ??
                            lift.properties.distance,
                        )}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {formatLiftStatus(lift.properties.status)}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>
      </Flex>
    );
  }

  return (
    <Flex flexDirection="column" gap={10}>
      <Box as="section">
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard title="全リフト数" value={`${resort.numberOfLifts}`} />
          <StatCard
            title="ゴンドラ・ロープウェイ"
            value={`${resort.gondolas}`}
          />
          <StatCard title="クワッドリフト" value={`${resort.quadLifts}`} />
          <StatCard title="ペアリフト" value={`${resort.pairLifts}`} />
        </Grid>
      </Box>
      <Box as="section">
        <Flex
          flexDirection={{ base: "column", md: "row" }}
          gap={4}
          alignItems={{ md: "center" }}
          justifyContent={{ md: "space-between" }}
        >
          <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
            リフト一覧
          </Heading>
          <NativeSelect.Root
            w={{ base: "100%", md: "200px" }}
            size="md"
            variant="outline"
          >
            <NativeSelect.Field
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              bg="white"
              color="gray.800"
              borderColor="gray.200"
              _focus={{ borderColor: "brand.500" }}
            >
              {typeOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt === "全て" ? "すべてのタイプ" : opt}
                </option>
              ))}
            </NativeSelect.Field>
          </NativeSelect.Root>
        </Flex>
        <Box
          mt={4}
          w="100%"
          overflowX="auto"
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.200"
          bg="white"
        >
          <Table.Root size="md">
            <Table.Header>
              <Table.Row bg="gray.100">
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  名称
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  タイプ
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  距離 (m)
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  フード有無
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {processedLifts.map(l => (
                <Table.Row
                  key={l.id}
                  borderColor="gray.200"
                  _hover={{ bg: "gray.50" }}
                >
                  <Table.Cell
                    px={6}
                    py={4}
                    fontWeight="700"
                    color="gray.800"
                    whiteSpace="nowrap"
                  >
                    {l.name}
                  </Table.Cell>
                  <Table.Cell px={6} py={4} whiteSpace="nowrap">
                    <Box
                      as="span"
                      px={2}
                      py={1}
                      borderRadius="md"
                      bg="gray.100"
                      color="gray.700"
                      fontSize="xs"
                      whiteSpace="nowrap"
                    >
                      {l.type || "--"}
                    </Box>
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.700"
                    fontFamily="mono"
                    whiteSpace="nowrap"
                  >
                    {l.distance?.toLocaleString() || "--"}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.700"
                    whiteSpace="nowrap"
                  >
                    {l.hood || "--"}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Box>
    </Flex>
  );
};
