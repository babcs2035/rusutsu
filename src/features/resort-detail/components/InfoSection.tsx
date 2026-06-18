"use client";

import { Box, Button, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { Check, Plus } from "lucide-react";
import type { Resort } from "../types";
import { StatCard } from "./StatCard";

export const InfoSection = ({
  resort,
  isCompareSelected,
  onToggleCompare,
  onClose,
}: {
  resort: Resort;
  isCompareSelected: boolean;
  onToggleCompare: (id: string, selected: boolean) => void;
  onClose: () => void;
}) => (
  <Box
    bg="transparent"
    pt={{ base: 1.5, md: 8 }}
    pr={{ base: 4, md: 8 }}
    pb={{ base: 3, md: 8 }}
    pl={{ base: 4, md: 8 }}
    borderBottom="1px solid"
    borderColor="gray.200"
  >
    <Flex alignItems="flex-start" justifyContent="space-between" gap={2}>
      <Heading
        flex="1 1 auto"
        minW={0}
        color="gray.900"
        fontFamily="var(--font-heading)"
        fontSize={{ base: "1.25rem", md: "2.5rem" }}
        lineHeight={{ base: "1.18", md: "1.16" }}
      >
        {resort.nameJa}
      </Heading>
      <Flex
        display={{ base: "flex", md: "none" }}
        flex="0 0 auto"
        alignItems="center"
        gap={2}
      >
        <Button
          size="xs"
          flex="0 0 5.75rem"
          w="5.75rem"
          h="28px"
          minW="5.75rem"
          px={2}
          borderRadius="md"
          gap={1}
          fontSize="0.68rem"
          fontWeight="800"
          color={isCompareSelected ? "white" : "brand.600"}
          bg={isCompareSelected ? "brand.500" : "white"}
          border="1px solid"
          borderColor={isCompareSelected ? "brand.400" : "brand.500"}
          aria-pressed={isCompareSelected}
          aria-label={`${resort.nameJa}を${
            isCompareSelected ? "比較から外す" : "比較に追加"
          }`}
          _hover={{
            bg: isCompareSelected ? "brand.600" : "brand.50",
          }}
          onClick={() => onToggleCompare(resort.id, !isCompareSelected)}
        >
          <Box
            as={isCompareSelected ? Check : Plus}
            boxSize="12px"
            strokeWidth={3}
          />
          <Box as="span">
            {isCompareSelected ? "比較から外す" : "比較に追加"}
          </Box>
        </Button>
        <Button
          onClick={onClose}
          h={10}
          w={10}
          minW={10}
          flex="0 0 auto"
          alignItems="center"
          justifyContent="center"
          borderRadius="full"
          bg="white"
          border="1px solid"
          borderColor="gray.200"
          fontSize="xl"
          color="gray.600"
          boxShadow="sm"
          _hover={{ bg: "gray.50", color: "gray.900" }}
          _focus={{ outline: "none", ring: "2px", ringColor: "brand.400" }}
          p={0}
          aria-label="詳細を閉じる"
        >
          ✕
        </Button>
      </Flex>
    </Flex>
    <Flex
      display={{ base: "none", md: "flex" }}
      mt={4}
      alignItems="center"
      gap={3}
      wrap="wrap"
    >
      <Button
        size="xs"
        w="100px"
        minW="100px"
        h="var(--chakra-sizes-8)"
        px={2}
        borderRadius="md"
        gap={1.5}
        fontWeight="800"
        color={isCompareSelected ? "white" : "brand.600"}
        bg={isCompareSelected ? "brand.500" : "white"}
        border="1px solid"
        borderColor="brand.500"
        aria-pressed={isCompareSelected}
        aria-label={`${resort.nameJa}を${
          isCompareSelected ? "比較から外す" : "比較に追加"
        }`}
        _hover={{
          bg: isCompareSelected ? "brand.600" : "brand.50",
        }}
        onClick={() => onToggleCompare(resort.id, !isCompareSelected)}
      >
        <Box
          as={isCompareSelected ? Check : Plus}
          boxSize="16px"
          strokeWidth={3}
        />
        {isCompareSelected ? "比較から外す" : "比較に追加"}
      </Button>
    </Flex>
    <Text mt={2.5} fontSize="sm" color="brand.600" fontWeight="700">
      {resort.prefecture} • {resort.town}
    </Text>
    <Text
      mt={{ base: 3, md: 4 }}
      color="gray.600"
      fontSize={{ base: "0.95rem", md: "md" }}
      lineHeight={{ base: "1.45", md: "1.6" }}
      w={{ base: "100%", md: "80%" }}
    >
      {resort.descriptionShort}
    </Text>
    <Grid
      mt={{ base: 4, md: 8 }}
      templateColumns={{
        base: "repeat(2, 1fr)",
        md: resort.yukiMagi ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
      }}
      gap={{ base: 2, md: 5 }}
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
