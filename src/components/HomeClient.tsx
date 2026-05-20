"use client";

import { Box, Button, Flex, Heading } from "@chakra-ui/react";
import { AnimatePresence } from "framer-motion";
import type L from "leaflet";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Drawer } from "vaul";
import { getSkiResortById } from "@/actions/skiResorts";
import { FilterPanel, type Filters } from "@/components/FilterPanel";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { SkiResortCompareView } from "@/components/SkiResortCompareView";
import { SkiResortDetailView } from "@/components/SkiResortDetailView";
import { SkiResortList } from "@/components/SkiResortList";

// getSkiResortsForMap の戻り値型
type MapResort = {
  id: string;
  nameJa: string;
  nameEn: string;
  prefecture: string;
  town: string;
  latitude: number;
  longitude: number;
  verticalDrop: number;
  numberOfCourses: number;
  beginnersCoursesPercent: number;
  status: string | null;
  yukiMagiId: string | null;
};

type Props = {
  initialResorts: MapResort[];
};

export function HomeClient({ initialResorts }: Props) {
  // マップコンポーネントを SSR 無効で動的インポート
  const DynamicMap = useMemo(
    () =>
      dynamic(
        () => import("@/components/SkiResortMap").then(mod => mod.SkiResortMap),
        {
          loading: () => <LoadingSpinner text="地図を読み込んでいます..." />,
          ssr: false,
        },
      ),
    [],
  );

  // --- State管理 ---
  const [filters, setFilters] = useState<Filters>({
    keyword: "",
    status: false,
    yukiMagi: false,
    beginnerFriendly: false,
    minVertical: 0,
    minCourses: 0,
  });
  const [selectedResortId, setSelectedResortId] = useState<string | null>(null);
  const [selectedResortData, setSelectedResortData] = useState<Awaited<
    ReturnType<typeof getSkiResortById>
  > | null>(null);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [compareResortData, setCompareResortData] = useState<
    NonNullable<Awaited<ReturnType<typeof getSkiResortById>>>[]
  >([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isCompareLoading, setIsCompareLoading] = useState(false);
  const [isListSheetOpen, setIsListSheetOpen] = useState(false);
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds | null>(null);
  const [isPending, startTransition] = useTransition();

  // --- データ絞り込みロジック ---

  // 1. フィルターパネルによる絞り込み
  const filteredResorts = useMemo(() => {
    return initialResorts.filter(resort => {
      if (filters.status && !resort.status?.includes("滑走可")) return false;
      if (filters.yukiMagi && !resort.yukiMagiId) return false;
      if (filters.beginnerFriendly && resort.beginnersCoursesPercent < 30)
        return false;
      if (
        filters.keyword !== "" &&
        !resort.nameJa.toLowerCase().includes(filters.keyword.toLowerCase())
      )
        return false;
      if (filters.minVertical > resort.verticalDrop) return false;
      if (filters.minCourses > resort.numberOfCourses) return false;
      return true;
    });
  }, [initialResorts, filters]);
  const filteredResortIdSet = useMemo(
    () => new Set(filteredResorts.map(resort => resort.id)),
    [filteredResorts],
  );
  const isFilterActive =
    filters.keyword.trim() !== "" ||
    filters.status ||
    filters.yukiMagi ||
    filters.beginnerFriendly ||
    filters.minVertical > 0 ||
    filters.minCourses > 0;

  // 2. 地図の表示領域による絞り込み
  const visibleResorts = useMemo(() => {
    if (!mapBounds) return [];
    return filteredResorts.filter(resort => {
      const point = {
        lat: resort.latitude,
        lng: resort.longitude,
      };
      return mapBounds.contains(point);
    });
  }, [filteredResorts, mapBounds]);

  const selectedCompareIdSet = useMemo(
    () => new Set(selectedCompareIds),
    [selectedCompareIds],
  );
  const mapInteractionMode = isCompareOpen
    ? "compare"
    : selectedResortId
      ? "detail"
      : "default";

  // --- イベントハンドラ ---
  const handleFilterChange = (newFilters: Filters) => setFilters(newFilters);

  const handleSelectResort = useCallback((id: string) => {
    setIsCompareOpen(false);
    setSelectedResortId(id);
    setIsListSheetOpen(false); // モーダルを開くときにボトムシートを閉じる
    startTransition(async () => {
      const data = await getSkiResortById(id);
      setSelectedResortData(data);
    });
  }, []);

  const handleCloseDetail = () => {
    setSelectedResortId(null);
    setSelectedResortData(null);
  };

  const handleToggleCompare = useCallback(
    (id: string, selected: boolean) => {
      setSelectedCompareIds(prev => {
        if (selected) return prev.includes(id) ? prev : [...prev, id];
        return prev.filter(compareId => compareId !== id);
      });

      if (!isCompareOpen) return;

      if (!selected) {
        setCompareResortData(prev => prev.filter(resort => resort.id !== id));
        return;
      }

      setIsCompareLoading(true);
      startTransition(async () => {
        const data = await getSkiResortById(id);
        if (data) {
          setCompareResortData(prev =>
            prev.some(resort => resort.id === data.id) ? prev : [...prev, data],
          );
        }
        setIsCompareLoading(false);
      });
    },
    [isCompareOpen],
  );

  const handleOpenCompare = useCallback(async () => {
    if (selectedCompareIds.length === 0) return;

    setIsCompareOpen(true);
    setIsCompareLoading(true);
    setIsListSheetOpen(false);
    setCompareResortData([]);

    const data = await Promise.all(
      selectedCompareIds.map(id => getSkiResortById(id)),
    );

    setCompareResortData(data.filter(resort => resort !== null));
    setIsCompareLoading(false);
  }, [selectedCompareIds]);

  const handleCloseCompare = () => {
    setIsCompareOpen(false);
  };

  return (
    <Flex
      as="main"
      position="relative"
      h="100vh"
      w="100vw"
      overflow="hidden"
      flexDirection={{ md: "row" }}
      bg="var(--bg-light)"
    >
      {/* --- 地図表示エリア --- */}
      <Box h="100%" w="100%" position="relative">
        <FilterPanel filters={filters} onFilterChange={handleFilterChange} />
        <DynamicMap
          resorts={initialResorts}
          filteredResortIdSet={filteredResortIdSet}
          isFilterActive={isFilterActive}
          selectedResortId={selectedResortId}
          onSelectResort={handleSelectResort}
          interactionMode={mapInteractionMode}
          selectedCompareIdSet={selectedCompareIdSet}
          onToggleCompare={handleToggleCompare}
          onBoundsChange={setMapBounds}
        />
      </Box>

      {/* --- PC用の右カラム --- */}
      <Box
        display={{ base: "none", md: "block" }}
        h="100%"
        w="400px"
        flexShrink={0}
        borderLeft="1px solid"
        borderColor="gray.200"
        bg="rgba(255, 255, 255, 0.8)"
        backdropFilter="blur(16px)"
        position="relative"
        zIndex={10}
        boxShadow="-4px 0 20px rgba(0,0,0,0.05)"
      >
        <SkiResortList
          resorts={visibleResorts}
          onSelectResort={handleSelectResort}
          selectedCompareIdSet={selectedCompareIdSet}
          onToggleCompare={handleToggleCompare}
        />
      </Box>

      {/* --- スマートフォン用のボトムシート --- */}
      <Box display={{ base: "block", md: "none" }}>
        <Drawer.Root
          open={isListSheetOpen}
          onOpenChange={setIsListSheetOpen}
          shouldScaleBackground
        >
          <Drawer.Portal>
            <Drawer.Overlay
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9998,
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                backdropFilter: "blur(4px)",
              }}
            />
            <Drawer.Content
              style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 9999,
                display: "flex",
                flexDirection: "column",
                borderTopLeftRadius: "1.5rem",
                borderTopRightRadius: "1.5rem",
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                borderTop: "1px solid rgba(0, 0, 0, 0.05)",
                backdropFilter: "blur(20px)",
                height: "min(85vh, 800px)",
                boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.1)",
              }}
            >
              <Drawer.Title
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: "hidden",
                  clip: "rect(0, 0, 0, 0)",
                  border: 0,
                }}
              >
                スキー場リスト
              </Drawer.Title>
              <Box
                mx="auto"
                my={4}
                h={1.5}
                w={16}
                flexShrink={0}
                borderRadius="full"
                bg="gray.300"
              />
              <Box flexGrow={1} overflowY="auto">
                <SkiResortList
                  resorts={visibleResorts}
                  onSelectResort={handleSelectResort}
                  selectedCompareIdSet={selectedCompareIdSet}
                  onToggleCompare={handleToggleCompare}
                />
              </Box>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
        <Button
          position="fixed"
          bottom={0}
          left={0}
          right={0}
          zIndex={9999}
          display={{ base: "flex", md: "none" }}
          h={20}
          cursor="pointer"
          alignItems="center"
          justifyContent="center"
          borderTopRadius="2xl"
          borderTop="1px solid"
          borderColor="gray.200"
          bg="rgba(255, 255, 255, 0.95)"
          backdropFilter="blur(10px)"
          p={4}
          boxShadow="0 -10px 30px rgba(0, 0, 0, 0.05)"
          transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
          opacity={isListSheetOpen ? 0 : 1}
          pointerEvents={isListSheetOpen ? "none" : "auto"}
          onClick={() => setIsListSheetOpen(true)}
          aria-label="リストを開く"
          flexDirection="column"
          _hover={{ bg: "rgba(31, 40, 51, 0.95)" }}
        >
          <Box
            position="absolute"
            top={3}
            h={1.5}
            w={16}
            borderRadius="full"
            bg="gray.300"
          />
          <Heading pt={3} size="md" color="gray.900">
            {visibleResorts.length} 件のスキー場を表示中
          </Heading>
        </Button>
      </Box>

      {selectedCompareIds.length > 0 && (
        <Button
          position="fixed"
          right={{ base: 4, md: "424px" }}
          bottom={{ base: 24, md: 6 }}
          zIndex={10000}
          h={12}
          px={5}
          borderRadius="full"
          bg="gray.900"
          color="white"
          fontWeight="800"
          boxShadow="0 12px 30px rgba(0, 0, 0, 0.22)"
          _hover={{ bg: "gray.800", transform: "translateY(-1px)" }}
          onClick={handleOpenCompare}
        >
          {selectedCompareIds.length} 件を比較
        </Button>
      )}

      {/* --- 詳細モーダルの表示 --- */}
      <AnimatePresence>
        {selectedResortId && (
          <SkiResortDetailView
            resortId={selectedResortId}
            resortData={selectedResortData}
            isLoading={isPending}
            isCompareSelected={selectedCompareIdSet.has(selectedResortId)}
            onToggleCompare={handleToggleCompare}
            onClose={handleCloseDetail}
          />
        )}
      </AnimatePresence>

      {/* --- 比較モーダルの表示 --- */}
      <AnimatePresence>
        {isCompareOpen && (
          <SkiResortCompareView
            resorts={compareResortData}
            isLoading={isCompareLoading}
            onClose={handleCloseCompare}
          />
        )}
      </AnimatePresence>
    </Flex>
  );
}
