"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import type { TicketCalculationResult } from "../types";

export const TicketCalculationCard = ({
  result,
  compact = false,
}: {
  result: TicketCalculationResult | null;
  compact?: boolean;
}) => {
  if (!result) {
    return (
      <Box
        p={compact ? 3 : 4}
        borderRadius="xl"
        bg="gray.50"
        border="1px dashed"
        borderColor="gray.300"
      >
        <Text color="gray.500" fontSize="sm" fontWeight="700">
          このスキー場には詳細料金データがありません。
        </Text>
      </Box>
    );
  }

  if (result.status === "unavailable" || result.status === "outside_season") {
    return (
      <Box
        p={compact ? 3 : 4}
        borderRadius="xl"
        bg={result.status === "outside_season" ? "orange.50" : "gray.50"}
        border="1px solid"
        borderColor={
          result.status === "outside_season" ? "orange.200" : "gray.200"
        }
      >
        <Text
          color={result.status === "outside_season" ? "orange.800" : "gray.600"}
          fontSize="sm"
          fontWeight="800"
        >
          {result.notes[0]}
        </Text>
        {result.status === "outside_season" && (
          <Text mt={1} color="gray.600" fontSize="xs">
            収録シーズン: {result.seasonLabel}
          </Text>
        )}
      </Box>
    );
  }

  const displayedTotal =
    result.ticketTotal == null ? result.knownTicketTotal : result.ticketTotal;

  return (
    <Box
      p={compact ? 3 : 5}
      borderRadius="xl"
      bg={result.status === "complete" ? "blue.50" : "orange.50"}
      border="1px solid"
      borderColor={result.status === "complete" ? "blue.200" : "orange.200"}
    >
      <Flex alignItems="flex-start" justifyContent="space-between" gap={3}>
        <Box minW={0}>
          <Text
            color="gray.600"
            fontSize={compact ? "0.68rem" : "xs"}
            fontWeight="800"
          >
            {result.productName ?? "リフト券"}・{result.partyCount}人
          </Text>
          <Text
            mt={1}
            color="gray.900"
            fontSize={compact ? "xl" : "3xl"}
            fontWeight="900"
            lineHeight="1"
          >
            ¥{displayedTotal.toLocaleString("ja-JP")}
            {result.status === "partial" && (
              <Box as="span" ml={1} fontSize="xs" color="orange.700">
                ＋未確定
              </Box>
            )}
          </Text>
        </Box>
        <Box
          flexShrink={0}
          px={2.5}
          py={1}
          borderRadius="full"
          bg={result.status === "complete" ? "blue.600" : "orange.500"}
          color="white"
          fontSize="0.68rem"
          fontWeight="900"
        >
          {result.status === "complete" ? "計算済み" : "一部未確定"}
        </Box>
      </Flex>

      {!compact && (
        <Flex mt={4} flexDirection="column" gap={2}>
          {result.lines.map(line => (
            <Flex
              key={line.groupId}
              alignItems="flex-start"
              justifyContent="space-between"
              gap={3}
              pb={2}
              borderBottom="1px solid"
              borderColor="blackAlpha.100"
            >
              <Box minW={0}>
                <Text color="gray.800" fontSize="sm" fontWeight="800">
                  {line.groupLabel} × {line.count}
                </Text>
                <Text mt={0.5} color="gray.600" fontSize="xs">
                  {line.offerName ?? line.note}
                </Text>
              </Box>
              <Text
                flexShrink={0}
                color="gray.900"
                fontFamily="mono"
                fontSize="sm"
                fontWeight="900"
              >
                {line.subtotal == null
                  ? "未確定"
                  : `¥${line.subtotal.toLocaleString("ja-JP")}`}
              </Text>
            </Flex>
          ))}
        </Flex>
      )}

      {result.conditionalOfferNames.length > 0 && !compact && (
        <Text mt={3} color="purple.800" fontSize="xs" lineHeight="1.6">
          条件を満たす場合に使える可能性がある割引:{" "}
          {result.conditionalOfferNames.join("、")}
        </Text>
      )}
      {result.notes.length > 0 && !compact && (
        <Text mt={3} color="gray.600" fontSize="xs" lineHeight="1.6">
          {result.notes.join(" / ")}
        </Text>
      )}
    </Box>
  );
};
