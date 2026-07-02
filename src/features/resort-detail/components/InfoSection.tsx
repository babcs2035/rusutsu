"use client";

import { Box, Button, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { Check, Plus } from "lucide-react";
import type { Resort } from "../types";
import { StatCard } from "./StatCard";

type ResortInfo = Pick<
  Resort,
  "id" | "nameJa" | "prefecture" | "town" | "descriptionShort" | "yukiMagi"
>;

type OperationSummary = Resort["finalizedOperationSummary"];

const formatOperationSummary = (
  summary: OperationSummary["courses"],
  labels: { open: string; partial: string },
) => {
  if (!summary || summary.total === 0) return "--";

  if (!summary.hasPartial) {
    return `${summary.open}/${summary.total}`;
  }

  return (
    <Box>
      <Box>
        {labels.open} {summary.open}/{summary.total}
      </Box>
      <Box>
        {labels.partial} {summary.partial}/{summary.total}
      </Box>
    </Box>
  );
};

export const InfoSection = ({
  resort,
  finalizedOperationSummary,
  isCompareSelected,
  onToggleCompare,
  onClose,
}: {
  resort: ResortInfo;
  finalizedOperationSummary: OperationSummary;
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
    <Flex alignItems="center" justifyContent="space-between" gap={2}>
      <Heading
        flex="1 1 auto"
        minW={0}
        color="gray.900"
        fontFamily="var(--font-heading)"
        fontSize={{ base: "1.25rem", md: "1.8rem" }}
        lineHeight={{ base: "1.16", md: "1.16" }}
      >
        {resort.nameJa}
      </Heading>
      <Button
        display="flex"
        onClick={onClose}
        h={7}
        w={7}
        minW={7}
        minH={7}
        flex="0 0 auto"
        alignItems="center"
        justifyContent="center"
        borderRadius="full"
        bg="white"
        border="1px solid"
        borderColor="gray.200"
        fontSize={{ base: "xl", md: "2xl" }}
        color="gray.600"
        boxShadow="sm"
        _hover={{ bg: "gray.50", color: "gray.900" }}
        _focus={{ outline: "none", ring: "2px", ringColor: "brand.400" }}
        p={0}
        aria-label="詳細を閉じる"
      >
        ×
      </Button>
    </Flex>
    <Flex mt={{ base: 0.5, md: 2.5 }} alignItems="center" gap={2}>
      <Text
        flex="1 1 auto"
        minW={0}
        fontSize="sm"
        color="brand.600"
        fontWeight="700"
      >
        {resort.prefecture} • {resort.town}
        {resort.yukiMagi && (
          <Box
            as="span"
            ml={2}
            px={1.5}
            py={0.5}
            borderRadius="full"
            bg="pink.50"
            color="pink.500"
            fontSize="10px"
            fontWeight="800"
            verticalAlign="middle"
            whiteSpace="nowrap"
          >
            雪マジ
          </Box>
        )}
      </Text>
      <Button
        size="xs"
        flex={{ base: "0 0 auto", md: "0 0 100px" }}
        w={{ base: "5.75rem", md: "100px" }}
        h={{ base: "28px", md: "var(--chakra-sizes-8)" }}
        minW={{ base: "5.75rem", md: "100px" }}
        px={2}
        borderRadius="md"
        gap={{ base: 1, md: 1.5 }}
        fontSize={{ base: "0.68rem", md: "xs" }}
        fontWeight="800"
        color={isCompareSelected ? "white" : "brand.600"}
        bg={isCompareSelected ? "brand.500" : "white"}
        border="1px solid"
        borderColor={{
          base: isCompareSelected ? "brand.400" : "brand.500",
          md: "brand.500",
        }}
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
          boxSize={{ base: "10px", md: "16px" }}
          strokeWidth={3}
        />
        <Box as="span">{isCompareSelected ? "比較から外す" : "比較に追加"}</Box>
      </Button>
    </Flex>
    <Text
      mt={{ base: 3, md: 4 }}
      color="gray.600"
      fontSize={{ base: "0.95rem", md: "md" }}
      lineHeight={{ base: "1.45", md: "1.6" }}
      w={{ base: "100%", md: "100%" }}
    >
      {resort.descriptionShort}
    </Text>
    <Grid
      mt={{ base: 4, md: 8 }}
      templateColumns={{
        base: "repeat(2, 1fr)",
        md: "repeat(5, 1fr)",
      }}
      gap={{ base: 2, md: 3 }}
      textAlign="center"
    >
      <StatCard
        title="コース"
        value={formatOperationSummary(finalizedOperationSummary.courses, {
          open: "全面",
          partial: "一部",
        })}
      />
      <StatCard
        title="リフト"
        value={formatOperationSummary(finalizedOperationSummary.lifts, {
          open: "運行",
          partial: "待機",
        })}
      />
      <StatCard title="積雪量" value="--" />
      <StatCard title="天候" value="--" />
      <StatCard title="気温" value="--" />
    </Grid>
  </Box>
);
