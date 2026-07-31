"use client";

import {
  Box,
  Button,
  Flex,
  Heading,
  Portal,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import type {
  CSSProperties,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { CompareLiftTicketTab } from "./compare/CompareLiftTicketTab";
import { CompareOverviewTab } from "./compare/CompareOverviewTab";
import { CompareReviewsTab } from "./compare/CompareReviewsTab";
import { CompareWeatherTab } from "./compare/CompareWeatherTab";
import type { Resort } from "./compare/types";

type Props = {
  resorts: Resort[];
  isLoading: boolean;
  onClose: () => void;
  presentation?: "sheet" | "inline";
  canScrollContent?: boolean;
  onContentScrollIntent?: () => void;
  initialLiftTicketInput: LiftTicketSearchInput;
};

const TABS = ["概要", "料金", "レビュー", "天候"] as const;
const BOTTOM_SHEET_EXPANDED_SNAP_POINT = 0.94;
const BOTTOM_SHEET_SNAP_POINTS = [
  0.12,
  0.52,
  BOTTOM_SHEET_EXPANDED_SNAP_POINT,
] as const;
const BOTTOM_SHEET_INITIAL_SNAP_POINT = BOTTOM_SHEET_SNAP_POINTS[1];
const BOTTOM_SHEET_MAP_PEEK_HEIGHT = "6vh";
const isBottomSheetExpanded = (snapPoint: number | string | null) =>
  typeof snapPoint === "number" &&
  Math.abs(snapPoint - BOTTOM_SHEET_EXPANDED_SNAP_POINT) < 0.001;
const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  border: 0,
};
const BOTTOM_SHEET_CONTENT_STYLE: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 100001,
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  borderTopLeftRadius: "1.5rem",
  borderTopRightRadius: "1.5rem",
  backgroundColor: "rgba(255, 255, 255, 0.98)",
  borderTop: "1px solid rgba(0, 0, 0, 0.05)",
  boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.14)",
};
const BOTTOM_SHEET_HANDLE_STYLE: CSSProperties = {
  width: "4rem",
  height: "0.375rem",
  flexShrink: 0,
  borderRadius: "999px",
  backgroundColor: "#d1d5db",
  margin: "1rem auto",
};
const MotionBox = motion.create(Box);

export const SkiResortCompareView = ({
  resorts,
  isLoading,
  onClose,
  presentation = "sheet",
  canScrollContent,
  onContentScrollIntent,
  initialLiftTicketInput,
}: Props) => {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("概要");
  const [sheetSnapPoint, setSheetSnapPoint] = useState<number | string | null>(
    BOTTOM_SHEET_INITIAL_SNAP_POINT,
  );
  const sheetContentTouchStartYRef = useRef<number | null>(null);
  const isSidePanel =
    useBreakpointValue({ base: false, md: true }, { ssr: false }) ?? false;
  const isSheetContentScrollable =
    canScrollContent ?? (isSidePanel || isBottomSheetExpanded(sheetSnapPoint));
  const panelVariants = isSidePanel
    ? {
        hidden: { opacity: 0, x: 24 },
        visible: { opacity: 1, x: 0 },
      }
    : {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      };

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const expandSheetFromContentScroll = useCallback(() => {
    if (isSheetContentScrollable) return;

    if (onContentScrollIntent) {
      onContentScrollIntent();
      return;
    }

    setSheetSnapPoint(BOTTOM_SHEET_EXPANDED_SNAP_POINT);
  }, [isSheetContentScrollable, onContentScrollIntent]);
  const handleCompareContentWheelCapture = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (isSheetContentScrollable || event.deltaY <= 0) return;

      event.preventDefault();
      expandSheetFromContentScroll();
    },
    [expandSheetFromContentScroll, isSheetContentScrollable],
  );
  const handleCompareContentTouchStartCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      sheetContentTouchStartYRef.current = event.touches[0]?.clientY ?? null;
    },
    [],
  );
  const handleCompareContentTouchMoveCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (isSheetContentScrollable) return;

      const startY = sheetContentTouchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY == null || currentY == null || startY - currentY < 8) return;

      event.preventDefault();
      expandSheetFromContentScroll();
    },
    [expandSheetFromContentScroll, isSheetContentScrollable],
  );

  const comparePanelContent = (
    <>
      <Button
        onClick={onClose}
        position="absolute"
        top={4}
        right={4}
        zIndex={20}
        display="flex"
        h={10}
        w={10}
        alignItems="center"
        justifyContent="center"
        borderRadius="full"
        bg="white"
        border="1px solid"
        borderColor="gray.200"
        fontSize="xl"
        color="gray.600"
        boxShadow="sm"
        _hover={{
          bg: "gray.50",
          color: "gray.900",
          transform: "scale(1.05)",
        }}
        minW="auto"
        p={0}
        aria-label="比較画面を閉じる"
      >
        ✕
      </Button>

      <Box
        px={{ base: 4, md: 8 }}
        pt={{ base: 6, md: 8 }}
        pb={5}
        borderBottom="1px solid"
        borderColor="gray.200"
      >
        <Heading size="2xl" color="gray.900" fontFamily="var(--font-heading)">
          スキー場比較
        </Heading>
        <Text mt={2} fontSize="sm" color="gray.500" fontWeight="700">
          {resorts.length} 件を比較中
        </Text>
      </Box>

      <Flex
        as="nav"
        borderBottom="1px solid"
        borderColor="gray.100"
        bg="rgba(255, 255, 255, 0.95)"
        backdropFilter="blur(16px)"
      >
        {TABS.map(tab => (
          <Button
            key={tab}
            onClick={() => setActiveTab(tab)}
            flex="1"
            py={4}
            textAlign="center"
            fontSize={{ base: "sm", md: "md" }}
            fontWeight="700"
            bg="transparent"
            borderRadius={0}
            borderBottom={activeTab === tab ? "2px solid" : "none"}
            borderColor={activeTab === tab ? "brand.500" : "transparent"}
            color={activeTab === tab ? "brand.600" : "gray.500"}
            _hover={{ bg: "gray.50", color: "brand.600" }}
          >
            {tab}
          </Button>
        ))}
      </Flex>

      <Box
        flexGrow={1}
        overflowY={isSheetContentScrollable ? "auto" : "hidden"}
        className="custom-scroll"
        onTouchMoveCapture={handleCompareContentTouchMoveCapture}
        onTouchStartCapture={handleCompareContentTouchStartCapture}
        onWheelCapture={handleCompareContentWheelCapture}
      >
        {isLoading ? (
          <Flex minH="360px" alignItems="center" justifyContent="center">
            <LoadingSpinner text="比較データを読み込み中..." />
          </Flex>
        ) : (
          <Box px={{ base: 2, md: 8 }} py={{ base: 4, md: 8 }} color="gray.800">
            {activeTab === "概要" && <CompareOverviewTab resorts={resorts} />}
            {activeTab === "料金" && (
              <CompareLiftTicketTab
                resorts={resorts}
                initialInput={initialLiftTicketInput}
              />
            )}
            {activeTab === "レビュー" && (
              <CompareReviewsTab resorts={resorts} />
            )}
            {activeTab === "天候" && (
              <CompareWeatherTab resorts={resorts} isSidePanel={isSidePanel} />
            )}
          </Box>
        )}
      </Box>
    </>
  );

  if (presentation === "inline") {
    return (
      <Box
        position="relative"
        display="flex"
        h="100%"
        minH={0}
        flexDirection="column"
        overflow="hidden"
        bg="white"
      >
        {comparePanelContent}
      </Box>
    );
  }

  return (
    <>
      {isSidePanel && (
        <Portal>
          <Flex
            position="fixed"
            inset={0}
            zIndex={100001}
            alignItems="center"
            justifyContent="flex-end"
            p={0}
            pointerEvents="none"
          >
            <MotionBox
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              position="absolute"
              inset={0}
              bg="transparent"
              backdropFilter="none"
              pointerEvents="none"
              aria-hidden="true"
            />
            <MotionBox
              data-ski-resort-compare-panel="true"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ type: "tween", duration: 0.18, ease: "easeOut" }}
              position="relative"
              zIndex={10}
              display="flex"
              h="100%"
              w="min(800px, 70vw)"
              maxW="none"
              flexDirection="column"
              overflow="hidden"
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              boxShadow="2xl"
              borderRadius="0"
              pointerEvents="auto"
            >
              {comparePanelContent}
            </MotionBox>
          </Flex>
        </Portal>
      )}
      {!isSidePanel && (
        <Box>
          {isBottomSheetExpanded(sheetSnapPoint) && (
            <Box
              as="button"
              position="fixed"
              top={0}
              left={0}
              right={0}
              zIndex={100002}
              h={BOTTOM_SHEET_MAP_PEEK_HEIGHT}
              bg="transparent"
              aria-label="地図を表示"
              onClick={() => setSheetSnapPoint(BOTTOM_SHEET_INITIAL_SNAP_POINT)}
            />
          )}
          <Drawer.Root
            open
            onOpenChange={open => {
              if (!open) onClose();
            }}
            activeSnapPoint={sheetSnapPoint}
            setActiveSnapPoint={setSheetSnapPoint}
            snapPoints={[...BOTTOM_SHEET_SNAP_POINTS]}
            modal={false}
            noBodyStyles
            snapToSequentialPoint
          >
            <Drawer.Portal>
              <Drawer.Content
                data-ski-resort-compare-panel="true"
                style={BOTTOM_SHEET_CONTENT_STYLE}
              >
                <Drawer.Title style={VISUALLY_HIDDEN_STYLE}>
                  スキー場比較
                </Drawer.Title>
                <Drawer.Handle style={BOTTOM_SHEET_HANDLE_STYLE} />
                <Box
                  position="relative"
                  display="flex"
                  h="calc(100vh - var(--snap-point-height, 0px) - 38px)"
                  flexDirection="column"
                  overflow="hidden"
                >
                  {comparePanelContent}
                </Box>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        </Box>
      )}
    </>
  );
};
