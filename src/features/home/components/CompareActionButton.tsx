"use client";

import { Button } from "@chakra-ui/react";

type Props = {
  compareCount: number;
  isCompareOpen: boolean;
  isPinnedToTop: boolean;
  mobileBottom: string;
  onOpenCompare: () => void;
};

export const CompareActionButton = ({
  compareCount,
  isCompareOpen,
  isPinnedToTop,
  mobileBottom,
  onOpenCompare,
}: Props) => {
  if (compareCount === 0 || isCompareOpen) return null;

  return (
    <Button
      display={{ base: "inline-flex", md: "none" }}
      position="fixed"
      top={{
        base: isPinnedToTop ? 4 : "auto",
        md: "auto",
      }}
      right={{ base: 4, md: "424px" }}
      bottom={{ base: mobileBottom, md: 6 }}
      zIndex={210000}
      pointerEvents="auto"
      h={12}
      px={5}
      borderRadius="full"
      bg="gray.900"
      color="white"
      fontWeight="800"
      boxShadow="0 12px 30px rgba(0, 0, 0, 0.22)"
      _hover={{ bg: "gray.800", transform: "translateY(-1px)" }}
      onClick={onOpenCompare}
    >
      {compareCount} 件を比較
    </Button>
  );
};
