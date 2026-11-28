import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <Table className="min-w-[960px]" containerClassName="rounded-lg">
      <TableHeader>
        <TableRow className="text-left">
          <TableHead>取得時刻</TableHead>
          <TableHead>スキー場</TableHead>
          <TableHead>重大度</TableHead>
          <TableHead>コード</TableHead>
          <TableHead>内容</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.map(issue => (
          <TableRow key={issue.id}>
            <TableCell className="align-top whitespace-nowrap">
              <Link
                href={`/admin/crawl/${issue.resortId}/runs/${issue.runId}?issue=${issue.id}`}
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
            </TableCell>
            <TableCell className="align-top">
              <Link
                href={`/admin/crawl/${issue.resortId}`}
                className="text-gray-900 underline-offset-2 hover:underline"
              >
                {issue.resortName}
              </Link>
              <p className="text-xs text-gray-500">{issue.resortId}</p>
            </TableCell>
            <TableCell className="align-top">
              <div className="flex flex-col gap-1">
                <StatusPill tone={issue.severity === "ERROR" ? "bad" : "warn"}>
                  {SEVERITY_LABELS[issue.severity]}
                </StatusPill>
                {issue.blocksPromotion ? (
                  <StatusPill tone="bad">公開値に未反映</StatusPill>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="align-top">
              <code className="text-gray-700">{issue.code}</code>
              {issue.categoryKind ? (
                <p className="text-xs text-gray-500">
                  {CATEGORY_LABELS[issue.categoryKind]}
                </p>
              ) : null}
            </TableCell>
            <TableCell className="align-top">
              <p className="whitespace-pre-wrap text-gray-800">
                {issue.message}
              </p>
              {issue.occurrences > 1 ? (
                <p className="text-xs text-gray-500">
                  同種 {issue.occurrences}件
                </p>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
