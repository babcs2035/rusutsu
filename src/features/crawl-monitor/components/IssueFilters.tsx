import Link from "next/link";
import type { CrawlMonitorIssueCodeSummary } from "@/server/crawl-latest/adminContract";
import {
  CATEGORY_KINDS,
  CATEGORY_LABELS,
  SEVERITY_LABELS,
} from "../utils/labels";
import { buildQueryString, type IssueQuery } from "../utils/query";
import { SELECT_CLASS, SourceModeSelect } from "./SourceModeSelect";
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
        action="/admin/crawl/issues"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3"
      >
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          重大度
          <select
            name="severity"
            defaultValue={query.severity ?? ""}
            className={SELECT_CLASS}
          >
            <option value="">すべて</option>
            {(["ERROR", "WARNING"] as const).map(severity => (
              <option key={severity} value={severity}>
                {SEVERITY_LABELS[severity]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          カテゴリ
          <select
            name="categoryKind"
            defaultValue={query.categoryKind ?? ""}
            className={SELECT_CLASS}
          >
            <option value="">すべて</option>
            {CATEGORY_KINDS.map(kind => (
              <option key={kind} value={kind}>
                {CATEGORY_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          スキー場ID
          <input
            type="search"
            name="resortId"
            defaultValue={query.resortId ?? ""}
            placeholder="例: rusutsu-resort"
            className="h-9 w-48 rounded-md border border-gray-300 px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          期間
          <select
            name="days"
            defaultValue={query.days === null ? "" : String(query.days)}
            className={SELECT_CLASS}
          >
            {DAY_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <SourceModeSelect sourceModes={query.sourceModes} />
        <label className="flex items-center gap-2 pb-2 text-xs text-gray-700">
          <input
            type="checkbox"
            name="blockingOnly"
            value="1"
            defaultChecked={query.blockingOnly}
            className="size-4"
          />
          公開値に反映されなかったものだけ
        </label>
        {query.code ? (
          <input type="hidden" name="code" value={query.code} />
        ) : null}
        <button
          type="submit"
          className="h-9 rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
        >
          絞り込む
        </button>
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
