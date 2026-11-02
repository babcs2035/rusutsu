import { z } from "zod";
import { normalizeIconSymbol } from "./detailMetrics";

export type SortDirection = "asc" | "desc";
export type TableSort = { key: string; dir: SortDirection } | null;
export type SortValue = number | string | null;

export const tableSortSchema: z.ZodType<TableSort> = z
  .object({ key: z.string().max(40), dir: z.enum(["asc", "desc"]) })
  .nullable();

/**
 * 列見出しを押したときの次の並び。
 * 初めは列ごとの見やすい向き、もう一度で逆向き、さらに押すと元の並びに戻す。
 */
export const nextTableSort = (
  current: TableSort,
  key: string,
  firstDir: SortDirection,
): TableSort => {
  if (current?.key !== key) return { key, dir: firstDir };
  if (current.dir === firstDir)
    return { key, dir: firstDir === "asc" ? "desc" : "asc" };
  return null;
};

const SYMBOL_RANK = { "○": 0, "△": 1, "×": 2 } as const;

/**
 * ○△× の並び順。○ が小さく、区間ごとに違うときは平均する。
 * 記号が一つも無ければ null（どちら向きでも最後）。
 */
export const symbolSortValue = (
  symbols: Array<string | null | undefined>,
): number | null => {
  const ranks = symbols.flatMap(symbol => {
    const normalized = normalizeIconSymbol(symbol);
    return normalized ? [SYMBOL_RANK[normalized]] : [];
  });
  return ranks.length
    ? ranks.reduce<number>((sum, rank) => sum + rank, 0) / ranks.length
    : null;
};

/** 値の無い行はどちら向きでも最後に置き、同じ値は元の並びを保つ */
export const sortRows = <T>(
  rows: T[],
  sort: TableSort,
  getValue: (row: T, key: string) => SortValue,
) => {
  if (!sort) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: getValue(row, sort.key) }))
    .sort((a, b) => {
      if (a.value == null || b.value == null)
        return a.value == null ? (b.value == null ? a.index - b.index : 1) : -1;
      const order =
        typeof a.value === "number" && typeof b.value === "number"
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value), "ja", {
              numeric: true,
            });
      return order === 0 ? a.index - b.index : order * sign;
    })
    .map(item => item.row);
};
