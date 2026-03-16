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
  Portal,
  Table,
  Text,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { getSkiResortById } from "@/actions/skiResorts";
import type { ForecastData, ForecastsT } from "@/types/forecasts";
import type { SnowDepthsT, WeatherData, WeathersT } from "@/types/weathers";
import { LoadingSpinner } from "./LoadingSpinner";
import {
  ForecastTable,
  SnowDepthLineChart,
  WeeklyWeatherChart,
} from "./WeatherChart";

type ResortData = Awaited<ReturnType<typeof getSkiResortById>>;

type Props = {
  resortId: string;
  resortData: ResortData | null;
  isLoading: boolean;
  onClose: () => void;
};

const TABS = ["概要", "コース", "リフト", "チケット", "気候"];

const MotionBox = motion.create(Box);

/**
 * スキー場の詳細情報を表示するレスポンシブ対応モーダル
 */
export const SkiResortDetailView = ({
  resortId: _resortId,
  resortData,
  isLoading,
  onClose,
}: Props) => {
  const [activeTab, setActiveTab] = useState(TABS[0]);

  // モーダル表示時にスクロールを防止
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  if (isLoading || !resortData) {
    return (
      <Portal>
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
            bg="rgba(0, 0, 0, 0.7)"
            backdropFilter="blur(10px)"
            aria-hidden="true"
          />
          <MotionBox
            variants={{
              hidden: { opacity: 0, scale: 0.95, y: 20 },
              visible: { opacity: 1, scale: 1, y: 0 },
            }}
            initial="hidden"
            animate="visible"
            exit="hidden"
            position="relative"
            zIndex={10}
            display="flex"
            h={{ base: "100%", md: "90vh" }}
            maxH={{ md: "800px" }}
            w={{ base: "100%", md: "90vw" }}
            maxW={{ md: "4xl" }}
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            overflow="hidden"
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            boxShadow="2xl"
            borderRadius={{ base: "0", md: "2xl" }}
          >
            <LoadingSpinner text="読み込み中..." />
          </MotionBox>
        </Flex>
      </Portal>
    );
  }

  const resort = resortData;

  return (
    <Portal>
      <Flex
        position="fixed"
        inset={0}
        zIndex={100000}
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
          bg="rgba(0, 0, 0, 0.7)"
          backdropFilter="blur(10px)"
          aria-hidden="true"
        />
        <MotionBox
          variants={{
            hidden: { opacity: 0, scale: 0.95, y: 20 },
            visible: { opacity: 1, scale: 1, y: 0 },
          }}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          position="relative"
          zIndex={10}
          display="flex"
          h={{ base: "100%", md: "90vh" }}
          maxH={{ md: "800px" }}
          w={{ base: "100%", md: "90vw" }}
          maxW={{ md: "4xl" }}
          flexDirection="column"
          overflow="hidden"
          bg="white"
          border="1px solid"
          borderColor="gray.200"
          boxShadow="2xl"
          borderRadius={{ base: "0", md: "2xl" }}
        >
          <Button
            onClick={onClose}
            position="absolute"
            top={4}
            right={4}
            zIndex={20}
            display="flex"
            h={10}
            w={10}
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            fontSize="xl"
            color="gray.600"
            boxShadow="sm"
            _hover={{
              bg: "gray.50",
              color: "gray.900",
              transform: "scale(1.05)",
            }}
            _focus={{ outline: "none", ring: "2px", ringColor: "brand.400" }}
            minW="auto"
            p={0}
            transition="all 0.2s"
          >
            ✕
          </Button>
          <Box flexGrow={1} overflowY="auto" className="custom-scroll">
            <ImageCarousel
              images={[
                ...(resort.outlineImages || []),
                ...(resort.courseImages || []),
              ]}
              alt={resort.nameJa}
            />
            <InfoSection resort={resort} />
            <Flex
              as="nav"
              position="sticky"
              top={0}
              zIndex={10}
              borderBottom="1px solid"
              borderColor="gray.100"
              bg="rgba(255, 255, 255, 0.95)"
              backdropFilter="blur(16px)"
              overflowX="auto"
              css={{
                "&::-webkit-scrollbar": { display: "none" },
                msOverflowStyle: "none",
                scrollbarWidth: "none",
              }}
            >
              {TABS.map(tab => (
                <Button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  flex={{ base: "0 0 auto", md: 1 }}
                  minW={{ base: "80px", md: "unset" }}
                  py={4}
                  px={{ base: 4, md: 2 }}
                  textAlign="center"
                  fontSize={{ base: "sm", md: "md" }}
                  fontWeight="700"
                  bg="transparent"
                  borderRadius={0}
                  borderBottom={activeTab === tab ? "2px solid" : "none"}
                  borderColor={activeTab === tab ? "brand.500" : "transparent"}
                  color={activeTab === tab ? "brand.600" : "gray.500"}
                  _hover={{ bg: "gray.50", color: "brand.600" }}
                  transition="all 0.2s"
                >
                  {tab}
                </Button>
              ))}
            </Flex>
            <Box p={{ base: 4, md: 8 }} color="gray.800">
              {activeTab === "概要" && <OverviewTab resort={resort} />}
              {activeTab === "コース" && <CoursesTab resort={resort} />}
              {activeTab === "リフト" && <LiftsTab resort={resort} />}
              {activeTab === "チケット" && <TicketsTab resort={resort} />}
              {activeTab === "気候" && <WeatherTab resort={resort} />}
            </Box>
          </Box>
        </MotionBox>
      </Flex>
    </Portal>
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
        {images.map((src: string) => (
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

type Resort = NonNullable<ResortData>;

const InfoSection = ({ resort }: { resort: Resort }) => (
  <Box
    bg="transparent"
    p={{ base: 4, md: 8 }}
    borderBottom="1px solid"
    borderColor="gray.200"
  >
    <Heading size="3xl" color="gray.900" fontFamily="var(--font-heading)">
      {resort.nameJa}
    </Heading>
    <Text mt={2} fontSize="sm" color="brand.600" fontWeight="700">
      {resort.prefecture} • {resort.town}
    </Text>
    <Text
      mt={4}
      color="gray.600"
      fontSize="md"
      lineHeight="1.6"
      w={{ base: "100%", md: "80%" }}
    >
      {resort.descriptionShort}
    </Text>
    <Grid
      mt={8}
      templateColumns={{
        base: "repeat(2, 1fr)",
        md: resort.yukiMagi ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
      }}
      gap={{ base: 3, md: 5 }}
      textAlign="center"
    >
      <StatCard title="コンディション" value={resort.condition || "--"} />
      <StatCard title="営業状況" value={resort.status || "--"} />
      <StatCard title="評価" value={resort.review?.toFixed(1) || "--"} />
      {resort.yukiMagi && (
        <StatCard title="雪マジ" value="対象" valueColor="pink.500" />
      )}
    </Grid>
  </Box>
);

const OverviewTab = ({ resort }: { resort: Resort }) => (
  <Flex flexDirection="column" gap={10}>
    {resort.yukiMagi && (
      <Box
        as="section"
        bg="pink.50"
        p={6}
        borderRadius="2xl"
        border="1px solid"
        borderColor="pink.200"
      >
        <Flex alignItems="center" gap={3} mb={4}>
          <Heading size="md" color="pink.600" fontWeight="700">
            雪マジ！情報
          </Heading>
          {resort.yukiMagi.tag && (
            <Box
              px={3}
              py={1}
              bg="pink.100"
              color="pink.700"
              fontSize="xs"
              fontWeight="bold"
              borderRadius="full"
            >
              {resort.yukiMagi.tag}
            </Box>
          )}
        </Flex>

        <Flex flexDirection="column" gap={4}>
          {resort.yukiMagi.benefit && (
            <Box>
              <Text fontWeight="700" fontSize="xs" color="pink.700">
                特典内容
              </Text>
              <Text mt={1} fontSize="sm" color="gray.800" whiteSpace="pre-wrap">
                {resort.yukiMagi.benefit}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.period && (
            <Box>
              <Text fontWeight="700" fontSize="xs" color="pink.700">
                利用期間
              </Text>
              <Text mt={1} fontSize="sm" color="gray.800" whiteSpace="pre-wrap">
                {resort.yukiMagi.period}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.exclusionDate && (
            <Box>
              <Text fontWeight="700" fontSize="xs" color="pink.700">
                除外日
              </Text>
              <Text mt={1} fontSize="sm" color="gray.800" whiteSpace="pre-wrap">
                {resort.yukiMagi.exclusionDate}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.url && (
            <Link
              href={resort.yukiMagi.url}
              target="_blank"
              fontSize="xs"
              color="brand.600"
              textDecoration="underline"
              _hover={{
                color: "brand.700",
              }}
              display="inline-block"
              mt={2}
            >
              公式サイトで詳細を見る
            </Link>
          )}
        </Flex>
      </Box>
    )}
    <Box as="section">
      <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
        概要
      </Heading>
      <Text
        mt={4}
        whiteSpace="pre-wrap"
        color="gray.700"
        lineHeight="1.8"
        fontSize="md"
      >
        {resort.descriptionLong}
      </Text>
    </Box>
    <Box as="section">
      <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
        営業時間
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
              <Table.ColumnHeader
                px={6}
                py={4}
                color="gray.600"
                fontWeight="700"
                fontSize="sm"
              >
                区分
              </Table.ColumnHeader>
              <Table.ColumnHeader
                px={6}
                py={4}
                color="gray.600"
                fontWeight="700"
                fontSize="sm"
              >
                時間
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row borderColor="gray.200">
              <Table.Cell px={6} py={4} fontWeight="700" color="gray.800">
                平日
              </Table.Cell>
              <Table.Cell px={6} py={4} color="gray.600">
                {resort.weekdayOpen} - {resort.weekdayClose}
              </Table.Cell>
            </Table.Row>
            <Table.Row borderColor="transparent">
              <Table.Cell px={6} py={4} fontWeight="700" color="gray.800">
                土日祝
              </Table.Cell>
              <Table.Cell px={6} py={4} color="gray.600">
                {resort.weekendOpen} - {resort.weekendClose}
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Box>
      {resort.timesComment && (
        <Text mt={3} fontSize="sm" color="gray.500" fontStyle="italic">
          * {resort.timesComment}
        </Text>
      )}
    </Box>

    <Box as="section">
      <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
        リンク
      </Heading>
      <List.Root as="ul" mt={4} listStyleType="none" gap={3}>
        {resort.website && (
          <List.Item as="li">
            <Link
              href={resort.website}
              target="_blank"
              rel="noopener noreferrer"
              color="brand.600"
              display="flex"
              alignItems="center"
              gap={2}
              _hover={{
                color: "brand.700",
                textDecoration: "underline",
              }}
              transition="all 0.2s"
            >
              <Box as="span" h={2} w={2} borderRadius="full" bg="brand.500" />{" "}
              公式サイト
            </Link>
          </List.Item>
        )}
        {resort.sources.map((src: string) => (
          <List.Item key={src} as="li">
            <Link
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              color="gray.600"
              display="flex"
              alignItems="center"
              gap={2}
              _hover={{ color: "brand.600", textDecoration: "underline" }}
              transition="all 0.2s"
            >
              <Box as="span" h={2} w={2} borderRadius="full" bg="gray.400" />{" "}
              {new URL(src).hostname}
            </Link>
          </List.Item>
        ))}
      </List.Root>
    </Box>
  </Flex>
);

const CoursesTab = ({ resort }: { resort: Resort }) => {
  const courses = resort.courses;
  const [difficultyFilter, setDifficultyFilter] = useState("全て");
  const [sortConfig, setSortConfig] = useState<{
    key: "distance";
    direction: "asc" | "desc";
  } | null>(null);

  const difficultyOptions = useMemo(
    () => [
      "全て",
      ...Array.from(
        new Set(courses.map(c => c.difficulty).filter(Boolean) as string[]),
      ),
    ],
    [courses],
  );

  const processedCourses = useMemo(() => {
    let filtered = [...courses];
    if (difficultyFilter !== "全て") {
      filtered = filtered.filter(c => c.difficulty === difficultyFilter);
    }
    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        const aVal = a[sortConfig.key] || 0;
        const bVal = b[sortConfig.key] || 0;
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [courses, difficultyFilter, sortConfig]);

  const handleSort = (key: "distance") => {
    setSortConfig(prev => ({
      key,
      direction: prev?.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <Flex flexDirection="column" gap={10}>
      <Box as="section">
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard title="総コース数" value={`${resort.numberOfCourses}`} />
          <StatCard
            title="最長滑走距離"
            value={`${resort.longestCourse?.toLocaleString() || "--"}m`}
          />
          <StatCard
            title="最大斜度"
            value={`${resort.steepestSlope || resort.angleMax || "--"}°`}
          />
          <StatCard title="標高差" value={`${resort.verticalDrop}m`} />
        </Grid>
      </Box>
      <Box as="section">
        <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
          レベル別割合
        </Heading>
        <Flex
          mt={5}
          h={6}
          w="100%"
          overflow="hidden"
          borderRadius="full"
          bg="gray.100"
          border="1px solid"
          borderColor="gray.200"
          fontSize="xs"
          fontWeight="700"
          color="white"
        >
          <Flex
            w={`${Math.max(resort.beginnersCoursesPercent, 5)}%`}
            bg="green.500"
            alignItems="center"
            justifyContent="center"
            display={resort.beginnersCoursesPercent > 0 ? "flex" : "none"}
          >
            {resort.beginnersCoursesPercent}%
          </Flex>
          <Flex
            w={`${Math.max(resort.intermediateCoursesPercent, 5)}%`}
            bg="blue.500"
            alignItems="center"
            justifyContent="center"
            display={resort.intermediateCoursesPercent > 0 ? "flex" : "none"}
          >
            {resort.intermediateCoursesPercent}%
          </Flex>
          <Flex
            w={`${Math.max(resort.advancedCoursesPercent, 5)}%`}
            bg="red.500"
            alignItems="center"
            justifyContent="center"
            display={resort.advancedCoursesPercent > 0 ? "flex" : "none"}
          >
            {resort.advancedCoursesPercent}%
          </Flex>
        </Flex>
        <Flex
          justifyContent="center"
          gap={6}
          mt={3}
          fontSize="sm"
          color="gray.600"
        >
          <Flex alignItems="center" gap={2}>
            <Box w={3} h={3} borderRadius="full" bg="green.500" /> 初級
          </Flex>
          <Flex alignItems="center" gap={2}>
            <Box w={3} h={3} borderRadius="full" bg="blue.500" /> 中級
          </Flex>
          <Flex alignItems="center" gap={2}>
            <Box w={3} h={3} borderRadius="full" bg="red.500" /> 上級
          </Flex>
        </Flex>
      </Box>
      <Box as="section">
        <Flex
          flexDirection={{ base: "column", md: "row" }}
          gap={4}
          alignItems={{ md: "center" }}
          justifyContent={{ md: "space-between" }}
        >
          <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
            コース一覧
          </Heading>
          <NativeSelect.Root
            w={{ base: "100%", md: "200px" }}
            size="md"
            variant="outline"
          >
            <NativeSelect.Field
              value={difficultyFilter}
              onChange={e => setDifficultyFilter(e.target.value)}
              bg="white"
              color="gray.800"
              borderColor="gray.200"
              _focus={{ borderColor: "brand.500" }}
            >
              {difficultyOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt === "全て" ? "すべての難易度" : opt}
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
                  コース名
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  難易度
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  <Button
                    onClick={() => handleSort("distance")}
                    variant="ghost"
                    p={0}
                    h="auto"
                    minW="auto"
                    color="gray.600"
                    _hover={{ color: "brand.600" }}
                  >
                    距離 (m){" "}
                    {sortConfig?.key === "distance" &&
                      (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </Button>
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  スノボ
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {processedCourses.map(c => (
                <Table.Row
                  key={c.id}
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
                    {c.name}
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
                      {c.difficulty}
                    </Box>
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.700"
                    fontFamily="mono"
                    whiteSpace="nowrap"
                  >
                    {c.distance?.toLocaleString() || "--"}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.700"
                    whiteSpace="nowrap"
                  >
                    {c.snowboard}
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

const LiftsTab = ({ resort }: { resort: Resort }) => {
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

const TicketsTab = ({ resort }: { resort: Resort }) => {
  const tickets = resort.tickets;

  return (
    <Flex flexDirection="column" gap={10}>
      <Box as="section">
        <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
          リフト券
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
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  券種
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  大人
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  子供
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  シニア
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {tickets.map(t => (
                <Table.Row
                  key={t.id}
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
                    {t.name}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.800"
                    fontFamily="mono"
                    fontWeight="700"
                    whiteSpace="nowrap"
                  >
                    {t.priceAdult ? `¥${t.priceAdult.toLocaleString()}` : "-"}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.800"
                    fontFamily="mono"
                    fontWeight="700"
                    whiteSpace="nowrap"
                  >
                    {t.priceChild ? `¥${t.priceChild.toLocaleString()}` : "-"}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.800"
                    fontFamily="mono"
                    fontWeight="700"
                    whiteSpace="nowrap"
                  >
                    {t.priceSenior ? `¥${t.priceSenior.toLocaleString()}` : "-"}
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

const WeatherTab = ({ resort }: { resort: Resort }) => {
  // --- Data Transformation Logic ---
  const weathersFormatted: WeathersT | undefined = useMemo(() => {
    const weather = resort.weathers?.[0];
    if (!weather) return undefined;

    return {
      meta: { date: weather.date },
      top: weather.topData as unknown as WeatherData,
      mid: weather.midData as unknown as WeatherData,
      bot: weather.botData as unknown as WeatherData,
    };
  }, [resort.weathers]);

  const forecastsFormatted: ForecastsT | undefined = useMemo(() => {
    const forecast = resort.forecasts?.[0];
    if (!forecast) return undefined;

    // biome-ignore lint/suspicious/noExplicitAny: DB JSON data structure
    const mapData = (json: any): ForecastData => ({
      temperatures: {
        weeks: {
          max: json?.temperatures?.all?.max || [],
          min: json?.temperatures?.all?.min || [],
        },
      },
      snowfalls: {
        snowfall: json?.snowfalls?.snowfall || [],
        significantSnowfall: json?.snowfalls?.significantSnowfall || [],
        significantRainfall: json?.snowfalls?.significantRainfall || [],
      },
      conditions: {
        bluebirdPowder: json?.conditions?.bluebirdPowder || [],
        powder: json?.conditions?.powder || [],
        bluebird: json?.conditions?.bluebird || [],
      },
    });

    return {
      meta: { date_start: forecast.dateStart || new Date().toISOString() },
      top: mapData(forecast.topData),
      middle: mapData(forecast.middleData),
      bottom: mapData(forecast.bottomData),
    };
  }, [resort.forecasts]);

  const snowDepthsFormatted: SnowDepthsT | undefined = useMemo(() => {
    const records = resort.snowDepths;
    if (!records || records.length === 0) return undefined;

    const seasons: Record<number, (number | null)[][]> = {};

    records.forEach(r => {
      const d = new Date(r.date);
      const m = d.getMonth() + 1;
      const day = d.getDate();
      let seasonYear = d.getFullYear();
      // December belongs to the next year's season grouping for visualization
      if (m === 12) seasonYear += 1;

      if (!seasons[seasonYear]) {
        // 5 months (Dec, Jan, Feb, Mar, Apr), ~32 days max
        seasons[seasonYear] = Array(5)
          .fill(null)
          .map(() => Array(32).fill(null));
      }

      // Map month to index: 1->0, 2->1, 3->2, 4->3, 12->4
      let mIdx = -1;
      if (m === 1) mIdx = 0;
      else if (m === 2) mIdx = 1;
      else if (m === 3) mIdx = 2;
      else if (m === 4) mIdx = 3;
      else if (m === 12) mIdx = 4;

      if (mIdx !== -1) {
        seasons[seasonYear][mIdx][day - 1] = r.depth;
      }
    });

    const years = Object.keys(seasons).map(Number);
    return {
      firstYear: Math.min(...years) || new Date().getFullYear(),
      data: Object.values(seasons),
    };
  }, [resort.snowDepths]);

  return (
    <Flex flexDirection="column" gap={10}>
      {weathersFormatted && (
        <Box as="section">
          <Heading
            size="lg"
            mb={6}
            fontFamily="var(--font-heading)"
            color="gray.900"
          >
            直近の天気
          </Heading>
          <ForecastTable weathers={weathersFormatted} />
        </Box>
      )}

      {forecastsFormatted && (
        <Box as="section">
          <Heading
            size="lg"
            mb={6}
            mt={4}
            fontFamily="var(--font-heading)"
            color="gray.900"
          >
            週間天気予報
          </Heading>
          <WeeklyWeatherChart forecasts={forecastsFormatted} />
        </Box>
      )}

      {snowDepthsFormatted && (
        <Box as="section">
          <Heading
            size="lg"
            mb={6}
            mt={4}
            fontFamily="var(--font-heading)"
            color="gray.900"
          >
            積雪量データ
          </Heading>
          <SnowDepthLineChart snowDepths={snowDepthsFormatted} />
        </Box>
      )}

      {!weathersFormatted && !forecastsFormatted && !snowDepthsFormatted && (
        <Flex justifyContent="center" alignItems="center" py={20}>
          <Text fontSize="lg" color="gray.500" fontFamily="var(--font-heading)">
            気象データがありません。
          </Text>
        </Flex>
      )}
    </Flex>
  );
};

const StatCard = ({
  title,
  value,
  valueColor = "gray.900",
}: {
  title: string;
  value: string | number;
  valueColor?: string;
}) => (
  <Box
    p={{ base: 2, sm: 3, md: 4 }}
    borderRadius="xl"
    bg="white"
    border="1px solid"
    borderColor="gray.200"
    boxShadow="sm"
    transition="all 0.3s ease"
    _hover={{
      transform: "translateY(-2px)",
      borderColor: "brand.500",
      boxShadow: "md",
    }}
  >
    <Text
      fontSize={{ base: "10px", sm: "xs" }}
      color="gray.500"
      fontWeight="700"
      whiteSpace="nowrap"
      overflow="hidden"
      textOverflow="ellipsis"
    >
      {title}
    </Text>
    <Text
      fontWeight="800"
      mt={1}
      fontSize={{ base: "md", sm: "lg", md: "2xl" }}
      color={valueColor}
      fontFamily="var(--font-heading)"
      lineHeight="1.2"
    >
      {value}
    </Text>
  </Box>
);
