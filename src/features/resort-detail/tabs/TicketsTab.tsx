"use client";

import { Box, Flex, Heading, Table } from "@chakra-ui/react";
import type { Resort } from "../types";

export const TicketsTab = ({ resort }: { resort: Resort }) => {
  const tickets = resort.tickets;

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
