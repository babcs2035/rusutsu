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
  TicketPartyCategory,
  TicketPartyGroup,
} from "../types";
import { TICKET_PARTY_CATEGORY_LABELS } from "../utils/calculateLiftTicket";

type ProductOption = {
  id: string;
  label: string;
};

type Props = {
  value: LiftTicketSearchInput;
  onChange: (value: LiftTicketSearchInput) => void;
  productOptions?: ProductOption[];
  selectedProductId?: string;
  onProductChange?: (productId: string) => void;
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
  productOptions,
  selectedProductId,
  onProductChange,
  compact = false,
  onInputBlur,
  onInputFocus,
}: Props) => {
  const nextGroupIdRef = useRef(value.party.length + 1);

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
          count: 1,
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
      <Grid
        templateColumns={{
          base: "minmax(0, 1fr)",
          sm: productOptions ? "1fr 1fr" : "1fr 1fr",
        }}
        gap={2}
      >
        <Box>
          <Text
            as="label"
            display="block"
            mb={1}
            color="gray.600"
            fontSize="xs"
            fontWeight="800"
          >
            行く日
          </Text>
          <Input
            aria-label="スキー場へ行く日"
            type="date"
            value={value.visitDate}
            onChange={event =>
              onChange({ ...value, visitDate: event.target.value })
            }
            onBlur={onInputBlur}
            onFocus={onInputFocus}
            h={9}
            bg="white"
            borderColor="gray.300"
            fontSize="sm"
          />
        </Box>
        {productOptions && productOptions.length > 0 ? (
          <Box>
            <Text
              as="label"
              display="block"
              mb={1}
              color="gray.600"
              fontSize="xs"
              fontWeight="800"
            >
              券種
            </Text>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                aria-label="計算する券種"
                value={selectedProductId}
                onChange={event => onProductChange?.(event.target.value)}
                h={9}
                bg="white"
                borderColor="gray.300"
                fontSize="sm"
              >
                {productOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Box>
        ) : (
          <Box>
            <Text
              as="label"
              display="block"
              mb={1}
              color="gray.600"
              fontSize="xs"
              fontWeight="800"
            >
              利用時間
            </Text>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                aria-label="リフト券の利用時間"
                value={value.usePreference}
                onChange={event =>
                  onChange({
                    ...value,
                    usePreference: event.target.value as
                      | "full_day"
                      | "half_day",
                  })
                }
                h={9}
                bg="white"
                borderColor="gray.300"
                fontSize="sm"
              >
                <option value="full_day">1日たっぷり</option>
                <option value="half_day">半日（約4時間）</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Box>
        )}
      </Grid>

      <Flex flexDirection="column" gap={2}>
        <Flex alignItems="center" justifyContent="space-between" gap={2}>
          <Text color="gray.600" fontSize="xs" fontWeight="800">
            行く人（区分・年齢・人数）
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
            人を追加
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
                  aria-label="学校・大人区分"
                  value={group.category}
                  onChange={event =>
                    updateGroup(group.id, current => ({
                      ...current,
                      category: event.target.value as TicketPartyCategory,
                      age:
                        event.target.value === "adult" && current.age == null
                          ? 30
                          : current.age,
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
                inputMode="numeric"
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
                h={9}
                px={2}
                bg="white"
                borderColor="gray.300"
                fontSize="xs"
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
                inputMode="numeric"
                value={group.count}
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
                h={9}
                px={2}
                bg="white"
                borderColor="gray.300"
                fontSize="xs"
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
      <Text color="gray.500" fontSize="0.7rem" lineHeight="1.5">
        年齢と学校区分は公式料金の対象判定にだけ使います。会員・地域限定などの
        条件付き割引は自動適用しません。
      </Text>
    </Flex>
  );
};
