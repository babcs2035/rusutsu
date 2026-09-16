import type { CrawlMonitorSourceMode } from "@/server/crawl-latest/adminContract";

const OPTIONS = [
  { value: "LIVE", label: "本番取得のみ" },
  { value: "LIVE,WAYBACK_VALIDATION", label: "本番取得 + Wayback検証" },
  { value: "WAYBACK_VALIDATION", label: "Wayback検証のみ" },
] as const;

export const SELECT_CLASS =
  "h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800";

/**
 * Wayback検証は現在値へ昇格しない確認用の実行なので、既定では混ぜずに切り替えで見る。
 */
export function SourceModeSelect({
  sourceModes,
}: {
  sourceModes: readonly CrawlMonitorSourceMode[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-gray-600">
      実行種別
      <select
        name="sourceModes"
        defaultValue={[...sourceModes].join(",")}
        className={SELECT_CLASS}
      >
        {OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
