"use client";

import { Box, Button } from "@chakra-ui/react";
import { Search } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Props = {
  keyword: string;
  isHidden: boolean;
  onOpen: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export const MobileSearchButton = ({
  keyword,
  isHidden,
  onOpen,
  onPointerDown,
}: Props) => (
  <Box
    display={{
      base: isHidden ? "none" : "flex",
      md: "none",
    }}
    position="fixed"
    top="calc(env(safe-area-inset-top, 0px) + 0.75rem)"
    left={4}
    right={4}
    zIndex={200001}
    pointerEvents="auto"
  >
    <Button
      type="button"
      aria-label="スキー場を検索"
      position="relative"
      zIndex={1}
      justifyContent="flex-start"
      w="100%"
      h={12}
      pl={12}
      pr={4}
      borderRadius="full"
      border="1px solid"
      borderColor="rgba(226, 232, 240, 0.88)"
      bg="rgba(255, 255, 255, 0.97)"
      color={keyword ? "gray.800" : "gray.500"}
      fontSize="1.05rem"
      fontWeight="500"
      boxShadow="0 10px 30px rgba(15, 23, 42, 0.18)"
      backdropFilter="blur(18px)"
      pointerEvents="auto"
      _hover={{ bg: "rgba(255, 255, 255, 0.98)" }}
      onPointerDown={onPointerDown}
      onClick={onOpen}
    >
      <Box
        position="absolute"
        left={4}
        top="50%"
        transform="translateY(-50%)"
        color="gray.500"
        pointerEvents="none"
      >
        <Search size={20} />
      </Box>
      <Box
        as="span"
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
      >
        {keyword || "スキー場を検索"}
      </Box>
    </Button>
  </Box>
);
