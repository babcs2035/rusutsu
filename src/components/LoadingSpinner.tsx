"use client";

import { Flex, Spinner, Text } from "@chakra-ui/react";

/**
 * 中央に表示されるアニメーション付きローディングスピナー
 */
export const LoadingSpinner = ({
  text = "読み込み中...",
}: {
  text?: string;
}) => {
  return (
    <Flex
      h="100%"
      w="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap={4}
      bg="var(--bg-light)"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="xl" color="brand.500" borderWidth="4px" />
      <Text fontSize="lg" fontWeight="semibold" color="gray.600">
        {text}
      </Text>
    </Flex>
  );
};
