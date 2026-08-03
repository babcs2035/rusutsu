"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import type { TicketCalculationResult } from "../types";
import { SourceList, SourceMarks } from "./SourceMarks";

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

  if (
    result.status === "unavailable" ||
    result.status === "outside_season" ||
    result.status === "closed"
  ) {
    // ★営業していない日に料金を出さない。定休日・期間外は理由を注意色で出す
    const isAlert =
      result.status === "outside_season" || result.status === "closed";
    return (
      <Box
        p={compact ? 3 : 4}
        borderRadius="xl"
        bg={isAlert ? "orange.50" : "gray.50"}
        border="1px solid"
        borderColor={isAlert ? "orange.200" : "gray.200"}
      >
        <Text
          color={isAlert ? "orange.800" : "gray.600"}
          fontSize="sm"
          fontWeight="800"
        >
          {result.status === "closed"
            ? "この日は営業していません"
            : result.notes[0]}
        </Text>
        {result.status === "closed" && result.notes[0] && (
          <Text mt={1} color="gray.700" fontSize="xs" lineHeight="1.6">
            {result.notes[0]}
          </Text>
        )}
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
      p={compact ? 1.5 : 5}
      borderRadius="xl"
      bg={result.status === "complete" ? "blue.50" : "orange.50"}
      border="1px solid"
      borderColor={result.status === "complete" ? "blue.200" : "orange.200"}
    >
      <Flex alignItems="flex-start" justifyContent="space-between" gap={3}>
        <Box minW={0}>
          <Text
            mt={1}
            color="gray.900"
            fontSize={compact ? "lg" : "2xl"}
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
                {line.standardSubtotal != null && (
                  <Text mt={0.5} color="gray.500" fontSize="xs">
                    通常料金{" "}
                    <Box as="span" textDecoration="line-through">
                      ¥{line.standardSubtotal.toLocaleString("ja-JP")}
                    </Box>
                    {" → "}
                    {line.offerName}
                  </Text>
                )}
                {line.warnings?.map(warning => (
                  <Text key={warning} mt={0.5} color="orange.800" fontSize="xs">
                    ※ {warning}
                  </Text>
                ))}
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
                <SourceMarks
                  numbers={line.sourceNumbers}
                  references={result.references}
                />
              </Text>
            </Flex>
          ))}
        </Flex>
      )}

      {result.conditionalOffers.length > 0 && !compact && (
        <Box
          mt={3}
          p={3}
          borderRadius="lg"
          bg="purple.50"
          border="1px solid"
          borderColor="purple.200"
        >
          <Text color="purple.900" fontSize="xs" fontWeight="900">
            条件を満たす場合の割引料金
          </Text>
          <Flex mt={2} flexDirection="column" gap={2}>
            {result.conditionalOffers.map(offer => (
              <Flex
                key={offer.id}
                alignItems="flex-start"
                justifyContent="space-between"
                gap={3}
              >
                <Box minW={0}>
                  <Text color="purple.900" fontSize="xs" fontWeight="800">
                    {offer.offerName}（{offer.groupLabel} × {offer.count}）
                  </Text>
                  <Text mt={0.5} color="purple.800" fontSize="xs">
                    {offer.conditions.length > 0
                      ? offer.conditions.join(" / ")
                      : "公式の適用条件を確認してください。"}
                  </Text>
                </Box>
                <Text
                  flexShrink={0}
                  color="purple.900"
                  fontFamily="mono"
                  fontSize="xs"
                  fontWeight="900"
                >
                  ¥{offer.subtotal.toLocaleString("ja-JP")}
                  <SourceMarks
                    numbers={offer.sourceNumbers}
                    references={result.references}
                  />
                </Text>
              </Flex>
            ))}
          </Flex>
        </Box>
      )}
      {result.references.length > 0 && !compact && (
        <Box mt={3}>
          <SourceList references={result.references} />
        </Box>
      )}
      {result.notes.length > 0 && !compact && (
        <Text mt={3} color="gray.600" fontSize="xs" lineHeight="1.6">
          {result.notes.join(" / ")}
        </Text>
      )}
    </Box>
  );
};
