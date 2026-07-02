"use client";

import { Box, Button, Flex, Input } from "@chakra-ui/react";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft, X } from "lucide-react";
import type {
  ChangeEvent as ReactChangeEvent,
  FormEvent as ReactFormEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  RefObject,
} from "react";
import { FilterPanel } from "@/features/filters/FilterPanel";
import type { Filters } from "@/features/filters/types";
import type { MapSkiResort } from "@/types/skiResorts";

type Props = {
  filters: Filters;
  resorts: MapSkiResort[];
  filteredResortCount: number;
  canSearch: boolean;
  isOpen: boolean;
  isSidePanelLayout: boolean;
  overlayRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  filterBottomPadding: string;
  filterTop: string;
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
  canSearch,
  isOpen,
  isSidePanelLayout,
  overlayRef,
  inputRef,
  scrollRef,
  filterBottomPadding,
  filterTop,
  onClose,
  onFilterAreaPointerDown,
  onFilterChange,
  onInputBlur,
  onInputFocus,
  onKeywordChange,
  onKeywordClear,
  onSearch,
  onSubmit,
}: Props) => (
  <AnimatePresence>
    {isOpen && !isSidePanelLayout && (
      <Box
        data-mobile-search-panel="true"
        position="fixed"
        top={0}
        right={0}
        bottom={0}
        left={0}
        zIndex={200000}
        display={{ base: "block", md: "none" }}
        bg="rgba(248, 250, 252, 0.98)"
        overflow="hidden"
      >
        <Box
          ref={overlayRef}
          position="absolute"
          top={0}
          right={0}
          left={0}
          h="100dvh"
          minH={0}
          overflow="hidden"
          style={{ touchAction: "pan-y" }}
        >
          <Flex
            as="form"
            position="absolute"
            top={0}
            right={0}
            left={0}
            zIndex={1}
            alignItems="center"
            h="calc(env(safe-area-inset-top, 0px) + 4.5rem)"
            px={4}
            pt="calc(env(safe-area-inset-top, 0px) + 0.75rem)"
            pb={3}
            bg="rgba(248, 250, 252, 0.98)"
            borderBottom="1px solid"
            borderColor="gray.100"
            onSubmit={onSubmit}
          >
            <Flex
              position="relative"
              alignItems="center"
              w="100%"
              h={12}
              borderRadius="full"
              bg="gray.100"
              overflow="hidden"
            >
              <Button
                type="button"
                aria-label="検索を閉じる"
                flexShrink={0}
                w={12}
                h={12}
                minW={12}
                p={0}
                borderRadius="full"
                bg="transparent"
                color="gray.900"
                boxShadow="none"
                _hover={{ bg: "gray.200" }}
                onClick={onClose}
              >
                <ChevronLeft size={30} strokeWidth={2.7} />
              </Button>
              <Box position="relative" flex={1} minW={0}>
                <Input
                  ref={inputRef}
                  aria-label="スキー場を検索"
                  type="text"
                  value={filters.keyword}
                  placeholder="スキー場名を検索"
                  h={12}
                  px={0}
                  pr={filters.keyword ? 9 : 1}
                  borderRadius="0"
                  border="0"
                  borderLeft="0"
                  borderRight="0"
                  borderInlineStart="0"
                  borderInlineEnd="0"
                  appearance="none"
                  bg="transparent"
                  color="gray.800"
                  fontSize="1.1rem"
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
                />
                {filters.keyword && (
                  <Button
                    type="button"
                    aria-label="検索キーワードをクリア"
                    position="absolute"
                    top="50%"
                    right={0}
                    transform="translateY(-50%)"
                    w={8}
                    h={8}
                    minW={8}
                    p={0}
                    borderRadius="full"
                    bg="transparent"
                    color="gray.500"
                    _hover={{ bg: "gray.200" }}
                    onClick={onKeywordClear}
                  >
                    <X size={18} />
                  </Button>
                )}
              </Box>
              {canSearch && (
                <Button
                  type="submit"
                  flexShrink={0}
                  h={10}
                  minW="4.75rem"
                  mr={1}
                  px={4}
                  borderRadius="full"
                  bg="brand.500"
                  color="white"
                  fontSize="0.9rem"
                  fontWeight="900"
                  boxShadow="none"
                  _hover={{ bg: "brand.600" }}
                  aria-label="検索"
                >
                  検索
                </Button>
              )}
            </Flex>
          </Flex>
          <Box
            ref={scrollRef}
            data-mobile-search-filter-scroll="true"
            position="absolute"
            top={filterTop}
            right={0}
            bottom={0}
            left={0}
            display="flex"
            flexDirection="column"
            overflowY="auto"
            overscrollBehavior="contain"
            WebkitOverflowScrolling="touch"
            pb={filterBottomPadding}
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
      </Box>
    )}
  </AnimatePresence>
);
