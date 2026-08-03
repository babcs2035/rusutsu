"use client";

import { Box, Button, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { ResortReviewData, ReviewCategoryId, ReviewScore } from "../types";

const SCORE_STYLES: Record<
  ReviewScore,
  { background: string; color: string; border: string }
> = {
  "◎": {
    background: "green.50",
    color: "green.800",
    border: "green.200",
  },
  "○": {
    background: "blue.50",
    color: "blue.800",
    border: "blue.200",
  },
  "△": {
    background: "orange.50",
    color: "orange.800",
    border: "orange.200",
  },
};

export const ResortReviewSection = ({
  review,
}: {
  review: ResortReviewData;
}) => {
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<ReviewCategoryId | null>(null);
  const selectedCategory = review.categories.find(
    category => category.id === selectedCategoryId,
  );
  const scoredCategories = review.categories.filter(
    category => category.score !== null,
  );

  return (
    <Box as="section">
      <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
        滑走者レビューから分かる特徴
      </Heading>
      {review.fullArticle ? (
        <Text
          mt={4}
          whiteSpace="pre-wrap"
          color="gray.700"
          lineHeight="1.85"
          fontSize="md"
        >
          {review.fullArticle}
        </Text>
      ) : (
        <Box
          mt={4}
          p={4}
          borderRadius="xl"
          bg="orange.50"
          border="1px solid"
          borderColor="orange.200"
        >
          <Text color="orange.900" fontSize="sm" fontWeight="800">
            調査詳細はありますが、表示用の概要記事がまだありません。
          </Text>
        </Box>
      )}

      {scoredCategories.length > 0 && (
        <>
          <Text mt={5} mb={2} color="gray.600" fontSize="xs" fontWeight="800">
            項目をタップすると詳しい評価が開きます
          </Text>
          <Grid
            templateColumns={{
              base: "repeat(2, minmax(0, 1fr))",
              sm: "repeat(3, minmax(0, 1fr))",
              md: "repeat(4, minmax(0, 1fr))",
            }}
            gap={2}
          >
            {scoredCategories.map(category => {
              const score = category.score as ReviewScore;
              const styles = SCORE_STYLES[score];
              const isSelected = selectedCategoryId === category.id;
              return (
                <Button
                  key={category.id}
                  type="button"
                  h="auto"
                  minH={12}
                  px={3}
                  py={2}
                  justifyContent="space-between"
                  borderRadius="xl"
                  bg={styles.background}
                  color={styles.color}
                  border="1px solid"
                  borderColor={isSelected ? styles.color : styles.border}
                  boxShadow={isSelected ? "sm" : "none"}
                  onClick={() =>
                    setSelectedCategoryId(current =>
                      current === category.id ? null : category.id,
                    )
                  }
                >
                  <Box as="span" textAlign="left">
                    <Box as="span" display="block" fontSize="0.72rem">
                      {category.label}
                    </Box>
                    <Box as="span" display="block" fontSize="xl" lineHeight="1">
                      {score}
                    </Box>
                  </Box>
                  <Box as={isSelected ? ChevronUp : ChevronDown} boxSize={4} />
                </Button>
              );
            })}
          </Grid>
        </>
      )}

      {selectedCategory && (
        <Box
          mt={3}
          p={{ base: 4, md: 5 }}
          borderRadius="2xl"
          bg="white"
          border="1px solid"
          borderColor="gray.200"
          boxShadow="sm"
        >
          <Flex alignItems="center" gap={2}>
            <Text color="gray.900" fontSize="lg" fontWeight="900">
              {selectedCategory.label}
            </Text>
            {selectedCategory.score && (
              <Box
                px={2}
                py={0.5}
                borderRadius="full"
                bg={SCORE_STYLES[selectedCategory.score].background}
                color={SCORE_STYLES[selectedCategory.score].color}
                fontWeight="900"
              >
                {selectedCategory.score}
              </Box>
            )}
          </Flex>
          {selectedCategory.good && (
            <Box mt={4}>
              <Text color="green.800" fontSize="xs" fontWeight="900">
                良い点
              </Text>
              <Text mt={1} color="gray.700" fontSize="sm" lineHeight="1.8">
                {selectedCategory.good}
              </Text>
            </Box>
          )}
          {selectedCategory.concern && (
            <Box mt={4}>
              <Text color="orange.800" fontSize="xs" fontWeight="900">
                気になる点
              </Text>
              <Text mt={1} color="gray.700" fontSize="sm" lineHeight="1.8">
                {selectedCategory.concern}
              </Text>
            </Box>
          )}
          {selectedCategory.courses.length > 0 && (
            <Box mt={4}>
              <Text color="blue.800" fontSize="xs" fontWeight="900">
                代表的なコース情報
              </Text>
              <Flex mt={1.5} flexDirection="column" gap={2}>
                {selectedCategory.courses.map(course => (
                  <Text
                    key={course}
                    color="gray.700"
                    fontSize="sm"
                    lineHeight="1.7"
                  >
                    ・{course}
                  </Text>
                ))}
              </Flex>
            </Box>
          )}
        </Box>
      )}

      {review.dataIssues.length > 0 && (
        <Text mt={3} color="gray.500" fontSize="0.7rem" lineHeight="1.6">
          データ注記: {review.dataIssues.join(" / ")}
        </Text>
      )}
    </Box>
  );
};
