import Link from "next/link";
import type { CrawlMonitorIssue } from "@/server/crawl-latest/adminContract";
import {
  CATEGORY_LABELS,
  formatJst,
  OUTCOME_LABELS,
  outcomeTone,
  SEVERITY_LABELS,
  SOURCE_MODE_LABELS,
} from "../utils/labels";
import { StatusPill } from "./StatusPill";

export function IssueTable({
  issues,
}: {
  issues: readonly CrawlMonitorIssue[];
}) {
  if (issues.length === 0) {
    return (
      <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
        条件に合う警告・エラーはありません。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-600">
          <tr>
            <th className="px-3 py-2 font-medium">取得時刻</th>
            <th className="px-3 py-2 font-medium">スキー場</th>
            <th className="px-3 py-2 font-medium">重大度</th>
            <th className="px-3 py-2 font-medium">コード</th>
            <th className="px-3 py-2 font-medium">内容</th>
          </tr>
        </thead>
        <tbody>
          {issues.map(issue => (
            <tr key={issue.id} className="border-t border-gray-100">
              <td className="px-3 py-2 align-top whitespace-nowrap">
                <Link
                  href={`/admin/crawl/${issue.resortId}/runs/${issue.runId}`}
                  className="text-gray-900 underline-offset-2 hover:underline"
                >
                  {formatJst(issue.observedAt)}
                </Link>
                <p className="text-xs text-gray-500">
                  {issue.sourceMode === "LIVE"
                    ? ""
                    : `${SOURCE_MODE_LABELS[issue.sourceMode]} · `}
                  <StatusPill tone={outcomeTone(issue.outcome)}>
                    {OUTCOME_LABELS[issue.outcome]}
                  </StatusPill>
                </p>
              </td>
              <td className="px-3 py-2 align-top">
                <Link
                  href={`/admin/crawl/${issue.resortId}`}
                  className="text-gray-900 underline-offset-2 hover:underline"
                >
                  {issue.resortName}
                </Link>
                <p className="text-xs text-gray-500">{issue.resortId}</p>
              </td>
              <td className="px-3 py-2 align-top">
                <div className="flex flex-col gap-1">
                  <StatusPill
                    tone={issue.severity === "ERROR" ? "bad" : "warn"}
                  >
                    {SEVERITY_LABELS[issue.severity]}
                  </StatusPill>
                  {issue.blocksPromotion ? (
                    <StatusPill tone="bad">公開値に未反映</StatusPill>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-2 align-top">
                <code className="text-xs text-gray-700">{issue.code}</code>
                {issue.categoryKind ? (
                  <p className="text-xs text-gray-500">
                    {CATEGORY_LABELS[issue.categoryKind]}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-2 align-top">
                <p className="text-sm whitespace-pre-wrap text-gray-800">
                  {issue.message}
                </p>
                {issue.occurrences > 1 ? (
                  <p className="text-xs text-gray-500">
                    同種 {issue.occurrences}件
                  </p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
