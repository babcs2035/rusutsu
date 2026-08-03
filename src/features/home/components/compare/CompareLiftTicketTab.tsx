"use client";

import { Box, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { useState } from "react";
import { TicketCalculationCard } from "@/features/lift-ticket/components/TicketCalculationCard";
import { TicketPartyEditor } from "@/features/lift-ticket/components/TicketPartyEditor";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { calculateLiftTicketForSeasons } from "@/features/lift-ticket/utils/calculateLiftTicket";
import type { Resort } from "./types";

export const CompareLiftTicketTab = ({
  resorts,
  initialInput,
}: {
  resorts: Resort[];
  initialInput: LiftTicketSearchInput;
}) => {
  const [input, setInput] = useState<LiftTicketSearchInput>(initialInput);

  return (
    <Flex flexDirection="column" gap={5}>
      <Box
        p={{ base: 4, md: 5 }}
        borderRadius="2xl"
        bg="blue.50"
        border="1px solid"
        borderColor="blue.200"
      >
        <Heading size="md" color="blue.950">
          同じ日程・メンバーで比較
        </Heading>
        <Text mt={1.5} mb={4} color="blue.900" fontSize="xs">
          詳細料金データがあるスキー場は、同じ条件で合計を比較できます。
        </Text>
        <TicketPartyEditor value={input} onChange={setInput} />
      </Box>
      <Grid
        templateColumns={{
          base: "minmax(0, 1fr)",
          lg: "repeat(2, minmax(0, 1fr))",
        }}
        gap={4}
      >
        {resorts.map(resort => {
          const result = calculateLiftTicketForSeasons(
            resort.liftTickets,
            input,
          );
          return (
            <Box
              key={resort.id}
              p={4}
              borderRadius="2xl"
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              boxShadow="sm"
            >
              <Text mb={3} color="gray.900" fontWeight="900">
                {resort.nameJa}
              </Text>
              <TicketCalculationCard result={result} />
            </Box>
          );
        })}
      </Grid>
    </Flex>
  );
};
