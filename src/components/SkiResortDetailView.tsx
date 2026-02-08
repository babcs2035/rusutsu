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

  if (isLoading || !resortData) {
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
          bg="#f9fafb"
          boxShadow="2xl"
          borderRadius={{ md: "2xl" }}
        >
          <LoadingSpinner text="詳細情報を読み込んでいます..." />
        </MotionBox>
      </Flex>
    );
  }

  const resort = resortData;

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
            {activeTab === "気候" && <WeatherTab resort={resort} />}
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
  <Box bg="white" p={{ base: 4, md: 6 }}>
    <Heading size="2xl">{resort.nameJa}</Heading>
    <Text mt={1} fontSize="sm" color="#6b7280">
      {resort.prefecture} {resort.town}
    </Text>
    <Text mt={3} color="#374151">
      {resort.descriptionShort}
    </Text>
    <Grid
      mt={4}
      templateColumns={{
        base: "repeat(2, 1fr)",
        md: resort.yukiMagi ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
      }}
      gap={{ base: 2, md: 4 }}
      textAlign="center"
    >
      <StatCard title="❄️ 雪の状態" value={resort.condition || "--"} />
      <StatCard title="🈺 営業状況" value={resort.status || "--"} />
      <StatCard title="⭐️ 評価" value={resort.review?.toFixed(1) || "--"} />
      {resort.yukiMagi && (
        <StatCard title="🎫 雪マジ" value="対応" valueColor="pink.600" />
      )}
    </Grid>
  </Box>
);

const OverviewTab = ({ resort }: { resort: Resort }) => (
  <Flex flexDirection="column" gap={8}>
    {resort.yukiMagi && (
      <Box
        as="section"
        bg="pink.50"
        p={4}
        borderRadius="xl"
        border="1px solid"
        borderColor="pink.100"
      >
        <Flex alignItems="center" gap={2} mb={3}>
          <Heading size="md" color="pink.700">
            🎫 雪マジ情報
          </Heading>
          {resort.yukiMagi.tag && (
            <Box
              px={2}
              py={0.5}
              bg="pink.600"
              color="white"
              fontSize="xs"
              fontWeight="bold"
              borderRadius="md"
            >
              {resort.yukiMagi.tag}
            </Box>
          )}
        </Flex>

        <Flex flexDirection="column" gap={3}>
          {resort.yukiMagi.benefit && (
            <Box>
              <Text fontWeight="bold" fontSize="sm" color="pink.800">
                🎁 特典内容
              </Text>
              <Text fontSize="sm" color="pink.900" whiteSpace="pre-wrap">
                {resort.yukiMagi.benefit}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.period && (
            <Box>
              <Text fontWeight="bold" fontSize="sm" color="pink.800">
                🕒 対象期間・時間
              </Text>
              <Text fontSize="sm" color="pink.900" whiteSpace="pre-wrap">
                {resort.yukiMagi.period}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.exclusionDate && (
            <Box>
              <Text fontWeight="bold" fontSize="sm" color="pink.800">
                🚫 除外日
              </Text>
              <Text fontSize="sm" color="pink.900" whiteSpace="pre-wrap">
                {resort.yukiMagi.exclusionDate}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.url && (
            <Link
              href={resort.yukiMagi.url}
              target="_blank"
              fontSize="xs"
              color="pink.600"
              textDecoration="underline"
              _hover={{ color: "pink.700" }}
            >
              詳細（雪マジ！公式サイト）で確認
            </Link>
          )}
        </Flex>
      </Box>
    )}
    <Box as="section">
      <Heading size="lg">📝 概要</Heading>
      <Text mt={2} whiteSpace="pre-wrap" color="#1f2937">
        {resort.descriptionLong}
      </Text>
    </Box>
    <Box as="section">
      <Heading size="lg">🕒 営業時間</Heading>
      <Box mt={2} w="100%" overflowX="auto" borderRadius="lg">
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg="#f3f4f6">
              <Table.ColumnHeader px={4} py={3} color="#6b7280">
                曜日
              </Table.ColumnHeader>
              <Table.ColumnHeader px={4} py={3} color="#6b7280">
                営業時間
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell px={4} py={3} fontWeight="medium" color="#111827">
                平日
              </Table.Cell>
              <Table.Cell px={4} py={3} color="#6b7280">
                {resort.weekdayOpen} - {resort.weekdayClose}
              </Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell px={4} py={3} fontWeight="medium" color="#111827">
                週末・祝日
              </Table.Cell>
              <Table.Cell px={4} py={3} color="#6b7280">
                {resort.weekendOpen} - {resort.weekendClose}
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Box>
      {resort.timesComment && (
        <Text mt={2} fontSize="sm" color="#4b5563">
          {resort.timesComment}
        </Text>
      )}
    </Box>

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
        {resort.website && (
          <List.Item as="li">
            <Link
              href={resort.website}
              target="_blank"
              rel="noopener noreferrer"
              _hover={{ textDecoration: "underline" }}
            >
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
    <Flex flexDirection="column" gap={8}>
      <Box as="section">
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard title="🗺️ コース数" value={`${resort.numberOfCourses}本`} />
          <StatCard
            title="📏 最長滑走"
            value={`${resort.longestCourse?.toLocaleString()}m`}
          />
          <StatCard
            title="📐 最大斜度"
            value={`${resort.steepestSlope || resort.angleMax || "--"}°`}
          />
          <StatCard title="🏔️ 標高差" value={`${resort.verticalDrop}m`} />
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
            w={`${Math.max(resort.beginnersCoursesPercent, 15)}%`}
            minW="60px"
            bg="green.500"
            alignItems="center"
            justifyContent="center"
          >
            初級 {resort.beginnersCoursesPercent}%
          </Flex>
          <Flex
            w={`${Math.max(resort.intermediateCoursesPercent, 15)}%`}
            minW="60px"
            bg="sky.500"
            alignItems="center"
            justifyContent="center"
          >
            中級 {resort.intermediateCoursesPercent}%
          </Flex>
          <Flex
            w={`${Math.max(resort.advancedCoursesPercent, 15)}%`}
            minW="60px"
            bg="red.500"
            alignItems="center"
            justifyContent="center"
          >
            上級 {resort.advancedCoursesPercent}%
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
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  コース名
                </Table.ColumnHeader>
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  レベル
                </Table.ColumnHeader>
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  <Button
                    onClick={() => handleSort("distance")}
                    variant="ghost"
                    p={0}
                    h="auto"
                    minW="auto"
                    color="#6b7280"
                  >
                    距離 (m){" "}
                    {sortConfig?.key === "distance" &&
                      (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </Button>
                </Table.ColumnHeader>
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  スノボ
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {processedCourses.map(c => (
                <Table.Row key={c.id}>
                  <Table.Cell px={4} py={3} fontWeight="medium" color="#111827">
                    {c.name}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="#6b7280">
                    {c.difficulty}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="#6b7280">
                    {c.distance?.toLocaleString()}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="#6b7280">
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
    <Flex flexDirection="column" gap={8}>
      <Box as="section">
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard title="🚡 総数" value={`${resort.numberOfLifts}基`} />
          <StatCard title="🚠 ゴンドラ" value={`${resort.gondolas}基`} />
          <StatCard title="4⃣ クアッド" value={`${resort.quadLifts}基`} />
          <StatCard title="2⃣ ペア" value={`${resort.pairLifts}基`} />
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
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  リフト名
                </Table.ColumnHeader>
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  タイプ
                </Table.ColumnHeader>
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  距離 (m)
                </Table.ColumnHeader>
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  フード
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {processedLifts.map(l => (
                <Table.Row key={l.id}>
                  <Table.Cell px={4} py={3} fontWeight="medium" color="#111827">
                    {l.name}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="#6b7280">
                    {l.type}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="#6b7280">
                    {l.distance?.toLocaleString()}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="#6b7280">
                    {l.hood}
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
    <Flex flexDirection="column" gap={8}>
      <Box as="section">
        <Heading size="lg">🎟️ リフト券料金</Heading>
        <Box mt={4} w="100%" overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row bg="#f3f4f6">
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  チケット名
                </Table.ColumnHeader>
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  大人
                </Table.ColumnHeader>
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  子供
                </Table.ColumnHeader>
                <Table.ColumnHeader px={4} py={3} color="#6b7280">
                  シニア
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {tickets.map(t => (
                <Table.Row key={t.id}>
                  <Table.Cell px={4} py={3} fontWeight="medium" color="#111827">
                    {t.name}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="#6b7280">
                    {t.priceAdult ? `¥${t.priceAdult.toLocaleString()}` : "-"}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="#6b7280">
                    {t.priceChild ? `¥${t.priceChild.toLocaleString()}` : "-"}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="#6b7280">
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
    <div className="space-y-12">
      {weathersFormatted && (
        <Box as="section">
          <Heading size="lg" mb={4}>
            📈 直近の天気
          </Heading>
          <ForecastTable weathers={weathersFormatted} />
        </Box>
      )}

      {forecastsFormatted && (
        <Box as="section">
          <Heading size="lg" mb={4}>
            📊 過去の気象データ（週単位）
          </Heading>
          <WeeklyWeatherChart forecasts={forecastsFormatted} />
        </Box>
      )}

      {snowDepthsFormatted && (
        <Box as="section">
          <Heading size="lg" mb={4}>
            ❄️ 積雪の分布
          </Heading>
          <SnowDepthLineChart snowDepths={snowDepthsFormatted} />
        </Box>
      )}

      {!weathersFormatted && !forecastsFormatted && !snowDepthsFormatted && (
        <Box textAlign="center" py={10} color="gray.500">
          <Text fontSize="lg">気象情報は利用できません。</Text>
        </Box>
      )}
    </div>
  );
};

const StatCard = ({
  title,
  value,
  valueColor = "#111827",
}: {
  title: string;
  value: string | number;
  valueColor?: string;
}) => (
  <Box p={{ base: 2, md: 3 }} borderRadius="lg" bg="#f3f4f6">
    <Text fontSize="xs" color="#6b7280">
      {title}
    </Text>
    <Text
      fontWeight="bold"
      fontSize={{ base: "md", md: "lg" }}
      color={valueColor}
    >
      {value}
    </Text>
  </Box>
);
