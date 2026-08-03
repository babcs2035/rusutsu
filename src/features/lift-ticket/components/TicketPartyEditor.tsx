"use client";

import {
  Box,
  Button,
  Flex,
  Grid,
  Input,
  NativeSelect,
  Text,
} from "@chakra-ui/react";
import { Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import type {
  LiftTicketSearchInput,
  TicketDayPlan,
  TicketPartyCategory,
  TicketPartyGroup,
} from "../types";
import {
  nextDateOf,
  TICKET_PARTY_CATEGORY_LABELS,
} from "../utils/calculateLiftTicket";

type Props = {
  value: LiftTicketSearchInput;
  onChange: (value: LiftTicketSearchInput) => void;
  /** 選ばれた券種の説明（「7時間 → 9時間券 ¥6,300」のような結果の要約） */
  durationHint?: string | null;
  compact?: boolean;
  onInputBlur?: () => void;
  onInputFocus?: () => void;
};

const sanitizeNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
};

export const TicketPartyEditor = ({
  value,
  onChange,
  durationHint,
  compact = false,
  onInputBlur,
  onInputFocus,
}: Props) => {
  const nextGroupIdRef = useRef(value.party.length + 1);
  const nextDayIdRef = useRef((value.days?.length ?? 1) + 1);

  // 日ごとの計画。未設定なら visitDate から1日ぶんを作る（他画面との後方互換）
  const days: TicketDayPlan[] =
    value.days && value.days.length > 0
      ? value.days
      : [
          {
            id: "day-1",
            date: value.visitDate,
            duration: { kind: "day", withNight: false },
          },
        ];

  const commitDays = (nextDays: TicketDayPlan[]) => {
    onChange({
      ...value,
      // 1日目は他画面（絞り込み・比較）が visitDate として使うので同期する
      visitDate: nextDays[0]?.date ?? "",
      days: nextDays,
    });
  };

  const updateDay = (
    dayId: string,
    updater: (day: TicketDayPlan) => TicketDayPlan,
  ) => {
    commitDays(days.map(day => (day.id === dayId ? updater(day) : day)));
  };

  const addDay = () => {
    const dayNumber = nextDayIdRef.current;
    nextDayIdRef.current += 1;
    const last = days[days.length - 1];
    commitDays([
      ...days,
      {
        id: `day-${dayNumber}`,
        // 既定は最後の日の翌日。連続で滑る人が多いので入力を減らす
        date: nextDateOf(last?.date ?? ""),
        duration: last?.duration ?? { kind: "day", withNight: false },
      },
    ]);
  };

  const removeDay = (dayId: string) => {
    if (days.length <= 1) return;
    commitDays(days.filter(day => day.id !== dayId));
  };

  const updateGroup = (
    groupId: string,
    updater: (group: TicketPartyGroup) => TicketPartyGroup,
  ) => {
    onChange({
      ...value,
      party: value.party.map(group =>
        group.id === groupId ? updater(group) : group,
      ),
    });
  };

  const addGroup = () => {
    const groupNumber = nextGroupIdRef.current;
    nextGroupIdRef.current += 1;
    onChange({
      ...value,
      party: [
        ...value.party,
        {
          id: `party-${groupNumber}`,
          category: "elementary",
          age: null,
          count: 0,
        },
      ],
    });
  };

  const removeGroup = (groupId: string) => {
    if (value.party.length <= 1) return;
    onChange({
      ...value,
      party: value.party.filter(group => group.id !== groupId),
    });
  };

  return (
    <Flex flexDirection="column" gap={compact ? 2.5 : 4}>
      <Flex flexDirection="column" gap={2}>
        <Flex alignItems="center" justifyContent="space-between" gap={2}>
          <Text color="gray.600" fontSize="xs" fontWeight="800">
            利用日
          </Text>
          <Button
            type="button"
            size="xs"
            h={7}
            px={2.5}
            variant="outline"
            borderColor="brand.300"
            color="brand.700"
            gap={1}
            onClick={addDay}
          >
            <Plus size={14} />
            日を追加
          </Button>
        </Flex>

        {days.map((day, index) => {
          const duration = day.duration;
          return (
            <Flex key={day.id} gap={1.5} alignItems="center" flexWrap="wrap">
              <Input
                aria-label={`${index + 1}日目の日付`}
                type="date"
                value={day.date}
                onChange={event =>
                  updateDay(day.id, current => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                onBlur={onInputBlur}
                onFocus={onInputFocus}
                h={9}
                flex="1 1 9rem"
                minW="8.5rem"
                bg="white"
                borderColor="gray.300"
                fontSize="sm"
              />

              {/* 「1日（ナイター無）」「1日（ナイター込）」「○時間」の3択 */}
              <NativeSelect.Root size="sm" width="10.5rem" flexShrink={0}>
                <NativeSelect.Field
                  aria-label={`${index + 1}日目の滑る長さ`}
                  value={
                    duration.kind === "hours"
                      ? "hours"
                      : duration.withNight
                        ? "day-night"
                        : "day"
                  }
                  onChange={event => {
                    const choice = event.target.value;
                    updateDay(day.id, current => ({
                      ...current,
                      duration:
                        choice === "hours"
                          ? { kind: "hours", hours: 4 }
                          : {
                              kind: "day",
                              withNight: choice === "day-night",
                            },
                    }));
                  }}
                  h={9}
                  bg="white"
                  borderColor="gray.300"
                  fontSize="sm"
                >
                  <option value="day">1日（ナイター無）</option>
                  <option value="day-night">1日（ナイター込）</option>
                  <option value="hours">時間で指定</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>

              {duration.kind === "hours" && (
                <Flex alignItems="center" gap={1} flexShrink={0}>
                  <Input
                    aria-label={`${index + 1}日目の滑る時間`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={String(duration.hours)}
                    onChange={event => {
                      const next = sanitizeNumber(event.target.value);
                      updateDay(day.id, current => ({
                        ...current,
                        duration: {
                          kind: "hours",
                          hours: Math.min(24, Math.max(1, next ?? 1)),
                        },
                      }));
                    }}
                    onBlur={onInputBlur}
                    onFocus={onInputFocus}
                    h={9}
                    w="3.5rem"
                    px={1}
                    bg="white"
                    borderColor="gray.300"
                    fontSize="sm"
                    textAlign="center"
                  />
                  <Text color="gray.700" fontSize="sm" fontWeight="700">
                    時間
                  </Text>
                </Flex>
              )}

              <Button
                type="button"
                aria-label={`${index + 1}日目を削除`}
                size="xs"
                h={9}
                w={9}
                p={0}
                flexShrink={0}
                variant="ghost"
                color="gray.500"
                disabled={days.length <= 1}
                onClick={() => removeDay(day.id)}
              >
                <Trash2 size={16} />
              </Button>
            </Flex>
          );
        })}

        {durationHint && (
          <Text color="gray.600" fontSize="0.68rem" lineHeight="1.6">
            {durationHint}
          </Text>
        )}
      </Flex>

      <Flex flexDirection="column" gap={2}>
        <Flex alignItems="center" justifyContent="space-between" gap={2}>
          <Text color="gray.600" fontSize="xs" fontWeight="800">
            利用者情報
          </Text>
          <Button
            type="button"
            size="xs"
            h={7}
            px={2.5}
            variant="outline"
            borderColor="brand.300"
            color="brand.700"
            gap={1}
            onClick={addGroup}
          >
            <Plus size={13} />
            利用者を追加
          </Button>
        </Flex>
        {value.party.map(group => (
          <Grid
            key={group.id}
            templateColumns="minmax(0, 1fr) 4.25rem 4rem 1.75rem"
            gap={1.5}
            alignItems="end"
          >
            <Box>
              <Text
                as="label"
                display="block"
                mb={0.5}
                color="gray.500"
                fontSize="0.68rem"
                fontWeight="700"
              >
                区分
              </Text>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  aria-label="人物区分"
                  value={group.category}
                  onChange={event =>
                    updateGroup(group.id, current => ({
                      ...current,
                      category: event.target.value as TicketPartyCategory,
                    }))
                  }
                  h={9}
                  px={2}
                  bg="white"
                  borderColor="gray.300"
                  fontSize="xs"
                >
                  {Object.entries(TICKET_PARTY_CATEGORY_LABELS).map(
                    ([category, label]) => (
                      <option key={category} value={category}>
                        {label}
                      </option>
                    ),
                  )}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Box>
            <Box>
              <Text
                as="label"
                display="block"
                mb={0.5}
                color="gray.500"
                fontSize="0.68rem"
                fontWeight="700"
              >
                年齢
              </Text>
              <Input
                aria-label={`${TICKET_PARTY_CATEGORY_LABELS[group.category]}の年齢`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={group.age ?? ""}
                placeholder="任意"
                onChange={event =>
                  updateGroup(group.id, current => ({
                    ...current,
                    age: sanitizeNumber(event.target.value),
                  }))
                }
                onBlur={onInputBlur}
                onFocus={onInputFocus}
                h={{ base: 9, md: 8 }}
                px={{ base: 0.5, md: 1 }}
                bg={{ base: "gray.50", md: "white" }}
                borderColor={{ base: "gray.300", md: "gray.200" }}
                borderWidth={{ base: "1.5px", md: "1px" }}
                color="gray.800"
                borderRadius="md"
                fontSize={{ base: "1rem", md: "xs" }}
                textAlign="center"
                scrollMarginTop="calc(env(safe-area-inset-top, 0px) + 5.5rem)"
                _focus={{
                  bg: "white",
                  borderColor: "brand.500",
                  boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.12)",
                }}
              />
            </Box>
            <Box>
              <Text
                as="label"
                display="block"
                mb={0.5}
                color="gray.500"
                fontSize="0.68rem"
                fontWeight="700"
              >
                人数
              </Text>
              <Input
                aria-label={`${TICKET_PARTY_CATEGORY_LABELS[group.category]}の人数`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={group.count === 0 ? "" : group.count}
                onChange={event =>
                  updateGroup(group.id, current => ({
                    ...current,
                    count: Math.min(
                      99,
                      Math.max(0, sanitizeNumber(event.target.value) ?? 0),
                    ),
                  }))
                }
                onBlur={onInputBlur}
                onFocus={onInputFocus}
                h={{ base: 9, md: 8 }}
                px={{ base: 0.5, md: 1 }}
                bg={{ base: "gray.50", md: "white" }}
                borderColor={{ base: "gray.300", md: "gray.200" }}
                borderWidth={{ base: "1.5px", md: "1px" }}
                color="gray.800"
                borderRadius="md"
                fontSize={{ base: "1rem", md: "xs" }}
                textAlign="center"
                scrollMarginTop="calc(env(safe-area-inset-top, 0px) + 5.5rem)"
                _focus={{
                  bg: "white",
                  borderColor: "brand.500",
                  boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.12)",
                }}
              />
            </Box>
            <Button
              type="button"
              aria-label="この人数行を削除"
              h={9}
              minW={7}
              w={7}
              p={0}
              color="gray.500"
              bg="transparent"
              disabled={value.party.length <= 1}
              onClick={() => removeGroup(group.id)}
            >
              <Trash2 size={14} />
            </Button>
          </Grid>
        ))}
      </Flex>
    </Flex>
  );
};
