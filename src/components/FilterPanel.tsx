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
    fontWeight: 500,
    color: "#e2e8f0", // slate-200
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        position="absolute"
        top={4}
        left={4}
        zIndex={1000}
        bg="#1e293b"
        color="white"
        px={4}
        py={2}
        borderRadius="lg"
        boxShadow="lg"
        _hover={{ bg: "#334155" }}
        display="flex"
        alignItems="center"
        gap={2}
      >
        <Filter size={16} />
        <Box as="span">フィルター</Box>
      </Button>
    );
  }

  return (
    <Box
      position="absolute"
      top={4}
      left={4}
      zIndex={1000}
      w="288px"
      borderRadius="xl"
      border="1px solid rgba(255, 255, 255, 0.2)"
      bg="#1e293b"
      p={4}
      color="#e2e8f0"
      boxShadow="xl"
      backdropFilter="blur(16px)"
    >
      <Flex alignItems="center" justifyContent="space-between">
        <Heading size="md" color="white">
          フィルター
        </Heading>
        <Button
          onClick={() => setIsOpen(false)}
          variant="ghost"
          fontSize="2xl"
          color="#94a3b8"
          _hover={{ color: "white", bg: "transparent" }}
          p={0}
          minW="auto"
          h="auto"
        >
          <X size={24} />
        </Button>
      </Flex>

      <Flex mt={4} flexDirection="column" gap={5}>
        {/* キーワード検索 */}
        <Box>
          <label htmlFor={keywordId} style={labelStyle}>
            キーワード検索
          </label>
          <Input
            id={keywordId}
            type="text"
            name="keyword"
            value={filters.keyword}
            onChange={handleChange}
            bg="#334155"
            borderColor="#475569"
            color="white"
            _placeholder={{ color: "#94a3b8" }}
            _focus={{
              borderColor: "#6366f1",
              boxShadow: "0 0 0 1px #6366f1",
            }}
          />
        </Box>

        {/* チェックボックス (2x2グリッド) */}
        <Grid templateColumns="repeat(2, 1fr)" gap={3}>
          <Checkbox.Root
            id={statusId}
            checked={filters.status}
            onCheckedChange={e => handleCheckboxChange("status", !!e.checked)}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control
              bg="#334155"
              borderColor="#64748b"
              _checked={{ bg: "#6366f1", borderColor: "#6366f1" }}
            />
            <Checkbox.Label color="#e2e8f0">営業中</Checkbox.Label>
          </Checkbox.Root>

          <Checkbox.Root
            id={yukiMagiId}
            checked={filters.yukiMagi}
            onCheckedChange={e => handleCheckboxChange("yukiMagi", !!e.checked)}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control
              bg="#334155"
              borderColor="#64748b"
              _checked={{ bg: "#6366f1", borderColor: "#6366f1" }}
            />
            <Checkbox.Label color="#e2e8f0">雪マジ対応</Checkbox.Label>
          </Checkbox.Root>

          <Checkbox.Root
            id={beginnerFriendlyId}
            checked={filters.beginnerFriendly}
            onCheckedChange={e =>
              handleCheckboxChange("beginnerFriendly", !!e.checked)
            }
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control
              bg="#334155"
              borderColor="#64748b"
              _checked={{ bg: "#6366f1", borderColor: "#6366f1" }}
            />
            <Checkbox.Label color="#e2e8f0">初心者向け</Checkbox.Label>
          </Checkbox.Root>
        </Grid>

        {/* 数値入力 */}
        <Flex flexDirection="column" gap={3}>
          <Grid templateColumns="1fr 2fr" alignItems="center" gap={2}>
            <label
              htmlFor={minVerticalId}
              style={{ fontSize: "0.875rem", color: "#e2e8f0" }}
            >
              標高差
            </label>
            <Input
              id={minVerticalId}
              type="number"
              name="minVertical"
              value={filters.minVertical}
              onChange={handleChange}
              bg="#334155"
              borderColor="#475569"
              color="white"
              _focus={{
                borderColor: "#6366f1",
                boxShadow: "0 0 0 1px #6366f1",
              }}
            />
          </Grid>
          <Grid templateColumns="1fr 2fr" alignItems="center" gap={2}>
            <label
              htmlFor={minCoursesId}
              style={{ fontSize: "0.875rem", color: "#e2e8f0" }}
            >
              コース数
            </label>
            <Input
              id={minCoursesId}
              type="number"
              name="minCourses"
              value={filters.minCourses}
              onChange={handleChange}
              bg="#334155"
              borderColor="#475569"
              color="white"
              _focus={{
                borderColor: "#6366f1",
                boxShadow: "0 0 0 1px #6366f1",
              }}
            />
          </Grid>
        </Flex>

        {/* リセットボタン */}
        <Button
          onClick={handleReset}
          bg="#475569"
          color="white"
          fontWeight="bold"
          borderRadius="lg"
          px={4}
          py={2}
          boxShadow="md"
          _hover={{ bg: "#64748b" }}
        >
          リセット
        </Button>
      </Flex>
    </Box>
  );
};
