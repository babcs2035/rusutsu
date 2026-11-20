import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { CrawlMonitorSourceMode } from "@/server/crawl-latest/adminContract";

const OPTIONS = [
  { value: "LIVE", label: "本番取得のみ" },
  { value: "LIVE,WAYBACK_VALIDATION", label: "本番取得 + Wayback検証" },
  { value: "WAYBACK_VALIDATION", label: "Wayback検証のみ" },
] as const;

/**
 * Wayback検証は現在値へ昇格しない確認用の実行なので、既定では混ぜずに切り替えで見る。
 */
export function SourceModeSelect({
  sourceModes,
}: {
  sourceModes: readonly CrawlMonitorSourceMode[];
}) {
  return (
    <Label className="flex flex-col gap-1 text-xs text-gray-600">
      実行種別
      <NativeSelect
        name="sourceModes"
        defaultValue={[...sourceModes].join(",")}
      >
        {OPTIONS.map(option => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Label>
  );
}
