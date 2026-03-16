"use client";

import {
  Box,
  Button,
  Checkbox,
  Flex,
  Grid,
  Heading,
  Input,
} from "@chakra-ui/react";
import { Filter, X } from "lucide-react";
import { useId, useState } from "react";

// フィルターの状態を管理するための型
export type Filters = {
  keyword: string;
  status: boolean;
  yukiMagi: boolean;
  beginnerFriendly: boolean;
  minVertical: number;
  minCourses: number;
};

type Props = {
  filters: Filters;
  onFilterChange: (newFilters: Filters) => void;
};

export const FilterPanel = ({ filters, onFilterChange }: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  // フォーム要素のID
  const keywordId = useId();
  const statusId = useId();
  const yukiMagiId = useId();
  const beginnerFriendlyId = useId();
  const minVerticalId = useId();
  const minCoursesId = useId();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const processedValue =
      type === "checkbox"
        ? checked
        : type === "number"
          ? value === ""
            ? 0
            : parseInt(value, 10)
          : value;

    onFilterChange({ ...filters, [name]: processedValue });
  };

  const handleCheckboxChange = (name: string, checked: boolean) => {
    onFilterChange({ ...filters, [name]: checked });
  };

  const handleReset = () => {
    onFilterChange({
      keyword: "",
      status: false,
      yukiMagi: false,
      beginnerFriendly: false,
      minVertical: 0,
      minCourses: 0,
    });
  };

  const labelStyle: React.CSSProperties = {
    marginBottom: "0.25rem",
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#4b5563", // gray-600
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        position="absolute"
        top={6}
        left={6}
        zIndex={1000}
        bg="white"
        color="gray.800"
        px={6}
        py={5}
        borderRadius="2xl"
        border="1px solid"
        borderColor="gray.200"
        boxShadow="0 8px 32px rgba(0, 0, 0, 0.08)"
        _hover={{
          bg: "gray.50",
          borderColor: "brand.500",
          transform: "translateY(-2px)",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.12)",
        }}
        display="flex"
        alignItems="center"
        gap={3}
        transition="all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
      >
        <Filter size={18} />
        <Box
          as="span"
          fontWeight="bold"
          fontSize="sm"
          fontFamily="var(--font-heading)"
        >
          フィルター
        </Box>
      </Button>
    );
  }

  return (
    <Box
      position="absolute"
      top={6}
      left={6}
      zIndex={1000}
      w="320px"
      borderRadius="3xl"
      border="1px solid"
      borderColor="gray.200"
      bg="rgba(255, 255, 255, 0.95)"
      p={6}
      color="gray.800"
      boxShadow="0 20px 50px rgba(0, 0, 0, 0.1)"
      backdropFilter="blur(24px) saturate(150%)"
    >
      <Flex alignItems="center" justifyContent="space-between" mb={2}>
        <Heading
          size="md"
          color="gray.900"
          display="flex"
          alignItems="center"
          gap={2}
        >
          <Filter size={18} color="var(--brand-main)" />
          フィルター
        </Heading>
        <Button
          onClick={() => setIsOpen(false)}
          variant="ghost"
          color="gray.400"
          _hover={{
            color: "gray.900",
            bg: "gray.100",
            transform: "rotate(90deg)",
          }}
          p={2}
          minW="auto"
          h="auto"
          borderRadius="full"
          transition="all 0.3s"
        >
          <X size={20} />
        </Button>
      </Flex>

      <Flex mt={4} flexDirection="column" gap={6}>
        {/* キーワード検索 */}
        <Box>
          <label htmlFor={keywordId} style={labelStyle}>
            キーワード検索
          </label>
          <Input
            id={keywordId}
            type="text"
            name="keyword"
            placeholder="スキー場名など..."
            value={filters.keyword}
            onChange={handleChange}
            bg="white"
            borderColor="gray.200"
            color="gray.800"
            borderRadius="xl"
            px={4}
            py={2.5}
            _placeholder={{ color: "gray.400" }}
            _focus={{
              borderColor: "brand.500",
              boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.1)",
            }}
            transition="all 0.2s"
          />
        </Box>

        {/* チェックボックス (2x2グリッド) */}
        <Grid templateColumns="repeat(2, 1fr)" gap={4}>
          <Checkbox.Root
            id={statusId}
            checked={filters.status}
            onCheckedChange={e => handleCheckboxChange("status", !!e.checked)}
            display="flex"
            alignItems="center"
            gap={2}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control
              bg="white"
              borderColor="gray.200"
              borderRadius="md"
              _checked={{
                bg: "brand.500",
                borderColor: "brand.500",
                color: "white",
              }}
            />
            <Checkbox.Label
              color="gray.700"
              fontSize="sm"
              cursor="pointer"
              fontWeight="500"
            >
              営業中のみ
            </Checkbox.Label>
          </Checkbox.Root>

          <Checkbox.Root
            id={yukiMagiId}
            checked={filters.yukiMagi}
            onCheckedChange={e => handleCheckboxChange("yukiMagi", !!e.checked)}
            display="flex"
            alignItems="center"
            gap={2}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control
              bg="white"
              borderColor="gray.200"
              borderRadius="md"
              _checked={{
                bg: "pink.500",
                borderColor: "pink.500",
                color: "white",
              }}
            />
            <Checkbox.Label
              color="gray.700"
              fontSize="sm"
              cursor="pointer"
              fontWeight="500"
            >
              ユキマジ対象
            </Checkbox.Label>
          </Checkbox.Root>

          <Checkbox.Root
            id={beginnerFriendlyId}
            checked={filters.beginnerFriendly}
            onCheckedChange={e =>
              handleCheckboxChange("beginnerFriendly", !!e.checked)
            }
            display="flex"
            alignItems="center"
            gap={2}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control
              bg="white"
              borderColor="gray.200"
              borderRadius="md"
              _checked={{
                bg: "green.500",
                borderColor: "green.500",
                color: "white",
              }}
            />
            <Checkbox.Label
              color="gray.700"
              fontSize="sm"
              cursor="pointer"
              fontWeight="500"
            >
              初級者向け
            </Checkbox.Label>
          </Checkbox.Root>
        </Grid>

        {/* 数値入力 */}
        <Flex flexDirection="column" gap={4}>
          <Grid templateColumns="1fr 2fr" alignItems="center" gap={3}>
            <label
              htmlFor={minVerticalId}
              style={{
                fontSize: "0.875rem",
                color: "#6b7280",
                fontWeight: 600,
              }}
            >
              標高差 (m)
            </label>
            <Input
              id={minVerticalId}
              type="number"
              name="minVertical"
              value={filters.minVertical}
              onChange={handleChange}
              bg="white"
              borderColor="gray.200"
              color="gray.800"
              borderRadius="xl"
              _focus={{
                borderColor: "brand.500",
                boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.1)",
              }}
              transition="all 0.2s"
            />
          </Grid>
          <Grid templateColumns="1fr 2fr" alignItems="center" gap={3}>
            <label
              htmlFor={minCoursesId}
              style={{
                fontSize: "0.875rem",
                color: "#6b7280",
                fontWeight: 600,
              }}
            >
              コース数
            </label>
            <Input
              id={minCoursesId}
              type="number"
              name="minCourses"
              value={filters.minCourses}
              onChange={handleChange}
              bg="white"
              borderColor="gray.200"
              color="gray.800"
              borderRadius="xl"
              _focus={{
                borderColor: "brand.500",
                boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.1)",
              }}
              transition="all 0.2s"
            />
          </Grid>
        </Flex>

        {/* リセットボタン */}
        <Button
          onClick={handleReset}
          variant="outline"
          color="gray.600"
          fontWeight="bold"
          fontSize="sm"
          borderRadius="xl"
          borderColor="gray.200"
          px={5}
          py={4}
          mt={2}
          _hover={{
            bg: "gray.50",
            borderColor: "gray.300",
            color: "gray.900",
          }}
          transition="all 0.2s"
        >
          リセット
        </Button>
      </Flex>
    </Box>
  );
};
