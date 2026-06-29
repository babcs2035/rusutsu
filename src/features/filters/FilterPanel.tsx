"use client";

import { Box, Button, Flex, Grid, Heading, Input } from "@chakra-ui/react";
import { Filter, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import type { MapSkiResort } from "@/types/skiResorts";
import {
  CompactMetricFilter,
  ElevationFilterRow,
  FilterToggle,
  PrefectureFilter,
  ToggleSection,
} from "./components/FilterControls";
import { useFilterPanelState } from "./hooks/useFilterPanelState";
import type { Filters } from "./types";

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

const MOBILE_BODY_FONT_SIZE = "0.875rem";
const MOBILE_COMPACT_FONT_SIZE = "0.8125rem";
const MOBILE_INPUT_FONT_SIZE = "1rem";
const MOBILE_NUMBER_INPUT_WIDTH = "3.25rem";

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
  const {
    collapsedDetailLabels,
    handleCheckboxChange,
    handleNumericInputChange,
    handlePrefectureChange,
    handleRegionPrefecturesChange,
    handleResetClick,
    handleTextInputChange,
    ids,
    isElevationDetailOpen,
    regionOptions,
    setIsElevationDetailOpen,
  } = useFilterPanelState({ filters, resorts, onFilterChange });
  const {
    beginnerFriendlyId,
    keywordId,
    maxBaseElevationId,
    maxTopElevationId,
    minBaseElevationId,
    minCoursesId,
    minLiftsId,
    minTopElevationId,
    minVerticalId,
    statusId,
    yukiMagiId,
  } = ids;

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
