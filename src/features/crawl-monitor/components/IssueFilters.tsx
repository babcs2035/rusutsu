import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { CrawlMonitorIssueCodeSummary } from "@/server/crawl-latest/adminContract";
import { withBasePath } from "@/shared/utils/basePath";
import {
  CATEGORY_KINDS,
  CATEGORY_LABELS,
  SEVERITY_LABELS,
} from "../utils/labels";
import { buildQueryString, type IssueQuery } from "../utils/query";
import { SourceModeSelect } from "./SourceModeSelect";
import { StatusPill } from "./StatusPill";

const DAY_OPTIONS = [
  { value: "", label: "期間を問わない" },
  { value: "1", label: "24時間以内" },
  { value: "7", label: "7日以内" },
  { value: "30", label: "30日以内" },
];

export function IssueFilters({
  query,
  codes,
}: {
  query: IssueQuery;
  codes: readonly CrawlMonitorIssueCodeSummary[];
}) {
  const linkQuery = {
    severity: query.severity,
    resortId: query.resortId,
    categoryKind: query.categoryKind,
    blockingOnly: query.blockingOnly,
    days: query.days,
    sourceModes: query.sourceModes.join(","),
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        method="get"
        action={withBasePath("/admin/crawl/issues")}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3"
      >
        <Label className="flex flex-col gap-1 text-xs text-gray-600">
          重大度
          <NativeSelect name="severity" defaultValue={query.severity ?? ""}>
            <NativeSelectOption value="">すべて</NativeSelectOption>
            {(["ERROR", "WARNING"] as const).map(severity => (
              <NativeSelectOption key={severity} value={severity}>
                {SEVERITY_LABELS[severity]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Label>
        <Label className="flex flex-col gap-1 text-xs text-gray-600">
          カテゴリ
          <NativeSelect
            name="categoryKind"
            defaultValue={query.categoryKind ?? ""}
          >
            <NativeSelectOption value="">すべて</NativeSelectOption>
            {CATEGORY_KINDS.map(kind => (
              <NativeSelectOption key={kind} value={kind}>
                {CATEGORY_LABELS[kind]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Label>
        <Label className="flex flex-col gap-1 text-xs text-gray-600">
          スキー場ID
          <input
            type="search"
            name="resortId"
            defaultValue={query.resortId ?? ""}
            placeholder="例: rusutsu-resort"
            className="h-9 w-48 rounded-md border border-gray-300 px-2 text-sm"
          />
        </Label>
        <Label className="flex flex-col gap-1 text-xs text-gray-600">
          期間
          <NativeSelect
            name="days"
            defaultValue={query.days === null ? "" : String(query.days)}
          >
            {DAY_OPTIONS.map(option => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Label>
        <SourceModeSelect sourceModes={query.sourceModes} />
        <Label className="flex items-center gap-2 pb-2 text-xs text-gray-700">
          <input
            type="checkbox"
            name="blockingOnly"
            value="1"
            defaultChecked={query.blockingOnly}
            className="size-4"
          />
          公開値に反映されなかったものだけ
        </Label>
        {query.code ? (
          <input type="hidden" name="code" value={query.code} />
        ) : null}
        <Button
          type="submit"
          className="h-9 rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
        >
          絞り込む
        </Button>
      </form>

      {codes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
          <span className="text-xs text-gray-600">コード別:</span>
          {query.code ? (
            <Link href={`/admin/crawl/issues${buildQueryString(linkQuery)}`}>
              <StatusPill tone="muted">絞り込みを解除</StatusPill>
            </Link>
          ) : null}
          {codes.map(entry => (
            <Link
              key={`${entry.code}-${entry.severity}`}
              href={`/admin/crawl/issues${buildQueryString(linkQuery, {
                code: entry.code,
              })}`}
            >
              <StatusPill
                tone={
                  entry.code === query.code
                    ? "ok"
                    : entry.severity === "ERROR"
                      ? "bad"
                      : "warn"
                }
              >
                {entry.code} {entry.count}
              </StatusPill>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
