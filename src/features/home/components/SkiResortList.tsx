"use client";

import { Box, Button, Flex, Heading, List, Text } from "@chakra-ui/react";
import { Check, Plus } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { memo, startTransition, useCallback, useEffect, useState } from "react";
import { TicketCalculationCard } from "@/features/lift-ticket/components/TicketCalculationCard";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { calculateLiftTicketForSeasons } from "@/features/lift-ticket/utils/calculateLiftTicket";
import { RubyText } from "@/shared/components/RubyText";
import type { MapSkiResort } from "@/types/skiResorts";

const HOVER_HIGHLIGHT_MEDIA_QUERY = "(min-width: 48em)";

const canUseHoverHighlight = () =>
  typeof window !== "undefined" &&
  window.matchMedia(HOVER_HIGHLIGHT_MEDIA_QUERY).matches;

type Props = {
  resorts: MapSkiResort[];
  onSelectResort: (id: string) => void;
  selectedCompareIdSet: Set<string>;
  onToggleCompare: (id: string, selected: boolean) => void;
  onHoverResortChange?: (id: string | null) => void;
  showHeader?: boolean;
  liftTicketInput: LiftTicketSearchInput;
};

/**
 * 右カラムまたはボトムシートに表示されるスキー場一覧コンポーネント
 */
export const SkiResortList = ({
  resorts,
  onSelectResort,
  selectedCompareIdSet,
  onToggleCompare,
  onHoverResortChange,
  showHeader = true,
  liftTicketInput,
}: Props) => {
  const [localSelectedCompareIdSet, setLocalSelectedCompareIdSet] = useState(
    () => new Set(selectedCompareIdSet),
  );

  useEffect(() => {
    setLocalSelectedCompareIdSet(new Set(selectedCompareIdSet));
  }, [selectedCompareIdSet]);

  const handleToggleCompare = useCallback(
    (id: string, selected: boolean) => {
      setLocalSelectedCompareIdSet(prev => {
        const next = new Set(prev);
        if (selected) next.add(id);
        else next.delete(id);
        return next;
      });

      startTransition(() => {
        onToggleCompare(id, selected);
      });
    },
    [onToggleCompare],
  );

  return (
    <Flex h="100%" flexDirection="column" bg="transparent">
      {/* ヘッダーエリア */}
      {showHeader && (
        <Box
          p={4}
          pt={{ base: 2, md: 6 }}
          borderBottom="1px solid"
          borderColor="gray.100"
        >
          <Heading size="lg" color="gray.900">
            {resorts.length} 件見つかりました
          </Heading>
          <Text fontSize="sm" color="gray.500" mt={1}>
            選択すると詳細を表示します
          </Text>
        </Box>
      )}

      {/* スクロール可能なリスト本体 */}
      {resorts.length === 0 ? (
        <Flex
          flexGrow={1}
          alignItems="center"
          justifyContent="center"
          px={6}
          py={10}
          textAlign="center"
        >
          <Text color="gray.500" fontSize="sm" fontWeight="600">
            条件に合うスキー場がありません
          </Text>
        </Flex>
      ) : (
        <List.Root
          data-ski-resort-list-scroll="true"
          as="ul"
          flexGrow={1}
          gap={{ base: 0, md: 3 }}
          overflowY="auto"
          px={{ base: 4, md: 4 }}
          py={{ base: 0, md: 4 }}
          listStyleType="none"
          onScroll={() => onHoverResortChange?.(null)}
        >
          {resorts.map(resort => (
            <SkiResortListItem
              key={resort.id}
              resort={resort}
              isCompareSelected={localSelectedCompareIdSet.has(resort.id)}
              onSelectResort={onSelectResort}
              onToggleCompare={handleToggleCompare}
              onHoverResortChange={onHoverResortChange}
              liftTicketInput={liftTicketInput}
            />
          ))}
        </List.Root>
      )}
    </Flex>
  );
};

const SkiResortListItem = memo(
  ({
    resort,
    isCompareSelected,
    onSelectResort,
    onToggleCompare,
    onHoverResortChange,
    liftTicketInput,
  }: {
    resort: MapSkiResort;
    isCompareSelected: boolean;
    onSelectResort: (id: string) => void;
    onToggleCompare: (id: string, selected: boolean) => void;
    onHoverResortChange?: (id: string | null) => void;
    liftTicketInput: LiftTicketSearchInput;
  }) => {
    const highlightResort = () => {
      if (!canUseHoverHighlight()) return;
      onHoverResortChange?.(resort.id);
    };
    const clearHighlight = () => onHoverResortChange?.(null);
    const highlightResortForMouse = (event: ReactPointerEvent) => {
      if (event.pointerType !== "mouse") return;
      highlightResort();
    };
    const handleActionPointerDown = (e: ReactPointerEvent) => {
      e.stopPropagation();
      clearHighlight();
    };
    const handleSelect = () => {
      clearHighlight();
      onSelectResort(resort.id);
    };
    const liftTicketResult =
      resort.liftTickets.length > 0 && liftTicketInput.visitDate
        ? calculateLiftTicketForSeasons(resort.liftTickets, liftTicketInput)
        : null;

    return (
      <List.Item as="li" display="block">
        <Box
          data-ski-resort-list-item="true"
          role="button"
          tabIndex={0}
          aria-label={`${resort.nameJa}の位置を地図で強調`}
          onPointerEnter={highlightResortForMouse}
          onPointerLeave={event => {
            if (event.pointerType === "mouse") clearHighlight();
          }}
          onFocus={highlightResort}
          onBlur={clearHighlight}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSelect();
            }
          }}
          onClick={handleSelect}
          w="100%"
          cursor="pointer"
          borderRadius={{ base: 0, md: "xl" }}
          bg={{ base: "transparent", md: "white" }}
          px={{ base: 0, md: 4 }}
          py={{ base: 1.75, md: 4 }}
          textAlign="left"
          border={{ base: 0, md: "1px solid" }}
          borderBottom={{ base: "1px solid", md: "1px solid" }}
          borderColor={{
            base: "gray.200",
            md: "gray.200",
          }}
          boxShadow={{ base: "none", md: "sm" }}
          transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
          _hover={{
            borderColor: { base: "gray.300", md: "brand.500" },
            boxShadow: { base: "none", md: "0 4px 20px rgba(0, 0, 0, 0.08)" },
            transform: { base: "none", md: "translateY(-2px)" },
          }}
        >
          <Flex
            justifyContent="space-between"
            alignItems="center"
            gap={{ base: 2, md: 2 }}
            minH={{ base: "42px", md: "auto" }}
          >
            <Flex
              minW={0}
              flex="1 1 auto"
              flexDirection="column"
              gap={{ base: 0.75, md: 0.75 }}
            >
              <Text
                fontWeight="800"
                fontSize={{ base: "0.9rem", md: "lg" }}
                lineHeight={{ base: "1.55", md: "1.6" }}
                color="gray.900"
                fontFamily="var(--font-heading)"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                css={{
                  "& rt": {
                    fontSize: "0.45em",
                    fontWeight: 600,
                    color: "var(--chakra-colors-gray-500)",
                  },
                }}
              >
                <RubyText segments={resort.nameRuby} fallback={resort.nameJa} />
              </Text>
              <Text
                minW={0}
                fontSize={{ base: "0.7rem", md: "xs" }}
                color="gray.500"
                fontWeight="600"
                lineHeight={{ base: "1.15", md: "1.4" }}
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {resort.prefecture} • {resort.town}
              </Text>
              {resort.formerNames.length > 0 && (
                <Text
                  minW={0}
                  fontSize={{ base: "0.65rem", md: "xs" }}
                  color="gray.400"
                  fontWeight="600"
                  lineHeight={{ base: "1.15", md: "1.4" }}
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                >
                  旧称:{" "}
                  {resort.formerNames
                    .map(formerName => formerName.name)
                    .join("、")}
                </Text>
              )}
              {resort.liftTickets.length > 0 &&
                (liftTicketInput.visitDate ? (
                  <Box mt={1} onClick={event => event.stopPropagation()}>
                    <TicketCalculationCard result={liftTicketResult} compact />
                  </Box>
                ) : (
                  <Text
                    mt={1}
                    color="blue.700"
                    fontSize="0.68rem"
                    fontWeight="900"
                  >
                    日付・人数別の料金計算に対応
                  </Text>
                ))}
            </Flex>
            <Flex
              gap={2}
              flex="0 0 auto"
              flexWrap="nowrap"
              justifyContent="flex-end"
              alignItems="center"
              minW={{ base: "5.75rem", md: "100px" }}
            >
              <Button
                size="xs"
                flex={{ base: "0 0 5.75rem", md: "0 0 100px" }}
                w={{ base: "5.75rem", md: "100px" }}
                h={{ base: "28px", md: "var(--chakra-sizes-8)" }}
                minW={{ base: "5.75rem", md: "100px" }}
                px={{ base: 2, md: undefined }}
                borderRadius="md"
                gap={1}
                fontSize={{ base: "0.68rem", md: "xs" }}
                fontWeight="800"
                color={isCompareSelected ? "white" : "brand.600"}
                bg={isCompareSelected ? "brand.500" : "white"}
                border="1px solid"
                borderColor={{
                  base: isCompareSelected ? "brand.400" : "brand.500",
                  md: "brand.500",
                }}
                aria-pressed={isCompareSelected}
                aria-label={`${resort.nameJa}を${
                  isCompareSelected ? "比較対象から外す" : "比較対象に追加"
                }`}
                _hover={{
                  bg: isCompareSelected ? "brand.600" : "brand.50",
                }}
                onPointerDown={handleActionPointerDown}
                onClick={e => {
                  e.stopPropagation();
                  onToggleCompare(resort.id, !isCompareSelected);
                }}
              >
                <Box
                  as={isCompareSelected ? Check : Plus}
                  boxSize={{ base: "12px", md: "14px" }}
                  strokeWidth={3}
                />
                <Box as="span">
                  {isCompareSelected ? "比較から外す" : "比較に追加"}
                </Box>
              </Button>
            </Flex>
          </Flex>
        </Box>
      </List.Item>
    );
  },
);

SkiResortListItem.displayName = "SkiResortListItem";
