"use client";

import { Box, Flex, Heading, Link, List, Table, Text } from "@chakra-ui/react";
import { ResortReviewSection } from "@/features/reviews/components/ResortReviewSection";
import type { Resort } from "../types";

export const OverviewTab = ({ resort }: { resort: Resort }) => (
  <Flex flexDirection="column" gap={10}>
    {resort.yukiMagi && (
      <Box
        as="section"
        bg="pink.50"
        p={6}
        borderRadius="2xl"
        border="1px solid"
        borderColor="pink.200"
      >
        <Flex alignItems="center" gap={3} mb={4}>
          <Heading size="md" color="pink.600" fontWeight="700">
            雪マジ！情報
          </Heading>
          {resort.yukiMagi.tag && (
            <Box
              px={3}
              py={1}
              bg="pink.100"
              color="pink.700"
              fontSize="xs"
              fontWeight="bold"
              borderRadius="full"
            >
              {resort.yukiMagi.tag}
            </Box>
          )}
        </Flex>

        <Flex flexDirection="column" gap={4}>
          {resort.yukiMagi.benefit && (
            <Box>
              <Text fontWeight="700" fontSize="xs" color="pink.700">
                特典内容
              </Text>
              <Text mt={1} fontSize="sm" color="gray.800" whiteSpace="pre-wrap">
                {resort.yukiMagi.benefit}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.period && (
            <Box>
              <Text fontWeight="700" fontSize="xs" color="pink.700">
                利用期間
              </Text>
              <Text mt={1} fontSize="sm" color="gray.800" whiteSpace="pre-wrap">
                {resort.yukiMagi.period}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.exclusionDate && (
            <Box>
              <Text fontWeight="700" fontSize="xs" color="pink.700">
                除外日
              </Text>
              <Text mt={1} fontSize="sm" color="gray.800" whiteSpace="pre-wrap">
                {resort.yukiMagi.exclusionDate}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.url && (
            <Link
              href={resort.yukiMagi.url}
              target="_blank"
              fontSize="xs"
              color="brand.600"
              textDecoration="underline"
              _hover={{
                color: "brand.700",
              }}
              display="inline-block"
              mt={2}
            >
              公式サイトで詳細を見る
            </Link>
          )}
        </Flex>
      </Box>
    )}
    <Box as="section">
      <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
        概要
      </Heading>
      <Text
        mt={4}
        whiteSpace="pre-wrap"
        color="gray.700"
        lineHeight="1.8"
        fontSize="md"
      >
        {resort.descriptionLong}
      </Text>
    </Box>
    {resort.reviewData && <ResortReviewSection review={resort.reviewData} />}
    <Box as="section">
      <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
        営業時間
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
              >
                区分
              </Table.ColumnHeader>
              <Table.ColumnHeader
                px={6}
                py={4}
                color="gray.600"
                fontWeight="700"
                fontSize="sm"
              >
                時間
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row borderColor="gray.200">
              <Table.Cell px={6} py={4} fontWeight="700" color="gray.800">
                平日
              </Table.Cell>
              <Table.Cell px={6} py={4} color="gray.600">
                {resort.weekdayOpen} - {resort.weekdayClose}
              </Table.Cell>
            </Table.Row>
            <Table.Row borderColor="transparent">
              <Table.Cell px={6} py={4} fontWeight="700" color="gray.800">
                土日祝
              </Table.Cell>
              <Table.Cell px={6} py={4} color="gray.600">
                {resort.weekendOpen} - {resort.weekendClose}
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Box>
      {resort.timesComment && (
        <Text mt={3} fontSize="sm" color="gray.500" fontStyle="italic">
          * {resort.timesComment}
        </Text>
      )}
    </Box>

    <Box as="section">
      <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
        リンク
      </Heading>
      <List.Root as="ul" mt={4} listStyleType="none" gap={3}>
        {resort.website && (
          <List.Item as="li">
            <Link
              href={resort.website}
              target="_blank"
              rel="noopener noreferrer"
              color="brand.600"
              display="flex"
              alignItems="center"
              gap={2}
              _hover={{
                color: "brand.700",
                textDecoration: "underline",
              }}
              transition="all 0.2s"
            >
              <Box as="span" h={2} w={2} borderRadius="full" bg="brand.500" />{" "}
              公式サイト
            </Link>
          </List.Item>
        )}
        {resort.sources.map((src: string) => (
          <List.Item key={src} as="li">
            <Link
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              color="gray.600"
              display="flex"
              alignItems="center"
              gap={2}
              _hover={{ color: "brand.600", textDecoration: "underline" }}
              transition="all 0.2s"
            >
              <Box as="span" h={2} w={2} borderRadius="full" bg="gray.400" />{" "}
              {new URL(src).hostname}
            </Link>
          </List.Item>
        ))}
      </List.Root>
    </Box>
  </Flex>
);
