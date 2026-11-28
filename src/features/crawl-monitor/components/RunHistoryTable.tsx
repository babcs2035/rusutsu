import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CrawlMonitorRunSummary } from "@/server/crawl-latest/adminContract";
import {
  CATEGORY_LABELS,
  formatJst,
  OUTCOME_LABELS,
  outcomeTone,
  SOURCE_MODE_LABELS,
} from "../utils/labels";
import { buildRunChangeMap, RUN_CHANGE_LABELS } from "../utils/runDiff";
import { CategoryBadges } from "./CategoryBadges";
import { StatusPill } from "./StatusPill";

export function RunHistoryTable({
  resortId,
  runs,
}: {
  resortId: string;
  runs: readonly CrawlMonitorRunSummary[];
}) {
  if (runs.length === 0) {
    return (
      <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
        この条件の実行履歴はありません。
      </p>
    );
  }
  const changes = buildRunChangeMap(runs);

  return (
    <Table className="min-w-[900px]" containerClassName="rounded-lg">
      <TableHeader>
        <TableRow className="text-left">
          <TableHead>取得時刻</TableHead>
          <TableHead>結果</TableHead>
          <TableHead>カテゴリ</TableHead>
          <TableHead>前回比</TableHead>
          <TableHead>警告</TableHead>
          <TableHead>クローラー</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map(run => {
          const change = changes[run.id] ?? {};
          const changed = Object.entries(change).filter(
            ([, value]) => value === "changed" || value === "names-changed",
          );
          const allSame =
            Object.values(change).length > 0 &&
            Object.values(change).every(value => value === "same");
          return (
            <TableRow key={run.id}>
              <TableCell className="align-top whitespace-nowrap">
                <Link
                  href={`/admin/crawl/${resortId}/runs/${run.id}`}
                  className="font-medium text-gray-900 underline-offset-2 hover:underline"
                >
                  {formatJst(run.observedAt)}
                </Link>
                {run.origin === "FILE" ? (
                  <p className="text-xs text-gray-500">ファイルの記録</p>
                ) : null}
                {run.sourceMode !== "LIVE" ? (
                  <p className="text-xs text-gray-500">
                    {SOURCE_MODE_LABELS[run.sourceMode]}
                    {run.archiveTimestamp ? ` ${run.archiveTimestamp}` : ""}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="align-top">
                <StatusPill tone={outcomeTone(run.outcome)}>
                  {OUTCOME_LABELS[run.outcome]}
                </StatusPill>
              </TableCell>
              <TableCell className="align-top">
                <CategoryBadges categories={run.categories} />
              </TableCell>
              <TableCell className="align-top text-gray-600">
                {allSame ? (
                  <StatusPill tone="warn">前回と同一</StatusPill>
                ) : changed.length > 0 ? (
                  changed
                    .map(
                      ([kind, value]) =>
                        `${CATEGORY_LABELS[kind as keyof typeof CATEGORY_LABELS]}: ${
                          RUN_CHANGE_LABELS[
                            value as keyof typeof RUN_CHANGE_LABELS
                          ]
                        }`,
                    )
                    .join(" / ")
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="align-top whitespace-nowrap text-gray-700">
                {run.issueCounts.warning + run.issueCounts.error > 0
                  ? `警告${run.issueCounts.warning} / エラー${run.issueCounts.error}`
                  : "-"}
                {run.issueCounts.blocking > 0 ? (
                  <p className="text-rose-700">
                    未反映 {run.issueCounts.blocking}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="align-top text-gray-500">
                <p className="max-w-[220px] truncate">
                  {run.crawlerFile ?? "-"}
                </p>
                <p>{run.crawlerRevision ?? ""}</p>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
