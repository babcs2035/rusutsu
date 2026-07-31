import { ID_REF_TARGETS, labelOf } from "../presentation";
import type { TicketDocument } from "../types";

/** ID参照の選択肢1件 */
export type IdOption = {
  id: string;
  /** 選択肢に出す名称（name_ja など） */
  label: string;
};

/** ID を持つコレクション。ID参照の選択肢の供給元になる */
export const ID_COLLECTIONS = [
  "sources",
  "audiences",
  "calendars",
  "operating_hours",
  "areas",
  "products",
  "channels",
  "offers",
  "party_rules",
  "fees",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const labelFor = (item: Record<string, unknown>): string => {
  for (const key of ["name_ja", "page_title", "url", "question_ja"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return "";
};

export type IdIndex = Record<string, IdOption[]>;

export const buildIdIndex = (data: TicketDocument): IdIndex => {
  const index: IdIndex = {};
  for (const collection of ID_COLLECTIONS) {
    const items = data[collection];
    index[collection] = Array.isArray(items)
      ? items.flatMap(item =>
          isRecord(item) && typeof item.id === "string"
            ? [{ id: item.id, label: labelFor(item) }]
            : [],
        )
      : [];
  }
  // related_ids のように参照先が横断的なものは全件から選ばせる
  index.any = ID_COLLECTIONS.flatMap(collection =>
    (index[collection] ?? []).map(option => ({
      id: option.id,
      label: `${labelOf(collection)}: ${option.label}`,
    })),
  );
  return index;
};

/** 同じコレクション内で重複しているID（schemaでは検出できない） */
export const findDuplicateIds = (data: TicketDocument): string[] => {
  const duplicates: string[] = [];
  for (const collection of ID_COLLECTIONS) {
    const items = data[collection];
    if (!Array.isArray(items)) continue;
    const seen = new Set<string>();
    for (const item of items) {
      if (!isRecord(item) || typeof item.id !== "string") continue;
      if (seen.has(item.id)) {
        duplicates.push(`${labelOf(collection)}: ${item.id} が重複しています`);
      }
      seen.add(item.id);
    }
  }
  return duplicates;
};

const walk = (
  node: unknown,
  path: string[],
  visit: (key: string, value: string, path: string[]) => void,
): void => {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      walk(item, [...path, String(index)], visit);
    }
    return;
  }
  if (!isRecord(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      visit(key, value, [...path, key]);
    } else if (
      Array.isArray(value) &&
      value.every(item => typeof item === "string")
    ) {
      for (const [index, item] of (value as string[]).entries()) {
        visit(key, item, [...path, key, String(index)]);
      }
    } else {
      walk(value, [...path, key], visit);
    }
  }
};

/**
 * そのIDを参照している箇所を探す。
 * ★削除の前に必ず呼ぶ。参照が残ったまま項目を消すと、
 * 「存在しないIDを指すJSON」になり検証で落ちる。
 */
export const findReferrers = (
  data: TicketDocument,
  id: string,
  ignorePathPrefix: string[],
): string[] => {
  const referrers: string[] = [];
  const prefix = ignorePathPrefix.join("/");
  walk(data, [], (key, value, path) => {
    if (value !== id) return;
    if (!(key in ID_REF_TARGETS)) return;
    if (path.join("/").startsWith(prefix)) return;
    referrers.push(
      `${path.slice(0, -1).map(labelOf).join(" / ")} の ${labelOf(key)}`,
    );
  });
  return [...new Set(referrers)];
};

/** 参照先が存在しないID（ダングリング参照）の一覧 */
export const findDanglingReferences = (data: TicketDocument): string[] => {
  const index = buildIdIndex(data);
  const known: Record<string, Set<string>> = {};
  for (const [collection, options] of Object.entries(index)) {
    known[collection] = new Set(options.map(option => option.id));
  }
  const dangling: string[] = [];
  walk(data, [], (key, value, path) => {
    const target = ID_REF_TARGETS[key];
    if (target === undefined) return;
    if (value.trim() === "") return;
    if (known[target]?.has(value)) return;
    dangling.push(`/${path.join("/")}: ${value} は存在しません`);
  });
  return dangling;
};
