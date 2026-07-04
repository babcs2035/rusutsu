"use client";

import { Box, Button, Flex, Grid, Input, Text } from "@chakra-ui/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { NumericFilterName, NumericFilterValue } from "../types";

const MOBILE_BODY_FONT_SIZE = "0.875rem";
const MOBILE_COMPACT_FONT_SIZE = "0.8125rem";
const MOBILE_INPUT_FONT_SIZE = "1rem";

export const PrefectureFilter = ({
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

export const ToggleSection = ({
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

export const ElevationFilterRow = ({
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

export const CompactMetricFilter = ({
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
      scrollMarginTop="calc(env(safe-area-inset-top, 0px) + 5.5rem)"
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

export const FilterToggle = ({
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
