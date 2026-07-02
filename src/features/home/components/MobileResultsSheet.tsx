"use client";

import { Box } from "@chakra-ui/react";
import type { RefObject } from "react";
import type { MapSkiResort, SkiResortDetail } from "@/types/skiResorts";
import { SkiResortCompareView } from "./SkiResortCompareView";
import { SkiResortList } from "./SkiResortList";

type Props = {
  compareResorts: SkiResortDetail[];
  filteredResorts: MapSkiResort[];
  hasSearched: boolean;
  isCompareLoading: boolean;
  isCompareOpen: boolean;
  isListSheetOpen: boolean;
  listSheetContentRef: RefObject<HTMLDivElement | null>;
  listSheetSnapPoint: number | string | null;
  snapPoints: (number | string)[];
  selectedCompareIdSet: Set<string>;
  onCloseCompare: () => void;
  onHoverResortChange: (id: string | null) => void;
  onOpenChange: (open: boolean) => void;
  onSelectResort: (id: string) => void;
  onSetSnapPoint: (snapPoint: number | string | null) => void;
  onToggleCompare: (id: string, selected: boolean) => void;
};

export const MobileResultsSheet = ({
  compareResorts,
  filteredResorts,
  hasSearched,
  isCompareLoading,
  isCompareOpen,
  isListSheetOpen,
  listSheetContentRef,
  selectedCompareIdSet,
  onCloseCompare,
  onHoverResortChange,
  onSelectResort,
  onToggleCompare,
}: Props) => (
  <Box
    ref={listSheetContentRef}
    data-mobile-results-panel="true"
    position="relative"
    h="100%"
    minH={0}
    display={{ base: isListSheetOpen ? "flex" : "none", md: "none" }}
    flexDirection="column"
    bg="white"
    overflow="hidden"
  >
    {isCompareOpen ? (
      <SkiResortCompareView
        resorts={compareResorts}
        isLoading={isCompareLoading}
        onClose={onCloseCompare}
        presentation="inline"
        canScrollContent
      />
    ) : (
      <Box
        data-ski-resort-list-scroll-container="true"
        h="100%"
        minH={0}
        overflowY="auto"
      >
        {hasSearched && (
          <SkiResortList
            resorts={filteredResorts}
            onSelectResort={onSelectResort}
            selectedCompareIdSet={selectedCompareIdSet}
            onToggleCompare={onToggleCompare}
            onHoverResortChange={onHoverResortChange}
            showHeader={false}
          />
        )}
      </Box>
    )}
  </Box>
);
