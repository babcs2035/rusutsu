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
      bg="#f1f5f9"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="xl" color="#0ea5e9" borderWidth="4px" />
      <Text fontSize="lg" fontWeight="semibold" color="#475569">
        {text}
      </Text>
    </Flex>
  );
};
