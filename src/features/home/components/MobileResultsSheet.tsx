"use client";

import { Box } from "@chakra-ui/react";
import type { RefObject } from "react";
import { Drawer } from "vaul";
import type { MapSkiResort, SkiResortDetail } from "@/types/skiResorts";
import {
  BOTTOM_SHEET_EXPANDED_SNAP_POINT,
  BOTTOM_SHEET_MAP_PEEK_HEIGHT,
  BOTTOM_SHEET_SEARCH_SNAP_POINT,
  isBottomSheetExpanded,
} from "../constants";
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
  listSheetSnapPoint,
  snapPoints,
  selectedCompareIdSet,
  onCloseCompare,
  onHoverResortChange,
  onOpenChange,
  onSelectResort,
  onSetSnapPoint,
  onToggleCompare,
}: Props) => (
  <Box>
    {isBottomSheetExpanded(listSheetSnapPoint) && (
      <Box
        as="button"
        position="fixed"
        top={0}
        left={0}
        right={0}
        zIndex={10000}
        h={BOTTOM_SHEET_MAP_PEEK_HEIGHT}
        bg="transparent"
        aria-label="地図を表示"
        onClick={() => onSetSnapPoint(BOTTOM_SHEET_SEARCH_SNAP_POINT)}
      />
    )}
    <Drawer.Root
      open={isListSheetOpen}
      onOpenChange={onOpenChange}
      activeSnapPoint={listSheetSnapPoint}
      setActiveSnapPoint={onSetSnapPoint}
      snapPoints={snapPoints}
      dismissible={false}
      modal={false}
      noBodyStyles
      repositionInputs
    >
      <Drawer.Portal>
        <Drawer.Content
          ref={listSheetContentRef}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            borderTopLeftRadius: "1.5rem",
            borderTopRightRadius: "1.5rem",
            backgroundColor: "#ffffff",
            borderTop: "1px solid rgba(0, 0, 0, 0.06)",
            height: "calc(100dvh + env(safe-area-inset-bottom, 0px))",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.1)",
            outline: "none",
            touchAction: "pan-y",
          }}
        >
          <Drawer.Title
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              border: 0,
            }}
          >
            スキー場検索
          </Drawer.Title>
          <Drawer.Handle
            style={{
              width: "4rem",
              height: "0.25rem",
              flexShrink: 0,
              borderRadius: "999px",
              backgroundColor: "#d1d5db",
              margin: "0.5rem auto 0.25rem",
            }}
          />
          <Box h="calc(100dvh - 26px)" minH={0} bg="white">
            {isCompareOpen ? (
              <SkiResortCompareView
                resorts={compareResorts}
                isLoading={isCompareLoading}
                onClose={onCloseCompare}
                presentation="inline"
                canScrollContent={isBottomSheetExpanded(listSheetSnapPoint)}
                onContentScrollIntent={() =>
                  onSetSnapPoint(BOTTOM_SHEET_EXPANDED_SNAP_POINT)
                }
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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  </Box>
);
