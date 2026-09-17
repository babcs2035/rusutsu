import { withBasePath } from "@/shared/utils/basePath";
import {
  OVERVIEW_STATUS_FILTERS,
  OVERVIEW_STATUS_LABELS,
  type OverviewQuery,
} from "../utils/query";
import { SELECT_CLASS, SourceModeSelect } from "./SourceModeSelect";

/**
 * 絞り込みはGETのformにする。JavaScript不要で、結果のURLをそのまま共有できる。
 */
export function OverviewFilters({
  query,
  prefectures,
}: {
  query: OverviewQuery;
  prefectures: readonly string[];
}) {
  return (
    <form
      method="get"
      action={withBasePath("/admin/crawl")}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3"
    >
      <label className="flex flex-col gap-1 text-xs text-gray-600">
        スキー場名 / ID
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder="例: ルスツ, rusutsu"
          className="h-9 w-56 rounded-md border border-gray-300 px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-600">
        都道府県
        <select
          name="prefecture"
          defaultValue={query.prefecture}
          className={SELECT_CLASS}
        >
          <option value="">すべて</option>
          {prefectures.map(prefecture => (
            <option key={prefecture} value={prefecture}>
              {prefecture}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-600">
        状態
        <select
          name="status"
          defaultValue={query.status}
          className={SELECT_CLASS}
        >
          {OVERVIEW_STATUS_FILTERS.map(status => (
            <option key={status} value={status}>
              {OVERVIEW_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
      <SourceModeSelect sourceModes={query.sourceModes} />
      <button
        type="submit"
        className="h-9 rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
      >
        絞り込む
      </button>
    </form>
  );
}
