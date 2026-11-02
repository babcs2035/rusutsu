import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDirection, TableSort } from "../utils/tableSort";

/** 表の列見出し。押すたびに並び替えの向きを切り替える */
export const SortableHeader = ({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: string;
  sort: TableSort;
  onSort: (key: string) => void;
}) => {
  const dir: SortDirection | null = sort?.key === sortKey ? sort.dir : null;
  const Icon =
    dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`${label}で並び替え`}
      className={`inline-flex min-h-6 items-center gap-0.5 whitespace-nowrap hover:text-slate-900 ${dir ? "font-bold text-blue-700" : ""}`}
    >
      {label}
      <Icon
        aria-hidden="true"
        className={`size-3 shrink-0 ${dir ? "" : "text-slate-400"}`}
        strokeWidth={2.5}
      />
    </button>
  );
};

export const ariaSort = (sort: TableSort, key: string) =>
  sort?.key === key
    ? sort.dir === "asc"
      ? "ascending"
      : "descending"
    : undefined;
