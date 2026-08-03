"use client";

import { Box, Button, Flex } from "@chakra-ui/react";
import { FilterPanel } from "@/features/filters/FilterPanel";
import type { Filters } from "@/features/filters/types";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import type { MapSkiResort } from "@/types/skiResorts";
import { SkiResortList } from "./SkiResortList";

type Props = {
  filters: Filters;
  resorts: MapSkiResort[];
  filteredResorts: MapSkiResort[];
  compareCount: number;
  hasSearched: boolean;
  isCompareOpen: boolean;
  isFilterEditorOpen: boolean;
  selectedCompareIdSet: Set<string>;
  onExpandedChange: (isExpanded: boolean) => void;
  onFilterChange: (filters: Filters) => void;
  onKeyboardInputBlur: () => void;
  onKeyboardInputFocus: () => void;
  onClearCompare: () => void;
  onOpenCompare: () => void;
  onSearch: () => void;
  onSelectResort: (id: string) => void;
  onToggleCompare: (id: string, selected: boolean) => void;
  onHoverResortChange: (id: string | null) => void;
};

export const DesktopSearchPanel = ({
  filters,
  resorts,
  filteredResorts,
  compareCount,
  hasSearched,
  isCompareOpen,
  isFilterEditorOpen,
  selectedCompareIdSet,
  onExpandedChange,
  onFilterChange,
  onKeyboardInputBlur,
  onKeyboardInputFocus,
  onClearCompare,
  onOpenCompare,
  onSearch,
  onSelectResort,
  onToggleCompare,
  onHoverResortChange,
}: Props) => (
  <Box
    display={{ base: "none", md: "block" }}
    h="100%"
    w="400px"
    flexShrink={0}
    borderLeft="1px solid"
    borderColor="gray.200"
    bg="rgba(255, 255, 255, 0.8)"
    backdropFilter="blur(16px)"
    position="relative"
    zIndex={10}
    boxShadow="-4px 0 20px rgba(0,0,0,0.05)"
  >
    <Flex h="100%" minH={0} flexDirection="column" overflow="hidden">
      <FilterPanel
        filters={filters}
        resorts={resorts}
        resultCount={filteredResorts.length}
        isExpanded={isFilterEditorOpen}
        canCollapse={hasSearched}
        onExpandedChange={onExpandedChange}
        onFilterChange={onFilterChange}
        onKeyboardInputBlur={onKeyboardInputBlur}
        onKeyboardInputFocus={onKeyboardInputFocus}
        onSearch={onSearch}
      />
      {compareCount > 0 && (
        <Flex
          display="flex"
          w="100%"
          flexShrink={0}
          gap={2}
          px={4}
          py={3}
          borderBottom="1px solid"
          borderColor="gray.100"
          bg="white"
        >
          <Button
            flex={1}
            minW={0}
            h={10}
            borderRadius="md"
            bg="orange.500"
            color="white"
            fontSize="sm"
            fontWeight="800"
            _hover={{ bg: "orange.600" }}
            onClick={onOpenCompare}
            disabled={isCompareOpen}
          >
            {compareCount} 件を比較
          </Button>
          <Button
            flex={1}
            minW={0}
            h={10}
            borderRadius="md"
            variant="outline"
            borderColor="gray.200"
            color="gray.700"
            fontSize="sm"
            fontWeight="800"
            _hover={{ bg: "gray.50" }}
            onClick={onClearCompare}
          >
            比較をクリア
          </Button>
        </Flex>
      )}
      {hasSearched && !isFilterEditorOpen && (
        <Box data-ski-resort-list-scroll-container="true" flexGrow={1} minH={0}>
          <SkiResortList
            resorts={filteredResorts}
            liftTicketInput={
              filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT
            }
            onSelectResort={onSelectResort}
            selectedCompareIdSet={selectedCompareIdSet}
            onToggleCompare={onToggleCompare}
            onHoverResortChange={onHoverResortChange}
            showHeader={false}
          />
        </Box>
      )}
    </Flex>
  </Box>
);
