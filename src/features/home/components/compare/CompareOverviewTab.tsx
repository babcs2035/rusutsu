"use client";

import { Box, Table, Text } from "@chakra-ui/react";
import type { Resort } from "./types";

export const CompareOverviewTab = ({ resorts }: { resorts: Resort[] }) => (
  <Box
    w="100%"
    overflowX="auto"
    borderRadius="xl"
    border="1px solid"
    borderColor="gray.200"
    bg="white"
    boxShadow="sm"
  >
    <Table.Root size="md" minW="760px">
      <Table.Header>
        <Table.Row bg="gray.100">
          <Table.ColumnHeader px={6} py={4} color="gray.600" fontWeight="700">
            スキー場
          </Table.ColumnHeader>
          <Table.ColumnHeader px={6} py={4} color="gray.600" fontWeight="700">
            コース数
          </Table.ColumnHeader>
          <Table.ColumnHeader px={6} py={4} color="gray.600" fontWeight="700">
            リフト数
          </Table.ColumnHeader>
          <Table.ColumnHeader px={6} py={4} color="gray.600" fontWeight="700">
            最高標高
          </Table.ColumnHeader>
          <Table.ColumnHeader px={6} py={4} color="gray.600" fontWeight="700">
            最低標高
          </Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {resorts.map(resort => (
          <Table.Row key={resort.id} borderColor="gray.200">
            <Table.Cell px={6} py={4} minW="220px">
              <Text
                color="gray.900"
                fontWeight="800"
                fontFamily="var(--font-heading)"
              >
                {resort.nameJa}
              </Text>
              <Text mt={1} fontSize="xs" color="gray.500" fontWeight="700">
                {resort.prefecture} • {resort.town}
              </Text>
            </Table.Cell>
            <OverviewTableValue value={`${resort.numberOfCourses}`} />
            <OverviewTableValue value={`${resort.numberOfLifts}`} />
            <OverviewTableValue
              value={`${resort.topElevation.toLocaleString()} m`}
            />
            <OverviewTableValue
              value={`${resort.baseElevation.toLocaleString()} m`}
            />
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  </Box>
);

const OverviewTableValue = ({ value }: { value: string }) => (
  <Table.Cell
    px={6}
    py={4}
    color="gray.900"
    fontWeight="800"
    fontFamily="var(--font-heading)"
    whiteSpace="nowrap"
  >
    {value}
  </Table.Cell>
);
