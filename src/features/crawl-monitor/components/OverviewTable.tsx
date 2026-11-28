import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CATEGORY_LABELS,
  formatElapsed,
  formatJst,
  OUTCOME_LABELS,
  outcomeTone,
  SOURCE_MODE_LABELS,
} from "../utils/labels";
import type { OverviewEntry } from "../utils/overview";
import { CategoryBadges } from "./CategoryBadges";
import { StatusPill } from "./StatusPill";

export function OverviewTable({
  entries,
  now,
}: {
  entries: readonly OverviewEntry[];
  now: number;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
        条件に合うスキー場がありません。
      </p>
    );
  }

  return (
    <Table className="min-w-[860px]" containerClassName="rounded-lg">
      <TableHeader>
        <TableRow className="text-left">
          <TableHead>スキー場</TableHead>
          <TableHead>最新取得</TableHead>
          <TableHead>結果</TableHead>
          <TableHead>カテゴリ</TableHead>
          <TableHead>警告</TableHead>
          <TableHead>対応表</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(({ row, status }) => (
          <TableRow key={row.resortId}>
            <TableCell className="align-top">
              <Link
                href={`/admin/crawl/${row.resortId}`}
                className="font-medium text-gray-900 underline-offset-2 hover:underline"
              >
                {row.resortName}
              </Link>
              <p className="text-xs text-gray-500">
                {row.prefecture} / {row.resortId}
              </p>
            </TableCell>
            <TableCell className="align-top whitespace-nowrap">
              {row.latestRun ? (
                <>
                  <span className="text-gray-800">
                    {formatJst(row.latestRun.observedAt)}
                  </span>
                  <p className="text-xs text-gray-500">
                    {formatElapsed(row.latestRun.observedAt, now)}
                    {status.isStale ? " · 更新が止まっています" : ""}
                  </p>
                  {row.latestRun.origin === "FILE" ? (
                    <p className="text-xs text-gray-500">ファイルの記録</p>
                  ) : null}
                  {row.latestRun.sourceMode !== "LIVE" ? (
                    <p className="text-xs text-gray-500">
                      {SOURCE_MODE_LABELS[row.latestRun.sourceMode]}
                    </p>
                  ) : null}
                </>
              ) : (
                <span className="text-gray-500">未取得</span>
              )}
            </TableCell>
            <TableCell className="align-top">
              {row.latestRun ? (
                <StatusPill tone={outcomeTone(row.latestRun.outcome)}>
                  {OUTCOME_LABELS[row.latestRun.outcome]}
                </StatusPill>
              ) : (
                <StatusPill tone="bad">記録なし</StatusPill>
              )}
            </TableCell>
            <TableCell className="align-top">
              {row.latestRun ? (
                <CategoryBadges categories={row.latestRun.categories} />
              ) : (
                <span className="text-xs text-gray-500">-</span>
              )}
            </TableCell>
            <TableCell className="align-top whitespace-nowrap">
              {row.latestRun &&
              (row.latestRun.issueCounts.warning > 0 ||
                row.latestRun.issueCounts.error > 0) ? (
                <Link
                  href={`/admin/crawl/issues?resortId=${row.resortId}`}
                  className="text-sm text-gray-800 underline-offset-2 hover:underline"
                >
                  警告{row.latestRun.issueCounts.warning} / エラー
                  {row.latestRun.issueCounts.error}
                  {row.latestRun.issueCounts.blocking > 0
                    ? ` / 未反映${row.latestRun.issueCounts.blocking}`
                    : ""}
                </Link>
              ) : (
                <span className="text-xs text-gray-500">-</span>
              )}
            </TableCell>
            <TableCell className="align-top">
              {row.mappingGaps.length === 0 ? (
                <span className="text-gray-500">-</span>
              ) : status.hasMappingGap ? (
                <div className="flex flex-col gap-1">
                  {row.mappingGaps
                    .filter(gap => gap.missing.length > 0)
                    .map(gap => (
                      <StatusPill key={gap.kind} tone="warn">
                        {CATEGORY_LABELS[gap.kind]} {gap.missing.length}件
                        未取得
                      </StatusPill>
                    ))}
                </div>
              ) : (
                <StatusPill tone="ok">一致</StatusPill>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
