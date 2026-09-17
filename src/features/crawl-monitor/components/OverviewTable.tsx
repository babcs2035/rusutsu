import Link from "next/link";
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
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-600">
          <tr>
            <th className="px-3 py-2 font-medium">スキー場</th>
            <th className="px-3 py-2 font-medium">最新取得</th>
            <th className="px-3 py-2 font-medium">結果</th>
            <th className="px-3 py-2 font-medium">カテゴリ</th>
            <th className="px-3 py-2 font-medium">警告</th>
            <th className="px-3 py-2 font-medium">対応表</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ row, status }) => (
            <tr key={row.resortId} className="border-t border-gray-100">
              <td className="px-3 py-2 align-top">
                <Link
                  href={`/admin/crawl/${row.resortId}`}
                  className="font-medium text-gray-900 underline-offset-2 hover:underline"
                >
                  {row.resortName}
                </Link>
                <p className="text-xs text-gray-500">
                  {row.prefecture} / {row.resortId}
                </p>
              </td>
              <td className="px-3 py-2 align-top whitespace-nowrap">
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
              </td>
              <td className="px-3 py-2 align-top">
                {row.latestRun ? (
                  <StatusPill tone={outcomeTone(row.latestRun.outcome)}>
                    {OUTCOME_LABELS[row.latestRun.outcome]}
                  </StatusPill>
                ) : (
                  <StatusPill tone="bad">記録なし</StatusPill>
                )}
              </td>
              <td className="px-3 py-2 align-top">
                {row.latestRun ? (
                  <CategoryBadges categories={row.latestRun.categories} />
                ) : (
                  <span className="text-xs text-gray-500">-</span>
                )}
              </td>
              <td className="px-3 py-2 align-top whitespace-nowrap">
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
              </td>
              <td className="px-3 py-2 align-top text-xs">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
