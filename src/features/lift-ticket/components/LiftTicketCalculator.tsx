"use client";

import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import type { LiftTicketData, LiftTicketSearchInput } from "../types";
import {
  calculateLiftTicket,
  DEFAULT_LIFT_TICKET_SEARCH_INPUT,
  getDailyLiftTicketProducts,
  selectLiftTicketSeason,
  selectPreferredDailyProduct,
} from "../utils/calculateLiftTicket";
import { TicketCalculationCard } from "./TicketCalculationCard";
import { TicketPartyEditor } from "./TicketPartyEditor";

export const LiftTicketCalculator = ({
  seasons,
  initialInput = DEFAULT_LIFT_TICKET_SEARCH_INPUT,
}: {
  seasons: LiftTicketData[];
  initialInput?: LiftTicketSearchInput;
}) => {
  const [input, setInput] = useState<LiftTicketSearchInput>(initialInput);
  const data =
    selectLiftTicketSeason(seasons, input.visitDate) ?? seasons[0] ?? null;
  const productOptions = useMemo(
    () =>
      (data ? getDailyLiftTicketProducts(data) : []).map(product => ({
        id: product.id,
        label: product.name_ja,
      })),
    [data],
  );
  const [requestedProductId, setRequestedProductId] = useState("");
  const selectedProductId = productOptions.some(
    option => option.id === requestedProductId,
  )
    ? requestedProductId
    : data
      ? (selectPreferredDailyProduct(data, input.usePreference)?.id ??
        productOptions[0]?.id ??
        "")
      : "";
  const result = data
    ? calculateLiftTicket(data, input, selectedProductId)
    : null;

  return (
    <Box
      as="section"
      p={{ base: 4, md: 5 }}
      borderRadius="2xl"
      bg="gray.50"
      border="1px solid"
      borderColor="gray.200"
    >
      <Heading size="md" color="gray.900" fontFamily="var(--font-heading)">
        日付・人数から料金を計算
      </Heading>
      <Text mt={1.5} color="gray.600" fontSize="xs" lineHeight="1.6">
        公式料金データだけを使い、同じ日に自動適用できる特定日割引を含めて計算します。
      </Text>
      <Flex mt={4} flexDirection="column" gap={4}>
        <TicketPartyEditor
          value={input}
          onChange={setInput}
          productOptions={productOptions}
          selectedProductId={selectedProductId}
          onProductChange={setRequestedProductId}
        />
        <TicketCalculationCard result={result} />
      </Flex>
    </Box>
  );
};
