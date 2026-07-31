"use client";

import { Box, Button, Flex, Table, Text } from "@chakra-ui/react";
import { useState } from "react";
import {
  REVIEW_CATEGORY_IDS,
  REVIEW_CATEGORY_LABELS,
  type ReviewCategoryId,
  type ReviewScore,
} from "@/features/reviews/types";
import type { Resort } from "./types";

const SCORE_COLORS: Record<ReviewScore, string> = {
  "◎": "green.700",
  "○": "blue.700",
  "△": "orange.700",
};

const truncate = (value: string | null, maxLength = 92) => {
  if (!value) return null;
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength).trim()}…`;
};

export const CompareReviewsTab = ({ resorts }: { resorts: Resort[] }) => {
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<
    ReviewCategoryId[]
  >(["beginner", "intermediate", "powder"]);

  const toggleCategory = (categoryId: ReviewCategoryId) => {
    setSelectedCategoryIds(current =>
      current.includes(categoryId)
        ? current.filter(id => id !== categoryId)
        : [...current, categoryId],
    );
  };

  return (
    <Flex flexDirection="column" gap={4}>
      <Box>
        <Text color="gray.900" fontSize="sm" fontWeight="900">
          比較するレビュー項目
        </Text>
        <Text mt={1} color="gray.500" fontSize="xs">
          気になる滑り方だけを選ぶと、横並びで比較しやすくなります。
        </Text>
        <Flex mt={3} gap={2} flexWrap="wrap">
          {REVIEW_CATEGORY_IDS.map(categoryId => {
            const isSelected = selectedCategoryIds.includes(categoryId);
            return (
              <Button
                key={categoryId}
                type="button"
                size="xs"
                h={8}
                px={3}
                borderRadius="full"
                bg={isSelected ? "brand.600" : "white"}
                color={isSelected ? "white" : "gray.700"}
                border="1px solid"
                borderColor={isSelected ? "brand.600" : "gray.300"}
                aria-pressed={isSelected}
                onClick={() => toggleCategory(categoryId)}
              >
                {REVIEW_CATEGORY_LABELS[categoryId]}
              </Button>
            );
          })}
        </Flex>
      </Box>

      {selectedCategoryIds.length === 0 ? (
        <Box
          p={6}
          borderRadius="xl"
          bg="gray.50"
          border="1px dashed"
          borderColor="gray.300"
          textAlign="center"
        >
          <Text color="gray.600" fontSize="sm" fontWeight="700">
            比較する項目を1つ以上選んでください。
          </Text>
        </Box>
      ) : (
        <Box
          w="100%"
          overflowX="auto"
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.200"
          bg="white"
          boxShadow="sm"
        >
          <Table.Root
            size="sm"
            minW={`${220 + selectedCategoryIds.length * 240}px`}
          >
            <Table.Header>
              <Table.Row bg="gray.100">
                <Table.ColumnHeader
                  px={4}
                  py={3}
                  color="gray.600"
                  fontWeight="800"
                >
                  スキー場
                </Table.ColumnHeader>
                {selectedCategoryIds.map(categoryId => (
                  <Table.ColumnHeader
                    key={categoryId}
                    px={4}
                    py={3}
                    color="gray.600"
                    fontWeight="800"
                  >
                    {REVIEW_CATEGORY_LABELS[categoryId]}
                  </Table.ColumnHeader>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {resorts.map(resort => (
                <Table.Row key={resort.id} borderColor="gray.200">
                  <Table.Cell px={4} py={4} minW="220px" verticalAlign="top">
                    <Text color="gray.900" fontWeight="900">
                      {resort.nameJa}
                    </Text>
                    <Text mt={1} color="gray.500" fontSize="xs">
                      {resort.prefecture} • {resort.town}
                    </Text>
                  </Table.Cell>
                  {selectedCategoryIds.map(categoryId => {
                    const category = resort.reviewData?.categories.find(
                      candidate => candidate.id === categoryId,
                    );
                    return (
                      <Table.Cell
                        key={categoryId}
                        px={4}
                        py={4}
                        minW="240px"
                        verticalAlign="top"
                      >
                        {category?.score ? (
                          <>
                            <Text
                              color={SCORE_COLORS[category.score]}
                              fontSize="2xl"
                              fontWeight="900"
                              lineHeight="1"
                            >
                              {category.score}
                            </Text>
                            <Text
                              mt={2}
                              color="gray.700"
                              fontSize="xs"
                              lineHeight="1.65"
                            >
                              {truncate(category.good) ??
                                truncate(category.article) ??
                                "評価本文はありません。"}
                            </Text>
                            {category.concern && (
                              <Text
                                mt={2}
                                color="orange.800"
                                fontSize="0.7rem"
                                lineHeight="1.55"
                              >
                                注意: {truncate(category.concern, 70)}
                              </Text>
                            )}
                          </>
                        ) : (
                          <Text color="gray.400" fontSize="xs">
                            {resort.reviewData
                              ? "評価記事が未作成"
                              : "レビューデータなし"}
                          </Text>
                        )}
                      </Table.Cell>
                    );
                  })}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Flex>
  );
};
