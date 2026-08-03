"use client";

import { Box, Flex, Heading, Table, Text } from "@chakra-ui/react";
import { LiftTicketCalculator } from "@/features/lift-ticket/components/LiftTicketCalculator";
import { LiftTicketPriceTable } from "@/features/lift-ticket/components/LiftTicketPriceTable";
import type { Resort } from "../types";

export const TicketsTab = ({ resort }: { resort: Resort }) => {
  const tickets = resort.tickets;
  const liftTicketData = resort.liftTickets[0] ?? null;

  if (liftTicketData) {
    return (
      <Flex flexDirection="column" gap={8}>
        <LiftTicketCalculator seasons={resort.liftTickets} />
        <Box as="section">
          <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
            公式リフト料金表
          </Heading>
          <Text mt={2} mb={4} color="gray.600" fontSize="sm">
            {liftTicketData.season.label_ja}
            の券種・対象・適用日を表示しています。
          </Text>
          <LiftTicketPriceTable data={liftTicketData} />
        </Box>
        {(liftTicketData.data_quality.unresolved_questions?.length ?? 0) >
          0 && (
          <Box
            p={4}
            borderRadius="xl"
            bg="orange.50"
            border="1px solid"
            borderColor="orange.200"
          >
            <Text color="orange.900" fontSize="sm" fontWeight="900">
              公式資料だけでは確定できない条件があります
            </Text>
            <Flex mt={2} flexDirection="column" gap={1.5}>
              {liftTicketData.data_quality.unresolved_questions
                ?.slice(0, 5)
                .map(question => (
                  <Text
                    key={question.id}
                    color="orange.900"
                    fontSize="xs"
                    lineHeight="1.6"
                  >
                    ・{question.question_ja}
                  </Text>
                ))}
            </Flex>
          </Box>
        )}
      </Flex>
    );
  }

  return (
    <Flex flexDirection="column" gap={10}>
      <Box as="section">
        <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
          リフト券
        </Heading>
        <Box
          mt={4}
          w="100%"
          overflowX="auto"
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.200"
          bg="white"
        >
          <Table.Root size="md">
            <Table.Header>
              <Table.Row bg="gray.100">
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  券種
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  大人
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  子供
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  シニア
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {tickets.map(t => (
                <Table.Row
                  key={t.id}
                  borderColor="gray.200"
                  _hover={{ bg: "gray.50" }}
                >
                  <Table.Cell
                    px={6}
                    py={4}
                    fontWeight="700"
                    color="gray.800"
                    whiteSpace="nowrap"
                  >
                    {t.name}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.800"
                    fontFamily="mono"
                    fontWeight="700"
                    whiteSpace="nowrap"
                  >
                    {t.priceAdult ? `¥${t.priceAdult.toLocaleString()}` : "-"}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.800"
                    fontFamily="mono"
                    fontWeight="700"
                    whiteSpace="nowrap"
                  >
                    {t.priceChild ? `¥${t.priceChild.toLocaleString()}` : "-"}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.800"
                    fontFamily="mono"
                    fontWeight="700"
                    whiteSpace="nowrap"
                  >
                    {t.priceSenior ? `¥${t.priceSenior.toLocaleString()}` : "-"}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Box>
    </Flex>
  );
};
