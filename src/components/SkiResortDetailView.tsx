"use client";

import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  Link,
  List,
  NativeSelect,
  Table,
  Text,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SkiResortT } from "@/types";
import type { ForecastsT } from "@/types/forecasts";
import type { SnowDepthsT, WeathersT } from "@/types/weathers";
import {
  ForecastTable,
  SnowDepthLineChart,
  WeeklyWeatherChart,
} from "./WeatherChart";

type Props = {
  resort: SkiResortT;
  onClose: () => void;
};

const TABS = ["概要", "コース", "リフト", "チケット", "気候"];

const MotionBox = motion.create(Box);

/**
 * スキー場の詳細情報を表示するレスポンシブ対応モーダル
 */
export const SkiResortDetailView = ({ resort, onClose }: Props) => {
  const [activeTab, setActiveTab] = useState(TABS[0]);

  // --- データの読み込みとIDに基づいた検索 ---
  const weathersData: WeathersT | undefined = useMemo(
    () =>
      require("@/lib/weathers.json").find(
        (w: WeathersT) => w.meta.id === resort.id,
      ),
    [resort.id],
  );
  const forecastsData: ForecastsT | undefined = useMemo(
    () =>
      require("@/lib/forecasts.json").find(
        (f: ForecastsT) => f.meta.id === resort.id,
      ),
    [resort.id],
  );
  // snowdepths.json はIDをキーとするオブジェクトからデータを取得
  const snowDepthsData: SnowDepthsT | undefined = useMemo(
    () => require("@/lib/snowdepths.json")[resort.id],
    [resort.id],
  );

  return (
    <Flex
      position="fixed"
      inset={0}
      zIndex={99999}
      alignItems="center"
      justifyContent="center"
      p={{ base: 0, md: 6 }}
    >
      <MotionBox
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        position="absolute"
        inset={0}
        bg="blackAlpha.600"
        aria-hidden="true"
      />
      <MotionBox
        variants={{
          hidden: { opacity: 0, scale: 0.95 },
          visible: { opacity: 1, scale: 1 },
        }}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        position="relative"
        zIndex={10}
        display="flex"
        h={{ base: "100%", md: "90vh" }}
        maxH={{ md: "800px" }}
        w={{ base: "100%", md: "90vw" }}
        maxW={{ md: "4xl" }}
        flexDirection="column"
        overflow="hidden"
        bg="#f9fafb"
        boxShadow="2xl"
        borderRadius={{ md: "2xl" }}
      >
        <Button
          onClick={onClose}
          position="absolute"
          top={4}
          right={4}
          zIndex={20}
          display="flex"
          h={8}
          w={8}
          alignItems="center"
          justifyContent="center"
          borderRadius="full"
          bg="blackAlpha.400"
          fontSize="2xl"
          color="white"
          boxShadow="lg"
          backdropFilter="blur(4px)"
          _hover={{ bg: "blackAlpha.700", transform: "scale(1.1)" }}
          _focus={{ outline: "none", ring: "2px", ringColor: "whiteAlpha.500" }}
          minW="auto"
          p={0}
        >
          ✕
        </Button>
        <Box flexGrow={1} overflowY="auto">
          <ImageCarousel
            images={(resort.outline?.images || []).concat(
              resort.courses.images || [],
            )}
            alt={resort.name.ja}
          />
          <InfoSection resort={resort} />
          <Flex
            as="nav"
            position="sticky"
            top={0}
            zIndex={10}
            borderY="1px"
            borderColor="gray.200"
            bg="whiteAlpha.800"
            backdropFilter="blur(4px)"
          >
            {TABS.map(tab => (
              <Button
                key={tab}
                onClick={() => setActiveTab(tab)}
                flex={1}
                py={3}
                px={2}
                textAlign="center"
                fontSize={{ base: "sm", md: "md" }}
                fontWeight="semibold"
                bg="transparent"
                borderRadius={0}
                borderBottom={activeTab === tab ? "2px solid" : "none"}
                borderColor={activeTab === tab ? "sky.500" : "transparent"}
                color={activeTab === tab ? "#0284c7" : "#6b7280"}
                _hover={{ bg: activeTab === tab ? "transparent" : "gray.100" }}
              >
                {tab}
              </Button>
            ))}
          </Flex>
          <Box p={{ base: 4, md: 6 }}>
            {activeTab === "概要" && <OverviewTab resort={resort} />}
            {activeTab === "コース" && <CoursesTab resort={resort} />}
            {activeTab === "リフト" && <LiftsTab resort={resort} />}
            {activeTab === "チケット" && <TicketsTab resort={resort} />}
            {activeTab === "気候" && (
              <WeatherTab
                weathers={weathersData}
                forecasts={forecastsData}
                snowDepths={snowDepthsData}
              />
            )}
          </Box>
        </Box>
      </MotionBox>
    </Flex>
  );
};

// --- 子コンポーネント群 ---

const ImageCarousel = ({ images, alt }: { images: string[]; alt: string }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = useCallback(
    () => setCurrentSlide(s => (s === images.length - 1 ? 0 : s + 1)),
    [images.length],
  );
  const prevSlide = useCallback(
    () => setCurrentSlide(s => (s === 0 ? images.length - 1 : s - 1)),
    [images.length],
  );

  useEffect(() => {
    if (!images || images.length <= 1) return;
    const interval = setInterval(nextSlide, 4000);
    return () => clearInterval(interval);
  }, [images, nextSlide]);

  if (!images || images.length === 0)
    return (
      <Box
        h={{ base: "192px", md: "256px" }}
        w="100%"
        flexShrink={0}
        bg="#d1d5db"
      />
    );

  return (
    <Box
      position="relative"
      h={{ base: "192px", md: "256px" }}
      w="100%"
      flexShrink={0}
      overflow="hidden"
    >
      <Flex
        h="100%"
        w="100%"
        transition="transform 0.7s ease-in-out"
        style={{ transform: `translateX(-${currentSlide * 100}%)` }}
      >
        {images.map(src => (
          <Box key={src} position="relative" h="100%" w="100%" flexShrink={0}>
            <Image
              src={src}
              alt={alt}
              fill
              style={{ objectFit: "contain" }}
              unoptimized
              priority
            />
          </Box>
        ))}
      </Flex>
      {images.length > 1 && (
        <>
          <Button
            onClick={prevSlide}
            position="absolute"
            left={3}
            top="50%"
            transform="translateY(-50%)"
            display="flex"
            h={7}
            w={7}
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            bg="blackAlpha.500"
            fontSize="2xl"
            color="white"
            boxShadow="lg"
            backdropFilter="blur(4px)"
            _hover={{
              bg: "blackAlpha.700",
              transform: "translateY(-50%) scale(1.1)",
            }}
            _focus={{
              outline: "none",
              ring: "2px",
              ringColor: "whiteAlpha.500",
            }}
            minW="auto"
            p={0}
            aria-label="前の画像"
          >
            ‹
          </Button>
          <Button
            onClick={nextSlide}
            position="absolute"
            right={3}
            top="50%"
            transform="translateY(-50%)"
            display="flex"
            h={7}
            w={7}
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            bg="blackAlpha.500"
            fontSize="2xl"
            color="white"
            boxShadow="lg"
            backdropFilter="blur(4px)"
            _hover={{
              bg: "blackAlpha.700",
              transform: "translateY(-50%) scale(1.1)",
            }}
            _focus={{
              outline: "none",
              ring: "2px",
              ringColor: "whiteAlpha.500",
            }}
            minW="auto"
            p={0}
            aria-label="次の画像"
          >
            ›
          </Button>
        </>
      )}
    </Box>
  );
};

const InfoSection = ({ resort }: { resort: SkiResortT }) => (
  <Box bg="white" p={{ base: 4, md: 6 }}>
    <Heading size="2xl">{resort.name.ja}</Heading>
    <Text mt={1} fontSize="sm" color="#6b7280">
      {resort.location.prefecture} {resort.location.town}
    </Text>
    <Text mt={3} color="#374151">
      {resort.outline?.description.short}
    </Text>
    <Grid
      mt={4}
      templateColumns="repeat(3, 1fr)"
      gap={{ base: 2, md: 4 }}
      textAlign="center"
    >
      <StatCard title="❄️ 雪の状態" value={resort.outline?.condition || "--"} />
      <StatCard title="🈺 営業状況" value={resort.outline?.status || "--"} />
      <StatCard title="⭐️ 評価" value={resort.outline?.review || "--"} />
    </Grid>
  </Box>
);

const OverviewTab = ({ resort }: { resort: SkiResortT }) => (
  <Flex flexDirection="column" gap={8}>
    <Box as="section">
      <Heading size="lg">📝 概要</Heading>
      <Text mt={2} whiteSpace="pre-wrap" color="#1f2937">
        {resort.outline?.description.long}
      </Text>
    </Box>
    <Box as="section">
      <Heading size="lg">🕒 営業時間</Heading>
      <Box mt={2} w="100%" overflowX="auto" borderRadius="lg">
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg="#f3f4f6">
              <Table.ColumnHeader
                px={4}
                py={3}
                textAlign="left"
                fontSize="xs"
                fontWeight="medium"
                textTransform="uppercase"
                letterSpacing="wider"
                color="#6b7280"
              >
                曜日
              </Table.ColumnHeader>
              <Table.ColumnHeader
                px={4}
                py={3}
                textAlign="left"
                fontSize="xs"
                fontWeight="medium"
                textTransform="uppercase"
                letterSpacing="wider"
                color="#6b7280"
              >
                営業時間
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell
                px={4}
                py={3}
                whiteSpace="nowrap"
                fontSize="sm"
                fontWeight="medium"
                color="#111827"
              >
                平日
              </Table.Cell>
              <Table.Cell
                px={4}
                py={3}
                whiteSpace="nowrap"
                fontSize="sm"
                color="#6b7280"
              >{`${resort.times.weekday.open} - ${resort.times.weekday.close}`}</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell
                px={4}
                py={3}
                whiteSpace="nowrap"
                fontSize="sm"
                fontWeight="medium"
                color="#111827"
              >
                週末・祝日
              </Table.Cell>
              <Table.Cell
                px={4}
                py={3}
                whiteSpace="nowrap"
                fontSize="sm"
                color="#6b7280"
              >{`${resort.times.weekend.open} - ${resort.times.weekend.close}`}</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Box>
      {resort.times.comment && (
        <Text mt={2} fontSize="sm" color="#4b5563">
          {resort.times.comment}
        </Text>
      )}
    </Box>
    {resort.yukiMagi?.available && (
      <Box as="section">
        <Heading size="lg">🎫 雪マジ！</Heading>
        <Text mt={1} color="#374151">
          {resort.yukiMagi.info}
        </Text>
        {resort.yukiMagi.notes && (
          <Text mt={1} fontSize="sm" color="#4b5563">
            {resort.yukiMagi.notes}
          </Text>
        )}
      </Box>
    )}
    <Box as="section">
      <Heading size="lg">🔗 関連リンク</Heading>
      <List.Root
        as="ul"
        mt={2}
        listStyleType="disc"
        pl={4}
        gap={1}
        color="#0284c7"
      >
        {resort.others.website && (
          <List.Item as="li">
            <Link
              href={resort.others.website}
              target="_blank"
              rel="noopener noreferrer"
              _hover={{ textDecoration: "underline" }}
            >
              公式サイト
            </Link>
          </List.Item>
        )}
        {resort.others.sources.map(src => (
          <List.Item key={src} as="li">
            <Link
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              _hover={{ textDecoration: "underline" }}
            >
              {new URL(src).hostname}
            </Link>
          </List.Item>
        ))}
      </List.Root>
    </Box>
  </Flex>
);

const CoursesTab = ({ resort }: { resort: SkiResortT }) => {
  const c = resort.courses;
  const [difficultyFilter, setDifficultyFilter] = useState("全て");
  const [sortConfig, setSortConfig] = useState<{
    key: "distance";
    direction: "asc" | "desc";
  } | null>(null);

  const difficultyOptions = useMemo(
    () => [
      "全て",
      ...Array.from(new Set(c.details?.map(d => d.difficulty) || [])),
    ],
    [c.details],
  );

  const processedCourses = useMemo(() => {
    let courses = c.details ? [...c.details] : [];
    if (difficultyFilter !== "全て") {
      courses = courses.filter(d => d.difficulty === difficultyFilter);
    }
    if (sortConfig !== null) {
      courses.sort((a, b) => {
        const aVal = a[sortConfig.key] || 0;
        const bVal = b[sortConfig.key] || 0;
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return courses;
  }, [c.details, difficultyFilter, sortConfig]);

  const handleSort = (key: "distance") => {
    setSortConfig(prev => ({
      key,
      direction: prev?.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <Flex flexDirection="column" gap={8}>
      <Box as="section">
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard title="🗺️ コース数" value={`${c.numberOfCourses}本`} />
          <StatCard
            title="📏 最長滑走"
            value={`${c.longestCourse.toLocaleString()}m`}
          />
          <StatCard
            title="📐 最大斜度"
            value={`${c.steepestSlope || c.angle?.max || "--"}°`}
          />
          <StatCard title="🏔️ 標高差" value={`${c.vertical}m`} />
        </Grid>
      </Box>
      <Box as="section">
        <Heading size="lg">レベル割合</Heading>
        <Flex
          mt={2}
          h={8}
          w="100%"
          overflow="hidden"
          borderRadius="full"
          bg="gray.200"
          fontSize="xs"
          fontWeight="bold"
          color="white"
        >
          <Flex
            w={`${Math.max(c.beginnersCoursesPercent, 15)}%`}
            minW="60px"
            bg="green.500"
            alignItems="center"
            justifyContent="center"
            title={`初級 ${c.beginnersCoursesPercent}%`}
          >
            初級 {c.beginnersCoursesPercent}%
          </Flex>
          <Flex
            w={`${Math.max(c.intermediateCoursesPercent, 15)}%`}
            minW="60px"
            bg="sky.500"
            alignItems="center"
            justifyContent="center"
            title={`中級 ${c.intermediateCoursesPercent}%`}
          >
            中級 {c.intermediateCoursesPercent}%
          </Flex>
          <Flex
            w={`${Math.max(c.advancedCoursesPercent, 15)}%`}
            minW="60px"
            bg="red.500"
            alignItems="center"
            justifyContent="center"
            title={`上級 ${c.advancedCoursesPercent}%`}
          >
            上級 {c.advancedCoursesPercent}%
          </Flex>
        </Flex>
      </Box>
      <Box as="section">
        <Flex
          flexDirection={{ base: "column", md: "row" }}
          gap={2}
          alignItems={{ md: "center" }}
          justifyContent={{ md: "space-between" }}
        >
          <Heading size="lg">コース一覧</Heading>
          <NativeSelect.Root w={{ base: "100%", md: "auto" }} size="sm">
            <NativeSelect.Field
              value={difficultyFilter}
              onChange={e => setDifficultyFilter(e.target.value)}
            >
              {difficultyOptions.map(opt => (
                <option key={opt}>{opt}</option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Flex>
        <Box mt={4} w="100%" overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row bg="#f3f4f6">
                <Table.ColumnHeader
                  px={4}
                  py={3}
                  textAlign="left"
                  fontSize="xs"
                  fontWeight="medium"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color="#6b7280"
                  whiteSpace="nowrap"
                >
                  コース名
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={4}
                  py={3}
                  textAlign="left"
                  fontSize="xs"
                  fontWeight="medium"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color="#6b7280"
                  whiteSpace="nowrap"
                >
                  レベル
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={4}
                  py={3}
                  textAlign="left"
                  fontSize="xs"
                  fontWeight="medium"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color="#6b7280"
                  whiteSpace="nowrap"
                >
                  <Button
                    onClick={() => handleSort("distance")}
                    variant="ghost"
                    display="flex"
                    alignItems="center"
                    gap={1}
                    cursor="pointer"
                    whiteSpace="nowrap"
                    p={0}
                    h="auto"
                    minW="auto"
                    fontWeight="medium"
                    fontSize="xs"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    color="#6b7280"
                  >
                    距離 (m){" "}
                    {sortConfig?.key === "distance" &&
                      (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </Button>
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={4}
                  py={3}
                  textAlign="left"
                  fontSize="xs"
                  fontWeight="medium"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color="#6b7280"
                  whiteSpace="nowrap"
                >
                  スノボ
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {processedCourses?.map(d => (
                <Table.Row key={d.name}>
                  <Table.Cell
                    px={4}
                    py={3}
                    whiteSpace="nowrap"
                    fontSize="sm"
                    fontWeight="medium"
                    color="#111827"
                  >
                    {d.name}
                  </Table.Cell>
                  <Table.Cell
                    px={4}
                    py={3}
                    whiteSpace="nowrap"
                    fontSize="sm"
                    color="#6b7280"
                  >
                    {d.difficulty}
                  </Table.Cell>
                  <Table.Cell
                    px={4}
                    py={3}
                    whiteSpace="nowrap"
                    fontSize="sm"
                    color="#6b7280"
                  >
                    {d.distance?.toLocaleString()}
                  </Table.Cell>
                  <Table.Cell
                    px={4}
                    py={3}
                    whiteSpace="nowrap"
                    fontSize="sm"
                    color="#6b7280"
                  >
                    {d.snowboard}
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

const LiftsTab = ({ resort }: { resort: SkiResortT }) => {
  const l = resort.lifts;
  const [typeFilter, setTypeFilter] = useState("全て");
  const [sortConfig, setSortConfig] = useState<{
    key: "distance";
    direction: "asc" | "desc";
  } | null>(null);

  const typeOptions = useMemo(
    () => ["全て", ...Array.from(new Set(l.details?.map(d => d.type) || []))],
    [l.details],
  );

  const processedLifts = useMemo(() => {
    let lifts = l.details ? [...l.details] : [];
    if (typeFilter !== "全て") {
      lifts = lifts.filter(d => d.type === typeFilter);
    }
    if (sortConfig !== null) {
      lifts.sort((a, b) => {
        const aVal = a[sortConfig.key] || 0;
        const bVal = b[sortConfig.key] || 0;
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return lifts;
  }, [l.details, typeFilter, sortConfig]);

  const handleSort = (key: "distance") => {
    setSortConfig(prev => ({
      key,
      direction: prev?.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <Flex flexDirection="column" gap={8}>
      <Box as="section">
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard title="🚡 総数" value={`${l.numberOfLifts}基`} />
          <StatCard title="🚠 ゴンドラ" value={`${l.gondolas}基`} />
          <StatCard title="4⃣ クアッドリフト" value={`${l.quadLifts}基`} />
          <StatCard title="2⃣ ペアリフト" value={`${l.pairLifts}基`} />
        </Grid>
      </Box>
      <Box as="section">
        <Flex
          flexDirection={{ base: "column", md: "row" }}
          gap={2}
          alignItems={{ md: "center" }}
          justifyContent={{ md: "space-between" }}
        >
          <Heading size="lg">リフト一覧</Heading>
          <NativeSelect.Root w={{ base: "100%", md: "auto" }} size="sm">
            <NativeSelect.Field
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              {typeOptions.map(opt => (
                <option key={opt}>{opt}</option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Flex>
        <Box mt={4} w="100%" overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row bg="#f3f4f6">
                <Table.ColumnHeader
                  px={4}
                  py={3}
                  textAlign="left"
                  fontSize="xs"
                  fontWeight="medium"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color="#6b7280"
                  whiteSpace="nowrap"
                >
                  リフト名
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={4}
                  py={3}
                  textAlign="left"
                  fontSize="xs"
                  fontWeight="medium"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color="#6b7280"
                >
                  種別
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={4}
                  py={3}
                  textAlign="left"
                  fontSize="xs"
                  fontWeight="medium"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color="#6b7280"
                  whiteSpace="nowrap"
                >
                  <Button
                    onClick={() => handleSort("distance")}
                    variant="ghost"
                    display="flex"
                    alignItems="center"
                    gap={1}
                    cursor="pointer"
                    whiteSpace="nowrap"
                    p={0}
                    h="auto"
                    minW="auto"
                    fontWeight="medium"
                    fontSize="xs"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    color="#6b7280"
                  >
                    距離 (m){" "}
                    {sortConfig?.key === "distance" &&
                      (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </Button>
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={4}
                  py={3}
                  textAlign="left"
                  fontSize="xs"
                  fontWeight="medium"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color="#6b7280"
                  whiteSpace="nowrap"
                >
                  フード
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {processedLifts?.map(lift => (
                <Table.Row key={lift.name}>
                  <Table.Cell
                    px={4}
                    py={3}
                    whiteSpace="nowrap"
                    fontSize="sm"
                    fontWeight="medium"
                    color="#111827"
                  >
                    {lift.name}
                  </Table.Cell>
                  <Table.Cell
                    px={4}
                    py={3}
                    whiteSpace="nowrap"
                    fontSize="sm"
                    color="#6b7280"
                  >
                    {lift.type}
                  </Table.Cell>
                  <Table.Cell
                    px={4}
                    py={3}
                    whiteSpace="nowrap"
                    fontSize="sm"
                    color="#6b7280"
                  >
                    {lift.distance?.toLocaleString()}
                  </Table.Cell>
                  <Table.Cell
                    px={4}
                    py={3}
                    whiteSpace="nowrap"
                    fontSize="sm"
                    color="#6b7280"
                  >
                    {lift.hood}
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

const TicketsTab = ({ resort }: { resort: SkiResortT }) => (
  <Box as="section">
    <Heading size="lg" mb={4}>
      チケット料金
    </Heading>
    <Box w="100%" overflowX="auto" borderRadius="lg">
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row bg="#f3f4f6">
            <Table.ColumnHeader
              px={4}
              py={3}
              textAlign="left"
              fontSize="xs"
              fontWeight="medium"
              textTransform="uppercase"
              letterSpacing="wider"
              color="#6b7280"
              whiteSpace="nowrap"
            >
              券種
            </Table.ColumnHeader>
            <Table.ColumnHeader
              px={4}
              py={3}
              textAlign="right"
              fontSize="xs"
              fontWeight="medium"
              textTransform="uppercase"
              letterSpacing="wider"
              color="#6b7280"
              whiteSpace="nowrap"
            >
              大人
            </Table.ColumnHeader>
            <Table.ColumnHeader
              px={4}
              py={3}
              textAlign="right"
              fontSize="xs"
              fontWeight="medium"
              textTransform="uppercase"
              letterSpacing="wider"
              color="#6b7280"
              whiteSpace="nowrap"
            >
              子供
            </Table.ColumnHeader>
            <Table.ColumnHeader
              px={4}
              py={3}
              textAlign="right"
              fontSize="xs"
              fontWeight="medium"
              textTransform="uppercase"
              letterSpacing="wider"
              color="#6b7280"
              whiteSpace="nowrap"
            >
              シニア
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {resort.tickets.map(t => (
            <Table.Row key={t.name}>
              <Table.Cell
                px={4}
                py={3}
                whiteSpace="nowrap"
                fontSize="sm"
                fontWeight="medium"
                color="#111827"
              >
                {t.name}
              </Table.Cell>
              <Table.Cell
                px={4}
                py={3}
                whiteSpace="nowrap"
                fontSize="sm"
                color="#6b7280"
                textAlign="right"
              >
                {t.prices.adult?.toLocaleString() || "--"} 円
              </Table.Cell>
              <Table.Cell
                px={4}
                py={3}
                whiteSpace="nowrap"
                fontSize="sm"
                color="#6b7280"
                textAlign="right"
              >
                {t.prices.child?.toLocaleString() ||
                  t.prices.olderChild?.toLocaleString() ||
                  "--"}{" "}
                円
              </Table.Cell>
              <Table.Cell
                px={4}
                py={3}
                whiteSpace="nowrap"
                fontSize="sm"
                color="#6b7280"
                textAlign="right"
              >
                {t.prices.senior?.toLocaleString() || "--"} 円
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  </Box>
);

const WeatherTab = ({
  weathers,
  forecasts,
  snowDepths,
}: {
  weathers?: WeathersT;
  forecasts?: ForecastsT;
  snowDepths?: SnowDepthsT;
}) => {
  return (
    <Flex flexDirection="column" gap={8}>
      {weathers && (
        <Box as="section">
          <Heading size="lg">📈 直近の天気</Heading>
          <ForecastTable weathers={weathers} />
        </Box>
      )}
      {forecasts && (
        <Box as="section">
          <Heading size="lg">📊 過去の気象データ（週単位）</Heading>
          <WeeklyWeatherChart forecasts={forecasts} />
        </Box>
      )}
      {snowDepths && (
        <Box as="section">
          <Heading size="lg">❄️ 積雪の分布</Heading>
          <SnowDepthLineChart snowDepths={snowDepths} />
        </Box>
      )}
    </Flex>
  );
};

const StatCard = ({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) => (
  <Flex
    h="100%"
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    borderRadius="lg"
    bg="#f3f4f6"
    p={{ base: 2, md: 3 }}
    textAlign="center"
  >
    <Text fontSize={{ base: "xs", md: "sm" }} color="#6b7280">
      {title}
    </Text>
    <Text
      mt={1}
      fontSize={{ base: "md", md: "lg" }}
      fontWeight="bold"
      color="#1f2937"
    >
      {value}
    </Text>
  </Flex>
);
