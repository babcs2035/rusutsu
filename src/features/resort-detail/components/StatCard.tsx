"use client";

import { Box, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

export const StatCard = ({
  title,
  value,
  valueColor = "gray.900",
}: {
  title: string;
  value: ReactNode;
  valueColor?: string;
}) => (
  <Box
    p={{ base: 2, md: 3 }}
    minH={{ base: "58px", md: "66px" }}
    borderRadius="lg"
    bg="white"
    border="1px solid"
    borderColor="gray.200"
    boxShadow="sm"
    transition="all 0.3s ease"
    _hover={{
      transform: "translateY(-2px)",
      borderColor: "brand.500",
      boxShadow: "md",
    }}
  >
    <Text
      fontSize={{ base: "10px", sm: "xs" }}
      color="gray.500"
      fontWeight="700"
      whiteSpace="nowrap"
      overflow="hidden"
      textOverflow="ellipsis"
    >
      {title}
    </Text>
    <Text
      fontWeight="800"
      mt={{ base: 0.5, md: 1 }}
      fontSize={{ base: "0.85rem", sm: "md", md: "lg" }}
      color={valueColor}
      fontFamily="var(--font-heading)"
      lineHeight="1.25"
    >
      {value}
    </Text>
  </Box>
);
