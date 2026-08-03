"use client";

import { Box, Button } from "@chakra-ui/react";
import { Search, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Props = {
  keyword: string;
  isHidden: boolean;
  placement?: "fixed" | "static";
  onKeywordClear: () => void;
  onOpen: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export const MobileSearchButton = ({
  keyword,
  isHidden,
  placement = "fixed",
  onKeywordClear,
  onOpen,
  onPointerDown,
}: Props) => (
  <Box
    display={{
      base: isHidden ? "none" : "flex",
      md: "none",
    }}
    position={placement === "static" ? "relative" : placement}
    top={
      placement === "fixed"
        ? "calc(env(safe-area-inset-top, 0px) + 0.75rem)"
        : undefined
    }
    left={placement === "fixed" ? 4 : undefined}
    right={placement === "fixed" ? 4 : undefined}
    zIndex={placement === "fixed" ? 200001 : undefined}
    w={placement === "static" ? "100%" : undefined}
    minW={0}
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
      pl={10}
      pr={keyword ? 10 : 3}
      borderRadius="full"
      border="1px solid"
      borderColor="rgba(226, 232, 240, 0.88)"
      bg="rgba(255, 255, 255, 0.97)"
      color={keyword ? "gray.800" : "gray.500"}
      fontSize="0.95rem"
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
        left={3.5}
        top="50%"
        transform="translateY(-50%)"
        color="gray.500"
        pointerEvents="none"
      >
        <Search size={18} />
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
    {keyword && (
      <Button
        type="button"
        aria-label="検索キーワードをクリア"
        position="absolute"
        top="50%"
        right={1.5}
        zIndex={2}
        transform="translateY(-50%)"
        w={8}
        h={8}
        minW={8}
        p={0}
        borderRadius="full"
        bg="transparent"
        color="gray.500"
        _hover={{ bg: "gray.100" }}
        // メインの検索ボタンを開かず、表示中のキーワードだけを消す。
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation();
          onKeywordClear();
        }}
      >
        <X size={18} />
      </Button>
    )}
  </Box>
);
