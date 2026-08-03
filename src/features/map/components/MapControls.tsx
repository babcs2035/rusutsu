"use client";

import { Box, Button, Flex } from "@chakra-ui/react";
import { ChevronDown, ChevronUp, Home } from "lucide-react";
import { useState } from "react";
import { useMap } from "react-leaflet";
import {
  COURSE_DIFFICULTY_META,
  SLOPE_COLOR_STOPS,
} from "@/lib/finalizedResortGeojsonShared";
import { GSI_TILE_LAYERS, INITIAL_CENTER } from "../constants";
import type { CourseColorMode, MapTileVariant } from "../types";

export const MapControls = ({
  initialZoom,
  bottomPaddingRatio,
  mapTileVariant,
  onMapTileVariantChange,
  hideMobileTileVariantControl = false,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: {
  initialZoom: number;
  bottomPaddingRatio: number;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  hideMobileTileVariantControl?: boolean;
  onUserMapInteraction?: () => void;
  onUserMapZoomInteraction?: () => void;
}) => {
  const map = useMap();
  const mobileBottomOffset =
    bottomPaddingRatio > 0
      ? `clamp(1rem, calc(${bottomPaddingRatio * 100}dvh + 1rem), calc(100dvh - 11rem))`
      : "1rem";

  return (
    <Flex
      position="absolute"
      left={{ base: "auto", md: 4 }}
      right={{ base: 4, md: "auto" }}
      bottom={{ base: mobileBottomOffset, md: 4 }}
      zIndex={1000}
      flexDirection="column"
      gap={2}
      alignItems="flex-start"
    >
      <Flex
        flexDirection="column"
        borderRadius="lg"
        bg="white"
        boxShadow="md"
        overflow="hidden"
        border="1px solid"
        borderColor="gray.200"
      >
        <Button
          onClick={() => {
            map.zoomIn();
            window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
          }}
          p={2}
          color="gray.700"
          bg="transparent"
          _hover={{ bg: "gray.50" }}
          borderRadius="0"
          fontSize="xl"
          fontWeight="700"
          minW={0}
          h={{ base: 10, md: 8 }}
          w={{ base: 10, md: 8 }}
        >
          +
        </Button>
        <Box h="1px" w="100%" bg="gray.100" />
        <Button
          onClick={() => {
            map.zoomOut();
            window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
          }}
          p={2}
          color="gray.700"
          bg="transparent"
          _hover={{ bg: "gray.50" }}
          borderRadius="0"
          fontSize="xl"
          fontWeight="700"
          minW={0}
          h={{ base: 10, md: 8 }}
          w={{ base: 10, md: 8 }}
        >
          -
        </Button>
      </Flex>
      <Button
        onClick={() => {
          onUserMapInteraction?.();
          map.setView(INITIAL_CENTER, initialZoom);
        }}
        borderRadius="lg"
        bg="white"
        p={2}
        color="gray.700"
        boxShadow="md"
        border="1px solid"
        borderColor="gray.200"
        _hover={{ bg: "gray.50" }}
        minW={0}
        h={{ base: 10, md: 8 }}
        w={{ base: 10, md: 8 }}
      >
        <Home size={18} />
      </Button>
      <Flex
        display={{
          base: hideMobileTileVariantControl ? "none" : "flex",
          md: "flex",
        }}
        borderRadius="lg"
        bg="white"
        boxShadow="md"
        overflow="hidden"
        border="1px solid"
        borderColor="gray.200"
      >
        {Object.entries(GSI_TILE_LAYERS).map(([variant, layer]) => {
          const tileVariant = variant as MapTileVariant;
          const isActive = mapTileVariant === tileVariant;

          return (
            <Button
              key={variant}
              onClick={() => onMapTileVariantChange(tileVariant)}
              aria-label={`${layer.label}に切り替え`}
              borderRadius="0"
              bg={isActive ? "blue.500" : "transparent"}
              color={isActive ? "white" : "gray.700"}
              _hover={{ bg: isActive ? "blue.600" : "gray.50" }}
              fontSize="xs"
              fontWeight="700"
              h={{ base: 9, md: 8 }}
              minW={0}
              px={{ base: 2.5, sm: 3 }}
            >
              {layer.label}
            </Button>
          );
        })}
      </Flex>
    </Flex>
  );
};

export const FinalizedMapModeControl = ({
  mode,
  onModeChange,
  hasCourses,
  hasLifts,
  showOpenOnly,
  onShowOpenOnlyChange,
}: {
  mode: CourseColorMode;
  onModeChange: (mode: CourseColorMode) => void;
  hasCourses: boolean;
  hasLifts: boolean;
  showOpenOnly: boolean;
  onShowOpenOnlyChange: (showOpenOnly: boolean) => void;
}) => {
  if (!hasCourses && !hasLifts) return null;

  return (
    <Flex
      overflow="hidden"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="lg"
      bg="white"
      boxShadow="md"
    >
      {hasCourses && (
        <Flex>
          {(["difficulty", "slope"] as const).map(value => (
            <Button
              key={value}
              type="button"
              aria-label={`コースの色分けを${value === "difficulty" ? "難易度" : "斜度"}に切り替え`}
              aria-pressed={mode === value}
              h={{ base: 9, md: 8 }}
              minW={0}
              borderRadius={0}
              bg={mode === value ? "blue.500" : "white"}
              color={mode === value ? "white" : "gray.700"}
              fontSize="xs"
              fontWeight="800"
              px={{ base: 2.5, sm: 3 }}
              _hover={{ bg: mode === value ? "blue.600" : "gray.50" }}
              onClick={() => onModeChange(value)}
            >
              {value === "difficulty" ? "難易度" : "斜度"}
            </Button>
          ))}
        </Flex>
      )}
      <Flex
        as="label"
        h={{ base: 9, md: 8 }}
        alignItems="center"
        gap={2}
        px={{ base: 2.5, sm: 3 }}
        cursor="pointer"
        bg="white"
        color="gray.700"
        fontSize="xs"
        fontWeight="800"
        borderLeft={hasCourses ? "1px solid" : 0}
        borderColor="gray.100"
        _hover={{ bg: "gray.50" }}
      >
        <input
          type="checkbox"
          aria-label="営業中のみ表示"
          checked={showOpenOnly}
          style={{
            width: 14,
            height: 14,
            accentColor: "#22c55e",
          }}
          onChange={event => onShowOpenOnlyChange(event.currentTarget.checked)}
        />
        営業中のみ
      </Flex>
    </Flex>
  );
};

export const FinalizedMapLegend = ({
  mode,
  hasCourses,
  hasLifts,
}: {
  mode: CourseColorMode;
  hasCourses: boolean;
  hasLifts: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!hasCourses && !hasLifts) return null;

  return (
    <Box
      maxW={{ base: "calc(100vw - 2rem)", md: "620px" }}
      border="1px solid"
      borderColor="gray.200"
      borderRadius="lg"
      bg="rgba(255,255,255,0.96)"
      px={{ base: 2.5, md: 3 }}
      py={{ base: 1, md: 1 }}
      boxShadow="md"
      color="gray.800"
      fontSize="xs"
    >
      {hasCourses && mode === "difficulty" && (
        <Flex gap={2} wrap="wrap" alignItems="center">
          {(
            [
              "beginner",
              "beginnerIntermediate",
              "intermediate",
              "intermediateAdvanced",
              "advanced",
            ] as const
          ).map(key => (
            <Flex key={key} alignItems="center" gap={1.5}>
              <Box
                w={3}
                h={3}
                borderRadius="full"
                bg={COURSE_DIFFICULTY_META[key].color}
                border="1px solid rgba(15,23,42,0.18)"
              />
              <Box as="span" fontWeight="700">
                {COURSE_DIFFICULTY_META[key].label}
              </Box>
            </Flex>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            h={6}
            px={2}
            color="gray.600"
            fontWeight="700"
            onClick={() => setIsExpanded(current => !current)}
          >
            <Flex alignItems="center" gap={1}>
              <Box as="span">詳細</Box>
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </Flex>
          </Button>
        </Flex>
      )}
      {hasCourses && mode === "slope" && (
        <Flex alignItems="center" gap={2}>
          <Box w={{ base: "220px", md: "300px" }} maxW="calc(100vw - 9rem)">
            <Box
              h={2.5}
              borderRadius="full"
              bg={`linear-gradient(90deg, ${SLOPE_COLOR_STOPS.map(
                stop => `${stop.color} ${(stop.slope / 40) * 100}%`,
              ).join(", ")})`}
            />
            <Flex mt={1} justifyContent="space-between" fontWeight="700">
              <Box>0°</Box>
              <Box>10°</Box>
              <Box>20°</Box>
              <Box>30°</Box>
              <Box>40°+</Box>
            </Flex>
          </Box>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            h={6}
            px={2}
            color="gray.600"
            fontWeight="700"
            onClick={() => setIsExpanded(current => !current)}
          >
            <Flex alignItems="center" gap={1}>
              <Box as="span">詳細</Box>
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </Flex>
          </Button>
        </Flex>
      )}
      {isExpanded && (
        <>
          {hasCourses && (
            <Flex mt={2} gap={3} wrap="wrap" color="gray.600">
              <Flex alignItems="center" gap={1.5}>
                <Box
                  w={8}
                  h="8px"
                  borderBottom="5px solid rgba(125, 211, 252, 0.42)"
                />
                <Box>非圧雪</Box>
              </Flex>
            </Flex>
          )}
          {(hasCourses || hasLifts) && (
            <Flex mt={hasCourses ? 2 : 0} gap={3} wrap="wrap">
              <Flex alignItems="center" gap={1.5}>
                <Box w={5} h="3px" bg="#1D4ED8" />
                <Box>Open</Box>
              </Flex>
              <Flex alignItems="center" gap={1.5}>
                <Box
                  w={6}
                  h="3px"
                  bg="repeating-linear-gradient(90deg, #94A3B8 0 8px, transparent 8px 14px)"
                />
                <Box>一部・準備中</Box>
              </Flex>
              <Flex alignItems="center" gap={1.5}>
                <Box w={5} h="3px" bg="#CBD5E1" opacity={0.58} />
                <Box>Close</Box>
              </Flex>
            </Flex>
          )}
        </>
      )}
    </Box>
  );
};
