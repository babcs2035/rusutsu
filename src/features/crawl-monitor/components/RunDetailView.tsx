import type { CrawlMonitorRunDetail } from "@/server/crawl-latest/adminContract";
import {
  CATEGORY_LABELS,
  categoryTone,
  formatJst,
  OUTCOME_LABELS,
  outcomeTone,
  SOURCE_MODE_LABELS,
  STATE_LABELS,
} from "../utils/labels";
import { CategoryDataView } from "./CategoryDataView";
import { RunDiagnostics } from "./RunDiagnostics";
import { StatusPill } from "./StatusPill";

export function RunDetailView({
  detail,
  initialIssueId = null,
}: {
  detail: CrawlMonitorRunDetail;
  initialIssueId?: string | null;
}) {
  const { run } = detail;
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={outcomeTone(run.outcome)}>
            {OUTCOME_LABELS[run.outcome]}
          </StatusPill>
          <StatusPill tone={run.sourceMode === "LIVE" ? "ok" : "muted"}>
            {SOURCE_MODE_LABELS[run.sourceMode]}
            {run.archiveTimestamp ? ` ${run.archiveTimestamp}` : ""}
          </StatusPill>
          {run.origin === "FILE" ? (
            <StatusPill tone="muted">ファイルの記録</StatusPill>
          ) : null}
          {run.sourceMode !== "LIVE" ? (
            <span className="text-xs text-gray-500">
              この実行は公開値には反映されません。
            </span>
          ) : null}
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-gray-700 sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-gray-500">取得</dt>
            <dd>{formatJst(run.observedAt)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500">完了</dt>
            <dd>{formatJst(run.completedAt)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500">クローラー</dt>
            <dd className="truncate">{run.crawlerFile ?? "-"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500">リビジョン</dt>
            <dd>{run.crawlerRevision ?? "-"}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-gray-900">取得内容</h2>
        {detail.categories.map(category => (
          <div
            key={category.kind}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-gray-900">
                {CATEGORY_LABELS[category.kind]}
              </h3>
              <div className="flex flex-wrap gap-1">
                <StatusPill tone={categoryTone(category)}>
                  {STATE_LABELS[category.state]}
                </StatusPill>
                {run.origin === "DATABASE" ? (
                  category.eligibleForCurrent ? (
                    <StatusPill tone="ok">公開値に採用</StatusPill>
                  ) : (
                    <StatusPill tone="muted">公開値には未採用</StatusPill>
                  )
                ) : null}
              </div>
            </header>
            {category.itemCount > 0 ? (
              <p className="mb-2 text-xs text-gray-500">
                {category.usableItemCount}件が有効（全{category.itemCount}件）
              </p>
            ) : null}
            <CategoryDataView kind={category.kind} data={category.data} />
            {category.sourceUrls.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {category.sourceUrls.map(url => (
                  <li key={url} className="truncate text-xs">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-gray-600 underline-offset-2 hover:underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </section>

      <RunDiagnostics
        issues={detail.issues}
        artifacts={detail.artifacts}
        initialIssueId={initialIssueId}
      />
    </div>
  );
}
