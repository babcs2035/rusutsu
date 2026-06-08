"use client";

import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  Input,
  Text,
} from "@chakra-ui/react";
import {
  ChevronDown,
  ChevronUp,
  Filter,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { MapSkiResort } from "@/types/skiResorts";

type NumericFilterValue = number | null;
type NumericFilterName =
  | "minVertical"
  | "minBaseElevation"
  | "maxBaseElevation"
  | "minTopElevation"
  | "maxTopElevation"
  | "minCourses"
  | "minLifts";

export type Filters = {
  keyword: string;
  prefectures: string[];
  status: boolean;
  yukiMagi: boolean;
  beginnerFriendly: boolean;
  minVertical: NumericFilterValue;
  minBaseElevation: NumericFilterValue;
  maxBaseElevation: NumericFilterValue;
  minTopElevation: NumericFilterValue;
  maxTopElevation: NumericFilterValue;
  minCourses: NumericFilterValue;
  minLifts: NumericFilterValue;
};

export const DEFAULT_FILTERS: Filters = {
  keyword: "",
  prefectures: [],
  status: false,
  yukiMagi: false,
  beginnerFriendly: false,
  minVertical: null,
  minBaseElevation: null,
  maxBaseElevation: null,
  minTopElevation: null,
  maxTopElevation: null,
  minCourses: null,
  minLifts: null,
};

export const REGION_PREFECTURES: Record<string, string[]> = {
  "北海道・東北": [
    "北海道",
    "青森県",
    "岩手県",
    "秋田県",
    "宮城県",
    "山形県",
    "福島県",
  ],
  関東: [
    "茨城県",
    "栃木県",
    "群馬県",
    "埼玉県",
    "千葉県",
    "東京都",
    "神奈川県",
  ],
  中部: [
    "新潟県",
    "長野県",
    "富山県",
    "石川県",
    "福井県",
    "山梨県",
    "岐阜県",
    "静岡県",
    "愛知県",
  ],
  近畿: [
    "滋賀県",
    "京都府",
    "大阪府",
    "兵庫県",
    "奈良県",
    "和歌山県",
    "三重県",
  ],
  中国: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
  "四国・九州": [
    "徳島県",
    "香川県",
    "愛媛県",
    "高知県",
    "福岡県",
    "佐賀県",
    "長崎県",
    "熊本県",
    "大分県",
    "宮崎県",
    "鹿児島県",
    "沖縄県",
  ],
};

type Props = {
  filters: Filters;
  resorts: MapSkiResort[];
  resultCount: number;
  isExpanded: boolean;
  canCollapse?: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  onFilterChange: (newFilters: Filters) => void;
  onKeyboardInputBlur?: () => void;
  onKeyboardInputFocus?: () => void;
  onSearch: () => void;
  reserveHeaderActionSpace?: boolean;
  scrollContent?: boolean;
  showKeywordSearch?: boolean;
  title?: string;
};

type RegionOption = {
  region: string;
  prefectures: string[];
};

const MOBILE_BODY_FONT_SIZE = "0.875rem";
const MOBILE_COMPACT_FONT_SIZE = "0.8125rem";
const MOBILE_INPUT_FONT_SIZE = "1rem";
const MOBILE_NUMBER_INPUT_WIDTH = "3.25rem";

const hasNumericFilterValue = (
  value: NumericFilterValue | undefined,
): value is number => value != null;

const getPrefectureFilterLabel = (
  prefectures: string[],
  regionOptions: RegionOption[],
) => {
  const selectedPrefectures = new Set(prefectures);
  const groupedPrefectures = new Set<string>();
  const displayItems: string[] = [];

  regionOptions.forEach(({ region, prefectures: regionPrefectures }) => {
    const isRegionSelected = regionPrefectures.every(prefecture =>
      selectedPrefectures.has(prefecture),
    );

    if (!isRegionSelected) return;

    displayItems.push(`${region}地方`);
    regionPrefectures.forEach(prefecture => {
      groupedPrefectures.add(prefecture);
    });
  });

  prefectures.forEach(prefecture => {
    if (groupedPrefectures.has(prefecture)) return;

    displayItems.push(prefecture.replace(/[府県]$/, ""));
  });

  return displayItems.join(", ");
};

const getActiveFilterLabels = (
  filters: Filters,
  regionOptions: RegionOption[],
) => {
  const labels: string[] = [];
  if (filters.keyword.trim())
    labels.push(`キーワード: ${filters.keyword.trim()}`);
  if (filters.prefectures.length > 0) {
    labels.push(getPrefectureFilterLabel(filters.prefectures, regionOptions));
  }
  if (filters.yukiMagi) labels.push("雪マジ対象");
  if (filters.beginnerFriendly) labels.push("初級者向け");
  if (hasNumericFilterValue(filters.minVertical))
    labels.push(`標高差 ${filters.minVertical}m以上`);
  if (hasNumericFilterValue(filters.minBaseElevation))
    labels.push(`山麓標高 ${filters.minBaseElevation}m以上`);
  if (hasNumericFilterValue(filters.maxBaseElevation))
    labels.push(`山麓標高 ${filters.maxBaseElevation}m以下`);
  if (hasNumericFilterValue(filters.minTopElevation))
    labels.push(`山頂標高 ${filters.minTopElevation}m以上`);
  if (hasNumericFilterValue(filters.maxTopElevation))
    labels.push(`山頂標高 ${filters.maxTopElevation}m以下`);
  if (hasNumericFilterValue(filters.minCourses))
    labels.push(`コース ${filters.minCourses}本以上`);
  if (hasNumericFilterValue(filters.minLifts))
    labels.push(`リフト ${filters.minLifts}本以上`);
  return labels;
};

const ResultCountBadge = ({ count }: { count: number }) => (
  <Box
    as="span"
    display="inline-flex"
    alignItems="center"
    h={{ base: "30px", md: "26px" }}
    px={{ base: 3, md: 3 }}
    borderRadius="full"
    bg="brand.50"
    color="brand.700"
    fontSize={{ base: "1rem", md: "0.8rem" }}
    fontWeight="900"
    lineHeight="1"
    whiteSpace="nowrap"
  >
    {count.toLocaleString()}件
  </Box>
);

export const FilterPanel = ({
  filters,
  resorts,
  resultCount,
  isExpanded,
  onExpandedChange,
  onFilterChange,
  onKeyboardInputBlur,
  onKeyboardInputFocus,
  onSearch,
  reserveHeaderActionSpace = false,
  scrollContent = true,
  showKeywordSearch = true,
  title = "スキー場を検索",
}: Props) => {
  const [isElevationDetailOpen, setIsElevationDetailOpen] = useState(false);
  const keywordId = useId();
  const statusId = useId();
  const yukiMagiId = useId();
  const beginnerFriendlyId = useId();
  const minVerticalId = useId();
  const minBaseElevationId = useId();
  const maxBaseElevationId = useId();
  const minTopElevationId = useId();
  const maxTopElevationId = useId();
  const minCoursesId = useId();
  const minLiftsId = useId();

  const availablePrefectureSet = useMemo(
    () => new Set(resorts.map(resort => resort.prefecture).filter(Boolean)),
    [resorts],
  );

  const regionOptions = useMemo(
    () =>
      Object.entries(REGION_PREFECTURES)
        .map(([region, prefectures]) => ({
          region,
          prefectures: prefectures.filter(prefecture =>
            availablePrefectureSet.has(prefecture),
          ),
        }))
        .filter(option => option.prefectures.length > 0),
    [availablePrefectureSet],
  );

  const activeFilterLabels = getActiveFilterLabels(filters, regionOptions);
  const collapsedDetailLabels = activeFilterLabels.filter(
    label => !label.startsWith("キーワード:"),
  );

  const handleTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    onFilterChange({ ...filters, [name]: value });
  };

  const handleNumericInputChange = (name: NumericFilterName, value: string) => {
    const digitsOnly = value.replace(/\D/g, "");
    onFilterChange({
      ...filters,
      [name]: digitsOnly === "" ? null : parseInt(digitsOnly, 10),
    });
  };

  const handlePrefectureChange = (prefecture: string, checked: boolean) => {
    const nextPrefectures = checked
      ? [...filters.prefectures, prefecture]
      : filters.prefectures.filter(selected => selected !== prefecture);
    onFilterChange({ ...filters, prefectures: nextPrefectures });
  };

  const handleRegionPrefecturesChange = (
    prefectures: string[],
    checked: boolean,
  ) => {
    const nextPrefectures = checked
      ? Array.from(new Set([...filters.prefectures, ...prefectures]))
      : filters.prefectures.filter(selected => !prefectures.includes(selected));
    onFilterChange({ ...filters, prefectures: nextPrefectures });
  };

  const handleCheckboxChange = (
    name: "status" | "yukiMagi" | "beginnerFriendly",
    checked: boolean,
  ) => {
    onFilterChange({ ...filters, [name]: checked });
  };

  const handleReset = () => {
    onFilterChange(DEFAULT_FILTERS);
  };

  const handleResetClick = () => {
    if (!window.confirm("検索フィルタをリセットしますか？")) return;
    handleReset();
  };

  if (!isExpanded) {
    return (
      <Box
        px={{ base: 3, md: 4 }}
        pt={{ base: 1, md: 4 }}
        pb={{ base: 3, md: 4 }}
        borderBottom="1px solid"
        borderColor="gray.100"
        bg="rgba(255, 255, 255, 0.92)"
        flexShrink={0}
      >
        <Flex
          alignItems="center"
          justifyContent="space-between"
          gap={{ base: 2, md: 3 }}
          pr={{ base: reserveHeaderActionSpace ? 11 : 0, md: 0 }}
        >
          <Box minW={0}>
            <Heading
              size={{ base: "md", md: "md" }}
              color="gray.900"
              display="flex"
              alignItems="center"
              gap={2}
            >
              <Filter size={16} color="var(--brand-main)" />
              {title}
              <ResultCountBadge count={resultCount} />
            </Heading>
          </Box>
          <Flex flexShrink={0} gap={2}>
            <Button
              aria-label="検索条件をクリア"
              size="xs"
              h={{ base: "36px", md: "32px" }}
              px={{ base: 4, md: 3 }}
              borderRadius="md"
              variant="outline"
              color="gray.600"
              borderColor="gray.200"
              gap={1}
              fontWeight="800"
              onClick={handleResetClick}
            >
              <RotateCcw size={14} />
              クリア
            </Button>
          </Flex>
        </Flex>
        {showKeywordSearch && (
          <Flex
            as="form"
            mt={{ base: 2, md: 3 }}
            gap={2}
            onSubmit={e => {
              e.preventDefault();
              onSearch();
            }}
          >
            <Input
              flex={1}
              minW={0}
              id={keywordId}
              type="text"
              name="keyword"
              placeholder="スキー場名を入力"
              value={filters.keyword}
              onChange={handleTextInputChange}
              onBlur={onKeyboardInputBlur}
              onFocus={onKeyboardInputFocus}
              bg={{ base: "gray.50", md: "white" }}
              borderColor={{ base: "gray.300", md: "gray.200" }}
              borderWidth={{ base: "1.5px", md: "1px" }}
              color="gray.800"
              borderRadius="md"
              h={{ base: 10, md: 10 }}
              fontSize={{ base: MOBILE_INPUT_FONT_SIZE, md: "md" }}
              _placeholder={{ color: "gray.400" }}
              _focus={{
                borderColor: "brand.500",
                boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.1)",
              }}
            />
            <Button
              type="submit"
              flexShrink={0}
              w={{ base: "8.75rem", md: "130px" }}
              h={{ base: 9, md: 10 }}
              borderRadius="md"
              bg="brand.500"
              color="white"
              fontWeight="800"
              gap={{ base: 1, md: 1.5 }}
              fontSize={{ base: MOBILE_BODY_FONT_SIZE, md: "sm" }}
              _hover={{ bg: "brand.600" }}
            >
              <Search size={14} />
              検索
            </Button>
          </Flex>
        )}
        <Flex
          mt={{ base: 4, md: 3 }}
          gap={{ base: 1.5, md: 2 }}
          flexWrap="wrap"
          alignItems="center"
        >
          {(collapsedDetailLabels.length > 0
            ? collapsedDetailLabels
            : ["条件なし"]
          ).map(label => (
            <Box
              key={label}
              px={{ base: 2, md: 2.5 }}
              py={0}
              minH={{ base: "28px", md: "32px" }}
              borderRadius="md"
              bg="gray.100"
              color="gray.700"
              fontSize={{ base: MOBILE_COMPACT_FONT_SIZE, md: "xs" }}
              fontWeight="700"
              lineHeight="1.4"
              display="flex"
              alignItems="center"
            >
              {label}
            </Box>
          ))}
          <Button
            size="xs"
            h={{ base: "28px", md: "32px" }}
            px={{ base: 2.5, md: 3 }}
            borderRadius="md"
            bg="gray.900"
            color="white"
            border="1px solid"
            borderColor="gray.900"
            gap={1.5}
            fontWeight="800"
            _hover={{
              bg: "gray.800",
              borderColor: "gray.800",
            }}
            onClick={() => onExpandedChange(true)}
          >
            <SlidersHorizontal size={14} />
            フィルタを変更
          </Button>
        </Flex>
      </Box>
    );
  }

  return (
    <Box
      p={{ base: 4, md: 4 }}
      borderBottom="1px solid"
      borderColor="gray.100"
      bg="rgba(255, 255, 255, 0.96)"
      display="flex"
      flexDirection="column"
      flexGrow={scrollContent ? 1 : 0}
      flexShrink={scrollContent ? 1 : 0}
      minH={scrollContent ? 0 : "auto"}
      overflow={scrollContent ? "hidden" : "visible"}
    >
      <Flex
        alignItems="center"
        justifyContent="space-between"
        gap={{ base: 2, md: 3 }}
        pr={{ base: reserveHeaderActionSpace ? 11 : 0, md: 0 }}
      >
        <Box minW={0}>
          <Heading
            size={{ base: "md", md: "md" }}
            color="gray.900"
            display="flex"
            alignItems="center"
            gap={2}
          >
            <Filter size={16} color="var(--brand-main)" />
            {title}
            <ResultCountBadge count={resultCount} />
          </Heading>
        </Box>
        <Flex flexShrink={0} gap={{ base: 2.5, md: 2 }}>
          <Button
            aria-label="検索条件をクリア"
            size="xs"
            h={{ base: "36px", md: "32px" }}
            px={{ base: 4, md: 3 }}
            borderRadius="md"
            variant="outline"
            color="gray.600"
            borderColor="gray.200"
            gap={1}
            fontWeight="800"
            onClick={handleResetClick}
          >
            <RotateCcw size={14} />
            クリア
          </Button>
        </Flex>
      </Flex>

      {showKeywordSearch && (
        <Flex
          as="form"
          mt={{ base: 2, md: 3 }}
          mb={{ base: 2, md: 3 }}
          gap={2}
          flexShrink={0}
          onSubmit={e => {
            e.preventDefault();
            onSearch();
          }}
        >
          <Input
            flex={1}
            minW={0}
            id={keywordId}
            type="text"
            name="keyword"
            placeholder="スキー場名を入力"
            value={filters.keyword}
            onChange={handleTextInputChange}
            onBlur={onKeyboardInputBlur}
            onFocus={onKeyboardInputFocus}
            bg={{ base: "gray.50", md: "white" }}
            borderColor={{ base: "gray.300", md: "gray.200" }}
            borderWidth={{ base: "1.5px", md: "1px" }}
            color="gray.800"
            borderRadius="md"
            h={{ base: 10, md: 10 }}
            fontSize={{ base: MOBILE_INPUT_FONT_SIZE, md: "md" }}
            _placeholder={{ color: "gray.400" }}
            _focus={{
              borderColor: "brand.500",
              boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.1)",
            }}
          />
          <Button
            type="submit"
            flexShrink={0}
            w={{ base: "8.75rem", md: "130px" }}
            h={{ base: 9, md: 10 }}
            borderRadius="md"
            bg="brand.500"
            color="white"
            fontWeight="800"
            gap={{ base: 1, md: 1.5 }}
            fontSize={{ base: MOBILE_BODY_FONT_SIZE, md: "sm" }}
            _hover={{ bg: "brand.600" }}
          >
            <Search size={14} />
            検索
          </Button>
        </Flex>
      )}

      <Flex
        flexGrow={scrollContent ? 1 : 0}
        flexShrink={scrollContent ? 1 : 0}
        minH={0}
        flexDirection="column"
        gap={{ base: 5, md: 5 }}
        overflowY={scrollContent ? "auto" : "visible"}
        pr={{ base: 0.5, md: 1 }}
        pt={{ base: 4, md: 0 }}
      >
        <Grid
          templateColumns="repeat(3, minmax(0, 1fr))"
          gap={{ base: 1.5, md: 2 }}
        >
          <FilterToggle
            id={statusId}
            label="営業中のみ"
            checked={filters.status}
            onChange={checked => handleCheckboxChange("status", checked)}
          />
          <FilterToggle
            id={yukiMagiId}
            label="雪マジ対象"
            checked={filters.yukiMagi}
            onChange={checked => handleCheckboxChange("yukiMagi", checked)}
            checkedColor="pink.500"
          />
          <FilterToggle
            id={beginnerFriendlyId}
            label="初級者向け"
            checked={filters.beginnerFriendly}
            onChange={checked =>
              handleCheckboxChange("beginnerFriendly", checked)
            }
            checkedColor="green.500"
          />
        </Grid>

        <Flex flexDirection="column" gap={{ base: 2, md: 3 }}>
          <Grid
            templateColumns="repeat(3, minmax(0, 1fr))"
            gap={{ base: 1.5, md: 2 }}
          >
            <CompactMetricFilter
              label="標高差"
              id={minVerticalId}
              name="minVertical"
              value={filters.minVertical}
              inputWidth={MOBILE_NUMBER_INPUT_WIDTH}
              unit="m"
              onBlur={onKeyboardInputBlur}
              onChange={handleNumericInputChange}
              onFocus={onKeyboardInputFocus}
            />
            <CompactMetricFilter
              label="コース数"
              id={minCoursesId}
              name="minCourses"
              value={filters.minCourses}
              inputWidth={MOBILE_NUMBER_INPUT_WIDTH}
              unit=""
              onBlur={onKeyboardInputBlur}
              onChange={handleNumericInputChange}
              onFocus={onKeyboardInputFocus}
            />
            <CompactMetricFilter
              label="リフト数"
              id={minLiftsId}
              name="minLifts"
              value={filters.minLifts}
              inputWidth={MOBILE_NUMBER_INPUT_WIDTH}
              unit=""
              onBlur={onKeyboardInputBlur}
              onChange={handleNumericInputChange}
              onFocus={onKeyboardInputFocus}
            />
          </Grid>
          <ToggleSection
            isOpen={isElevationDetailOpen}
            label="詳細フィルタ"
            onToggle={() => setIsElevationDetailOpen(prev => !prev)}
          >
            <Flex flexDirection="column" gap={2}>
              <ElevationFilterRow
                label="山麓標高"
                minId={minBaseElevationId}
                minName="minBaseElevation"
                minValue={filters.minBaseElevation}
                maxId={maxBaseElevationId}
                maxName="maxBaseElevation"
                maxValue={filters.maxBaseElevation}
                unit="m"
                onBlur={onKeyboardInputBlur}
                onChange={handleNumericInputChange}
                onFocus={onKeyboardInputFocus}
              />
              <ElevationFilterRow
                label="山頂標高"
                minId={minTopElevationId}
                minName="minTopElevation"
                minValue={filters.minTopElevation}
                maxId={maxTopElevationId}
                maxName="maxTopElevation"
                maxValue={filters.maxTopElevation}
                unit="m"
                onBlur={onKeyboardInputBlur}
                onChange={handleNumericInputChange}
                onFocus={onKeyboardInputFocus}
              />
            </Flex>
          </ToggleSection>
        </Flex>

        <PrefectureFilter
          regionOptions={regionOptions}
          selectedPrefectures={filters.prefectures}
          onPrefectureChange={handlePrefectureChange}
          onRegionPrefecturesChange={handleRegionPrefecturesChange}
        />
      </Flex>
    </Box>
  );
};

const PrefectureFilter = ({
  regionOptions,
  selectedPrefectures,
  onPrefectureChange,
  onRegionPrefecturesChange,
}: {
  regionOptions: Array<{ region: string; prefectures: string[] }>;
  selectedPrefectures: string[];
  onPrefectureChange: (prefecture: string, checked: boolean) => void;
  onRegionPrefecturesChange: (prefectures: string[], checked: boolean) => void;
}) => (
  <Box>
    <Flex
      alignItems="center"
      gap={2}
      h={{ base: 7, md: 8 }}
      color="gray.600"
      fontSize={{ base: MOBILE_BODY_FONT_SIZE, md: "0.875rem" }}
      fontWeight="700"
    >
      <Text as="span">都道府県で選ぶ</Text>
      {selectedPrefectures.length > 0 && (
        <Text
          as="span"
          color="brand.600"
          fontSize={{ base: MOBILE_COMPACT_FONT_SIZE, md: "xs" }}
          fontWeight="800"
        >
          {selectedPrefectures.length}件選択中
        </Text>
      )}
    </Flex>
    <Box
      mt={{ base: 0.75, md: 1 }}
      ml={{ base: 2, md: 2.5 }}
      pl={{ base: 2, md: 2.5 }}
      borderLeft="2px solid"
      borderColor="gray.200"
    >
      <Flex flexDirection="column" gap={{ base: 0.75, md: 1 }}>
        {regionOptions.map(({ region, prefectures }) => {
          const isRegionSelected = prefectures.every(prefecture =>
            selectedPrefectures.includes(prefecture),
          );

          return (
            <Box
              key={region}
              border="1px solid"
              borderColor="gray.100"
              borderRadius="md"
              bg="gray.50"
              overflow="hidden"
            >
              <Flex
                alignItems="center"
                justifyContent="space-between"
                px={{ base: 1.5, md: 2 }}
                py={{ base: 0.75, md: 1 }}
              >
                <Text
                  minW={0}
                  color="gray.700"
                  fontSize={{ base: MOBILE_COMPACT_FONT_SIZE, md: "0.75rem" }}
                  fontWeight="800"
                >
                  {region}
                </Text>
                <Button
                  type="button"
                  flexShrink={0}
                  h={{ base: "2rem", md: "1.75rem" }}
                  minW={{ base: "4.5rem", md: "auto" }}
                  px={{ base: 3, md: 2 }}
                  borderRadius="md"
                  bg={isRegionSelected ? "brand.500" : "white"}
                  color={isRegionSelected ? "white" : "brand.600"}
                  border="1px solid"
                  borderColor={isRegionSelected ? "brand.500" : "gray.200"}
                  fontSize={{ base: MOBILE_COMPACT_FONT_SIZE, md: "0.75rem" }}
                  fontWeight="800"
                  lineHeight="1.2"
                  whiteSpace="nowrap"
                  _hover={{
                    bg: isRegionSelected ? "brand.600" : "brand.50",
                    borderColor: "brand.500",
                  }}
                  onClick={() =>
                    onRegionPrefecturesChange(prefectures, !isRegionSelected)
                  }
                >
                  {isRegionSelected ? "解除" : "全選択"}
                </Button>
              </Flex>

              <Grid
                templateColumns="repeat(5, minmax(0, 1fr))"
                gap={{ base: 0.75, md: 1 }}
                mt={0.5}
                px={{ base: 1, md: 1.5 }}
                pb={{ base: 1, md: 1.5 }}
              >
                {prefectures.map(prefecture => (
                  <FilterToggle
                    key={prefecture}
                    id={`prefecture-${prefecture}`}
                    label={prefecture.replace(/[府県]$/, "")}
                    checked={selectedPrefectures.includes(prefecture)}
                    onChange={checked =>
                      onPrefectureChange(prefecture, checked)
                    }
                  />
                ))}
              </Grid>
            </Box>
          );
        })}
      </Flex>
    </Box>
  </Box>
);

const ToggleSection = ({
  isOpen,
  label,
  meta,
  onToggle,
  children,
}: {
  isOpen: boolean;
  label: string;
  meta?: string;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <Box>
    <Button
      type="button"
      w="100%"
      h={{ base: 7, md: 8 }}
      justifyContent="flex-start"
      px={0}
      borderRadius="md"
      variant="ghost"
      color="gray.600"
      fontSize={{ base: MOBILE_BODY_FONT_SIZE, md: "0.875rem" }}
      fontWeight="700"
      gap={1}
      _hover={{ bg: "gray.50" }}
      onClick={onToggle}
    >
      <Box
        as={isOpen ? ChevronUp : ChevronDown}
        boxSize={{ base: "13px", md: "14px" }}
      />
      <Text as="span">{label}</Text>
      {meta && (
        <Text
          as="span"
          color="brand.600"
          fontSize={{ base: MOBILE_COMPACT_FONT_SIZE, md: "xs" }}
          fontWeight="800"
        >
          {meta}
        </Text>
      )}
    </Button>
    {isOpen && (
      <Box
        mt={{ base: 0.75, md: 1 }}
        ml={{ base: 2, md: 2.5 }}
        pl={{ base: 2, md: 2.5 }}
        borderLeft="2px solid"
        borderColor="gray.200"
      >
        {children}
      </Box>
    )}
  </Box>
);

const ElevationFilterRow = ({
  label,
  minId,
  minName,
  minValue,
  maxId,
  maxName,
  maxValue,
  unit,
  onBlur,
  onChange,
  onFocus,
}: {
  label: string;
  minId: string;
  minName: NumericFilterName;
  minValue: NumericFilterValue;
  maxId?: string;
  maxName?: NumericFilterName;
  maxValue?: NumericFilterValue;
  unit: string;
  onBlur?: () => void;
  onChange: (name: NumericFilterName, value: string) => void;
  onFocus?: () => void;
}) => (
  <Grid
    templateColumns={{
      base: "64px max-content max-content",
      md: "72px max-content max-content",
    }}
    alignItems="center"
    gap={{ base: 1.5, md: 2 }}
  >
    <label htmlFor={minId}>
      <Text
        as="span"
        color="gray.500"
        fontSize={{ base: MOBILE_BODY_FONT_SIZE, md: "0.875rem" }}
        fontWeight="700"
        whiteSpace="nowrap"
      >
        {label}
      </Text>
    </label>
    <CompactNumberInput
      id={minId}
      name={minName}
      value={minValue}
      unit={unit}
      suffix="以上"
      onBlur={onBlur}
      onChange={onChange}
      onFocus={onFocus}
    />
    {maxId && maxName ? (
      <CompactNumberInput
        id={maxId}
        name={maxName}
        value={maxValue ?? null}
        unit={unit}
        suffix="以下"
        onBlur={onBlur}
        onChange={onChange}
        onFocus={onFocus}
      />
    ) : (
      <Box />
    )}
  </Grid>
);

const CompactMetricFilter = ({
  label,
  id,
  name,
  value,
  inputWidth,
  unit,
  onBlur,
  onChange,
  onFocus,
}: {
  label: string;
  id: string;
  name: NumericFilterName;
  value: NumericFilterValue;
  inputWidth: string;
  unit: string;
  onBlur?: () => void;
  onChange: (name: NumericFilterName, value: string) => void;
  onFocus?: () => void;
}) => (
  <Flex
    alignItems="center"
    justifyContent="center"
    gap={{ base: 1, md: 1 }}
    minW={0}
  >
    <label htmlFor={id}>
      <Text
        as="span"
        color="gray.500"
        fontSize={{ base: MOBILE_BODY_FONT_SIZE, md: "0.875rem" }}
        fontWeight="700"
        whiteSpace="nowrap"
      >
        {label}
      </Text>
    </label>
    <CompactNumberInput
      id={id}
      name={name}
      value={value}
      inputWidth={inputWidth}
      unit=""
      suffix=""
      onBlur={onBlur}
      onChange={onChange}
      onFocus={onFocus}
    />
    <Text
      flexShrink={0}
      color="gray.600"
      fontSize={{ base: MOBILE_BODY_FONT_SIZE, md: "xs" }}
      fontWeight="800"
    >
      {unit}
    </Text>
  </Flex>
);

const CompactNumberInput = ({
  id,
  name,
  value,
  inputWidth = "30px",
  unit,
  suffix,
  onBlur,
  onChange,
  onFocus,
}: {
  id: string;
  name: NumericFilterName;
  value: NumericFilterValue;
  inputWidth?: string;
  unit: string;
  suffix: string;
  onBlur?: () => void;
  onChange: (name: NumericFilterName, value: string) => void;
  onFocus?: () => void;
}) => (
  <Flex alignItems="center" gap={{ base: 0.75, md: 1 }} minW={0}>
    <Input
      id={id}
      type="text"
      name={name}
      inputMode="numeric"
      pattern="[0-9]*"
      value={value == null ? "" : String(value)}
      onBlur={onBlur}
      onChange={e => onChange(name, e.target.value)}
      onFocus={onFocus}
      h={{ base: 9, md: 8 }}
      w={inputWidth}
      px={{ base: 0.5, md: 1 }}
      bg={{ base: "gray.50", md: "white" }}
      borderColor={{ base: "gray.300", md: "gray.200" }}
      borderWidth={{ base: "1.5px", md: "1px" }}
      color="gray.800"
      borderRadius="md"
      fontSize={{ base: MOBILE_INPUT_FONT_SIZE, md: "xs" }}
      textAlign="center"
      _focus={{
        bg: "white",
        borderColor: "brand.500",
        boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.12)",
      }}
    />
    {(unit || suffix) && (
      <Text
        flexShrink={0}
        color="gray.600"
        fontSize={{ base: MOBILE_BODY_FONT_SIZE, md: "xs" }}
        fontWeight="800"
      >
        {unit}
        {suffix}
      </Text>
    )}
  </Flex>
);

const FilterToggle = ({
  id,
  label,
  checked,
  checkedColor = "brand.500",
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  checkedColor?: string;
  onChange: (checked: boolean) => void;
}) => (
  <Button
    id={id}
    type="button"
    aria-pressed={checked}
    minW={0}
    h={{ base: "28px", md: "32px" }}
    px={{ base: 2, md: 3 }}
    borderRadius="md"
    border="1px solid"
    borderColor={checked ? checkedColor : "gray.200"}
    bg={checked ? checkedColor : "white"}
    color={checked ? "white" : "gray.700"}
    fontSize={{ base: MOBILE_COMPACT_FONT_SIZE, md: "0.75rem" }}
    fontWeight="800"
    lineHeight="1"
    overflow="hidden"
    textOverflow="ellipsis"
    whiteSpace="nowrap"
    _hover={{
      bg: checked ? checkedColor : "gray.50",
      borderColor: checked ? checkedColor : "gray.300",
    }}
    onClick={() => onChange(!checked)}
  >
    {label}
  </Button>
);
