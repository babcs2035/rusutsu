"use client";

import { Box, Button, Flex, Heading, Input, Text } from "@chakra-ui/react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ITEM_TITLE_KEYS, labelOf } from "../presentation";
import type { FieldSpec, TicketDocument } from "../types";
import { createDefaultValue, type NodeUpdate, REMOVE } from "../utils/nodeOps";
import { findReferrers, type IdIndex } from "../utils/references";
import { ObjectFields } from "./FieldRenderer";

/** 新規項目のID接頭辞。既存データの命名に合わせている */
const ID_PREFIXES: Record<string, string> = {
  sources: "src",
  audiences: "audience",
  calendars: "cal",
  operating_hours: "oh",
  areas: "area",
  products: "prod",
  channels: "channel",
  offers: "offer",
  party_rules: "party",
  fees: "fee",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const nextId = (collectionKey: string, items: unknown[]): string => {
  const prefix = `${ID_PREFIXES[collectionKey] ?? collectionKey}-new`;
  const used = new Set(
    items.flatMap(item =>
      isRecord(item) && typeof item.id === "string" ? [item.id] : [],
    ),
  );
  for (let index = 1; ; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
};

const titleOf = (item: unknown, index: number): string => {
  if (isRecord(item)) {
    for (const key of ITEM_TITLE_KEYS) {
      const value = item[key];
      if (typeof value === "string" && value.trim() !== "") return value;
    }
  }
  return `${index + 1}件目`;
};

const formatYen = (value: unknown): string | null =>
  typeof value === "number" ? `¥${value.toLocaleString("ja-JP")}` : null;

/** 折りたたんだままでも中身が判別できるようにする要約 */
const badgesOf = (
  collectionKey: string,
  item: unknown,
  idIndex: IdIndex,
): string[] => {
  if (!isRecord(item)) return [];
  const nameOf = (collection: string, id: unknown) =>
    typeof id === "string"
      ? idIndex[collection]?.find(option => option.id === id)?.label || id
      : null;
  const listNames = (collection: string, ids: unknown) =>
    Array.isArray(ids)
      ? ids.flatMap(id => {
          const name = nameOf(collection, id);
          return name === null ? [] : [name];
        })
      : [];

  switch (collectionKey) {
    case "offers": {
      const price = isRecord(item.price) ? item.price : {};
      const amount = formatYen(price.amount);
      const priceLabel =
        price.live_lookup_required === true
          ? "変動価格"
          : typeof price.base_offer_id === "string"
            ? "差額指定"
            : isRecord(price.range)
              ? "金額の幅"
              : (amount ?? "金額未確定");
      return [
        priceLabel,
        ...[nameOf("products", item.product_id)].filter(
          (value): value is string => value !== null,
        ),
        ...listNames("audiences", item.audience_ids),
        ...listNames("calendars", item.calendar_ids),
        ...(Array.isArray(item.discount_reasons)
          ? (item.discount_reasons as unknown[]).map(String)
          : []),
      ];
    }
    case "products": {
      const validity = isRecord(item.validity) ? item.validity : {};
      const parts = [String(validity.mode ?? "unknown")];
      if (typeof validity.days === "number") parts.push(`${validity.days}日`);
      if (typeof validity.hours === "number")
        parts.push(`${validity.hours}時間`);
      if (typeof validity.rides === "number") parts.push(`${validity.rides}回`);
      if (
        Array.isArray(item.shared_with_resorts) &&
        item.shared_with_resorts.length > 0
      ) {
        parts.push("共通券");
      }
      if (
        Array.isArray(item.included_items) &&
        item.included_items.length > 0
      ) {
        parts.push("付帯あり");
      }
      return parts;
    }
    case "audiences": {
      const parts: string[] = [];
      if (item.is_default === true) parts.push("既定区分");
      if (typeof item.age_min === "number") parts.push(`${item.age_min}歳〜`);
      if (typeof item.age_max === "number") parts.push(`〜${item.age_max}歳`);
      if (Array.isArray(item.school_levels) && item.school_levels.length > 0) {
        parts.push((item.school_levels as unknown[]).map(String).join(","));
      }
      return parts;
    }
    case "calendars": {
      const parts: string[] = [];
      if (Array.isArray(item.included_day_types)) {
        parts.push(...(item.included_day_types as unknown[]).map(String));
      }
      const dates = Array.isArray(item.included_dates)
        ? item.included_dates.length
        : 0;
      if (dates > 0) parts.push(`明示日${dates}件`);
      const ranges = Array.isArray(item.included_date_ranges)
        ? item.included_date_ranges.length
        : 0;
      if (ranges > 0) parts.push(`期間${ranges}件`);
      return parts;
    }
    case "operating_hours":
      return [
        String(item.hours_type ?? ""),
        [item.start_time, item.end_time].filter(Boolean).join("〜"),
        ...listNames("calendars", item.calendar_ids),
      ].filter(value => value !== "");
    case "fees":
      return [formatYen(item.amount) ?? "金額未設定"];
    case "channels":
      return [
        typeof item.url === "string" && item.url !== ""
          ? "購入URLあり"
          : "URLなし",
      ];
    case "sources":
      return [
        typeof item.path === "string" ? item.path : "パス未設定",
        item.user_specified === true ? "指定URL" : "辿った先",
      ];
    default:
      return [];
  }
};

export const CollectionSection = ({
  collectionKey,
  title,
  description,
  spec,
  items,
  data,
  idIndex,
  update,
}: {
  collectionKey: string;
  title: string;
  description: string;
  spec: Extract<FieldSpec, { kind: "array" }>;
  items: unknown[];
  data: TicketDocument;
  idIndex: IdIndex;
  update: (path: (string | number)[], value: NodeUpdate) => void;
}) => {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const itemSpec = spec.items.kind === "object" ? spec.items : null;

  const filtered = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("ja");
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) =>
        query === ""
          ? true
          : JSON.stringify(item).toLocaleLowerCase("ja").includes(query),
      );
  }, [filter, items]);

  const toggle = (index: number) => {
    const next = new Set(expanded);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setExpanded(next);
  };

  const remove = (index: number) => {
    const item = items[index];
    const id = isRecord(item) && typeof item.id === "string" ? item.id : null;
    const referrers = id
      ? findReferrers(data, id, [collectionKey, String(index)])
      : [];
    const message =
      referrers.length > 0
        ? `「${titleOf(item, index)}」は次の${referrers.length}箇所から参照されています。\n\n${referrers.slice(0, 10).join("\n")}\n\n削除すると存在しないIDを指す状態になります。参照側を直してから削除することを強く推奨します。それでも削除しますか？`
        : `「${titleOf(item, index)}」を削除しますか？`;
    if (!window.confirm(message)) return;
    update([collectionKey, index], REMOVE);
    setExpanded(new Set());
  };

  const add = () => {
    if (!itemSpec) return;
    const created = createDefaultValue(itemSpec);
    const next = isRecord(created)
      ? {
          ...created,
          ...("id" in created ? { id: nextId(collectionKey, items) } : {}),
        }
      : created;
    update([collectionKey], [...items, next]);
    setExpanded(new Set([items.length]));
  };

  return (
    <Flex flexDirection="column" gap={4} maxW="1200px" mx="auto">
      <Box
        p={{ base: 4, md: 5 }}
        borderRadius="2xl"
        bg="white"
        border="1px solid"
        borderColor="gray.200"
      >
        <Flex
          alignItems="start"
          justifyContent="space-between"
          gap={4}
          flexWrap="wrap"
        >
          <Box flex="1" minW="260px">
            <Flex alignItems="baseline" gap={2}>
              <Heading size="md">{title}</Heading>
              <Text color="gray.500" fontSize="xs" fontFamily="mono">
                {collectionKey}
              </Text>
              <Text color="gray.600" fontSize="sm" fontWeight="700">
                {items.length}件
              </Text>
            </Flex>
            <Text mt={2} color="gray.600" fontSize="xs" lineHeight="1.7">
              {description}
            </Text>
          </Box>
          <Flex gap={2} alignItems="center">
            <Input
              size="sm"
              w="200px"
              bg="white"
              value={filter}
              placeholder="この一覧を絞り込む"
              onChange={event => setFilter(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              colorPalette="blue"
              variant="outline"
              disabled={itemSpec === null}
              onClick={add}
            >
              <Plus size={15} />
              追加
            </Button>
          </Flex>
        </Flex>
        {items.length > 1 && (
          <Flex mt={3} gap={2}>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() =>
                setExpanded(new Set(items.map((_, index) => index)))
              }
            >
              すべて開く
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setExpanded(new Set())}
            >
              すべて閉じる
            </Button>
          </Flex>
        )}
      </Box>

      {itemSpec === null ? (
        <Text color="red.600" fontSize="sm">
          この項目はschemaから解釈できないため編集できません。
        </Text>
      ) : filtered.length === 0 ? (
        <Text color="gray.500" fontSize="sm">
          {items.length === 0
            ? "項目がありません。"
            : "絞り込み条件に一致する項目がありません。"}
        </Text>
      ) : (
        filtered.map(({ item, index }) => {
          const open = expanded.has(index);
          const id =
            isRecord(item) && typeof item.id === "string" ? item.id : "";
          const missingId = id.trim() === "";
          return (
            <Box
              key={`${index}-${id}`}
              id={`ticket-item-${collectionKey}-${index}`}
              scrollMarginTop="16px"
              borderRadius="2xl"
              bg="white"
              border="1px solid"
              borderColor={missingId ? "red.300" : "gray.200"}
              overflow="hidden"
            >
              <Flex
                px={{ base: 3, md: 4 }}
                py={3}
                alignItems="center"
                justifyContent="space-between"
                gap={3}
                bg={open ? "blue.50" : "white"}
              >
                <Button
                  type="button"
                  flex="1"
                  minW={0}
                  h="auto"
                  px={1}
                  py={1}
                  justifyContent="start"
                  textAlign="left"
                  whiteSpace="normal"
                  variant="ghost"
                  onClick={() => toggle(index)}
                >
                  <Box flexShrink={0}>
                    {open ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </Box>
                  <Box minW={0} width="100%">
                    <Flex alignItems="baseline" gap={2} flexWrap="wrap">
                      <Text fontSize="sm" fontWeight="900">
                        {titleOf(item, index)}
                      </Text>
                      <Text
                        color="gray.500"
                        fontSize="0.66rem"
                        fontFamily="mono"
                      >
                        {missingId ? "IDが未入力" : id}
                      </Text>
                    </Flex>
                    <Flex mt={1} gap={1} flexWrap="wrap">
                      {badgesOf(collectionKey, item, idIndex).map(badge => (
                        <Text
                          key={badge}
                          px={1.5}
                          py={0.5}
                          borderRadius="full"
                          bg="gray.100"
                          color="gray.700"
                          fontSize="0.62rem"
                          fontWeight="700"
                        >
                          {badge}
                        </Text>
                      ))}
                    </Flex>
                  </Box>
                </Button>
                <Flex alignItems="center" gap={1} flexShrink={0}>
                  {missingId && <AlertTriangle size={15} color="#dc2626" />}
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    colorPalette="red"
                    aria-label={`${labelOf(collectionKey)}を削除`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </Flex>
              </Flex>
              {open && (
                <Box px={{ base: 3, md: 4 }} pt={1} pb={4}>
                  <ObjectFields
                    path={[collectionKey, index]}
                    spec={itemSpec}
                    value={item}
                    depth={0}
                  />
                </Box>
              )}
            </Box>
          );
        })
      )}
    </Flex>
  );
};
