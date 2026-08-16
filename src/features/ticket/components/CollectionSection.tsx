"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
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
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
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
    setRemovingIndex(index);
    setRemoveDialogOpen(true);
  };

  const handleRemoveConfirm = () => {
    const index = removingIndex;
    if (index === null) {
      setRemoveDialogOpen(false);
      return;
    }
    update([collectionKey, index], REMOVE);
    setExpanded(new Set());
    setRemoveDialogOpen(false);
    setRemovingIndex(null);
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
    <>
      <div className="flex flex-col gap-4 max-w-[400px] md:max-w-[1200px] mx-auto">
        <div className="rounded-2xl bg-white border border-gray-200 p-4 md:p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-base font-bold font-[var(--font-heading)]">
                  {title}
                </h2>
                <span className="text-gray-500 text-xs font-mono">
                  {collectionKey}
                </span>
                <span className="text-gray-600 text-sm font-medium">
                  {items.length}件
                </span>
              </div>
              <p className="mt-2 text-gray-600 text-xs leading-snug">
                {description}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                className="h-7 w-[200px] bg-white"
                value={filter}
                placeholder="この一覧を絞り込む"
                onChange={event => setFilter(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                disabled={itemSpec === null}
                onClick={add}
              >
                <Plus className="size-3.5" />
                追加
              </Button>
            </div>
          </div>
          {items.length > 1 && (
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() =>
                  setExpanded(new Set(items.map((_, index) => index)))
                }
              >
                すべて開く
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setExpanded(new Set())}
              >
                すべて閉じる
              </Button>
            </div>
          )}
        </div>

        {itemSpec === null ? (
          <p className="text-red-700 text-sm">
            この項目はschemaから解釈できないため編集できません。
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-sm">
            {items.length === 0
              ? "項目がありません。"
              : "絞り込み条件に一致する項目がありません。"}
          </p>
        ) : (
          filtered.map(({ item, index }) => {
            const open = expanded.has(index);
            const id =
              isRecord(item) && typeof item.id === "string" ? item.id : "";
            const missingId = id.trim() === "";
            return (
              <div
                key={`${index}-${id}`}
                id={`ticket-item-${collectionKey}-${index}`}
                className="scroll-mt-4 rounded-2xl bg-white border border-gray-200 overflow-hidden"
              >
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 md:px-4 py-3",
                    open ? "bg-blue-50" : "bg-white",
                  )}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="flex-1 min-w-0 h-auto px-1 py-1 justify-start text-left whitespace-normal"
                    onClick={() => toggle(index)}
                  >
                    <span className="flex-shrink-0 inline-flex">
                      {open ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 w-full">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-bold">
                          {titleOf(item, index)}
                        </span>
                        <span className="text-gray-500 text-[0.6875rem] font-mono">
                          {missingId ? "IDが未入力" : id}
                        </span>
                      </div>
                      <div className="mt-1 flex gap-1 flex-wrap">
                        {badgesOf(collectionKey, item, idIndex).map(badge => (
                          <span
                            key={badge}
                            className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[0.6875rem] font-bold"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    </span>
                  </Button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {missingId && (
                      <AlertTriangle className="size-[15px] text-red-700" />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="text-red-700 hover:text-red-800 hover:bg-red-50"
                      aria-label={`${labelOf(collectionKey)}を削除`}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {open && (
                  <div className="px-3 md:px-4 pt-1 pb-4">
                    <ObjectFields
                      path={[collectionKey, index]}
                      spec={itemSpec}
                      value={item}
                      depth={0}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <ConfirmDialog
        open={removeDialogOpen}
        onOpenChange={open => {
          if (!open) {
            setRemoveDialogOpen(false);
            setRemovingIndex(null);
          }
        }}
        title="削除確認"
        description={
          removingIndex !== null
            ? (() => {
                const item = items[removingIndex];
                const id =
                  isRecord(item) && typeof item.id === "string"
                    ? item.id
                    : null;
                const referrers = id
                  ? findReferrers(data, id, [
                      collectionKey,
                      String(removingIndex),
                    ])
                  : [];
                return referrers.length > 0
                  ? `「${titleOf(item, removingIndex)}」は次の${referrers.length}箇所から参照されています。\n\n${referrers.slice(0, 10).join("\n")}\n\n削除すると存在しないIDを指す状態になります。参照側を直してから削除することを強く推奨します。それでも削除しますか？`
                  : `「${titleOf(item, removingIndex)}」を削除しますか？`;
              })()
            : ""
        }
        onConfirm={handleRemoveConfirm}
        confirmLabel="削除する"
      />
    </>
  );
};
