"use client";

import { Box, Button, Flex, Input } from "@chakra-ui/react";
import { Search, X } from "lucide-react";
import type {
  ChangeEvent as ReactChangeEvent,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  RefObject,
} from "react";
import { FilterPanel } from "@/features/filters/FilterPanel";
import type { Filters } from "@/features/filters/types";
import type { MapSkiResort } from "@/types/skiResorts";
import {
  MOBILE_SEARCH_TOP_BAR_HEIGHT,
  MobileSearchTopBarShell,
} from "./MobileSearchTopBarShell";

type Props = {
  filters: Filters;
  resorts: MapSkiResort[];
  filteredResortCount: number;
  isOpen: boolean;
  isSidePanelLayout: boolean;
  overlayRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  filterBottomPadding: string;
  hasChanges: boolean;
  onClose: () => void;
  onFilterAreaPointerDown: (
    event: ReactPointerEvent<HTMLElement> | ReactTouchEvent<HTMLElement>,
  ) => void;
  onFilterChange: (filters: Filters) => void;
  onInputBlur: () => void;
  onInputFocus: () => void;
  onKeywordChange: (event: ReactChangeEvent<HTMLInputElement>) => void;
  onKeywordClear: () => void;
  onSearch: () => void;
  onSubmit: (event: ReactFormEvent<HTMLElement>) => void;
};

export const MobileSearchOverlay = ({
  filters,
  resorts,
  filteredResortCount,
  isOpen,
  isSidePanelLayout,
  overlayRef,
  inputRef,
  scrollRef,
  filterBottomPadding,
  hasChanges,
  onClose,
  onFilterAreaPointerDown,
  onFilterChange,
  onInputBlur,
  onInputFocus,
  onKeywordChange,
  onKeywordClear,
  onSearch,
  onSubmit,
}: Props) => {
  if (!isOpen || isSidePanelLayout) return null;

  const handleKeywordKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    event.currentTarget.blur();
  };

  return (
    <Box
      ref={overlayRef}
      data-mobile-search-panel="true"
      display={{ base: "flex", md: "none" }}
      h="100%"
      minH={0}
      flexDirection="column"
      bg="rgba(248, 250, 252, 0.98)"
      overflow="hidden"
    >
      <Box flex="0 0 auto">
        <MobileSearchTopBarShell
          background="rgba(248, 250, 252, 0.98)"
          onSubmit={onSubmit}
          action={
            <Flex minW={0} h={10} alignItems="center" gap={2} overflow="hidden">
              <Button
                type="submit"
                flex="1 1 auto"
                minW={0}
                h={10}
                px={3}
                borderRadius="full"
                bg="brand.500"
                color="white"
                fontSize="0.78rem"
                fontWeight="900"
                boxShadow="none"
                whiteSpace="nowrap"
                _hover={{ bg: "brand.600" }}
                disabled={!hasChanges}
                aria-label="検索条件を適用"
                _disabled={{
                  bg: "brand.100",
                  color: "white",
                  cursor: "not-allowed",
                  opacity: 0.82,
                }}
              >
                適用
              </Button>
              <Button
                type="button"
                aria-label="検索を閉じる"
                onClick={onClose}
                flex="0 0 auto"
                w={10}
                h={10}
                minW={10}
                p={0}
                borderRadius="full"
                bg="gray.900"
                color="white"
                boxShadow="none"
                _hover={{ bg: "gray.800" }}
              >
                <X size={18} strokeWidth={2.8} />
              </Button>
            </Flex>
          }
        >
          <Box
            position="relative"
            minW={0}
            h={12}
            borderRadius="full"
            bg="white"
            border="1px solid"
            borderColor="rgba(226, 232, 240, 0.88)"
            boxShadow="0 10px 30px rgba(15, 23, 42, 0.12)"
            overflow="hidden"
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
            <Input
              ref={inputRef}
              aria-label="スキー場を検索"
              type="text"
              value={filters.keyword}
              placeholder="スキー場名を入力"
              h={12}
              pl={10}
              pr={filters.keyword ? 11 : 3}
              borderRadius="full"
              border="0"
              borderLeft="0"
              borderRight="0"
              borderInlineStart="0"
              borderInlineEnd="0"
              appearance="none"
              bg="transparent"
              color="gray.800"
              fontSize="0.95rem"
              fontWeight="500"
              boxShadow="none"
              outline="none"
              _autofill={{
                boxShadow: "0 0 0 1000px transparent inset",
              }}
              _placeholder={{ color: "gray.500", fontWeight: "500" }}
              _focus={{ boxShadow: "none" }}
              _focusVisible={{ boxShadow: "none", outline: "none" }}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              onChange={onKeywordChange}
              onKeyDown={handleKeywordKeyDown}
            />
            {filters.keyword && (
              <Button
                type="button"
                aria-label="検索キーワードをクリア"
                position="absolute"
                top="50%"
                right={2.5}
                transform="translateY(-50%)"
                zIndex={1}
                display="flex"
                alignItems="center"
                justifyContent="center"
                w={7}
                h={7}
                minW={7}
                p={0}
                borderRadius="full"
                bg="transparent"
                color="gray.600"
                boxShadow="none"
                _hover={{ bg: "transparent", color: "gray.800" }}
                _active={{ bg: "transparent", color: "gray.800" }}
                onClick={onKeywordClear}
              >
                <X size={15} strokeWidth={2.7} />
              </Button>
            )}
          </Box>
        </MobileSearchTopBarShell>
      </Box>
      <Box
        ref={scrollRef}
        data-mobile-search-filter-scroll="true"
        flex="1 1 auto"
        minH={0}
        display="flex"
        flexDirection="column"
        overflowY="auto"
        overscrollBehavior="contain"
        WebkitOverflowScrolling="touch"
        pb={filterBottomPadding}
        scrollPaddingTop={MOBILE_SEARCH_TOP_BAR_HEIGHT}
        scrollPaddingBottom={filterBottomPadding}
        onPointerDown={onFilterAreaPointerDown}
        onTouchStart={onFilterAreaPointerDown}
      >
        <FilterPanel
          filters={filters}
          resorts={resorts}
          resultCount={filteredResortCount}
          isExpanded
          canCollapse={false}
          onExpandedChange={() => undefined}
          onFilterChange={onFilterChange}
          onKeyboardInputBlur={onInputBlur}
          onKeyboardInputFocus={onInputFocus}
          onSearch={onSearch}
          scrollContent={false}
          showKeywordSearch={false}
          title="絞り込み"
        />
      </Box>
    </Box>
  );
};
