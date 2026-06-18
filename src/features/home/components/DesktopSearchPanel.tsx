"use client";

import { Box, Flex } from "@chakra-ui/react";
import { FilterPanel } from "@/features/filters/FilterPanel";
import type { Filters } from "@/features/filters/types";
import type { MapSkiResort } from "@/types/skiResorts";
import { SkiResortList } from "./SkiResortList";

type Props = {
  filters: Filters;
  resorts: MapSkiResort[];
  filteredResorts: MapSkiResort[];
  hasSearched: boolean;
  isFilterEditorOpen: boolean;
  selectedCompareIdSet: Set<string>;
  onExpandedChange: (isExpanded: boolean) => void;
  onFilterChange: (filters: Filters) => void;
  onKeyboardInputBlur: () => void;
  onKeyboardInputFocus: () => void;
  onSearch: () => void;
  onSelectResort: (id: string) => void;
  onToggleCompare: (id: string, selected: boolean) => void;
  onHoverResortChange: (id: string | null) => void;
};

export const DesktopSearchPanel = ({
  filters,
  resorts,
  filteredResorts,
  hasSearched,
  isFilterEditorOpen,
  selectedCompareIdSet,
  onExpandedChange,
  onFilterChange,
  onKeyboardInputBlur,
  onKeyboardInputFocus,
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
      {hasSearched && !isFilterEditorOpen && (
        <Box data-ski-resort-list-scroll-container="true" flexGrow={1} minH={0}>
          <SkiResortList
            resorts={filteredResorts}
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
