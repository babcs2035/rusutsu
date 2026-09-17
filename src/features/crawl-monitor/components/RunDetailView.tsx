import type { CrawlMonitorRunDetail } from "@/server/crawl-latest/adminContract";
import { withBasePath } from "@/shared/utils/basePath";
import {
  CATEGORY_LABELS,
  categoryTone,
  formatJst,
  OUTCOME_LABELS,
  outcomeTone,
  SEVERITY_LABELS,
  SOURCE_MODE_LABELS,
  STATE_LABELS,
} from "../utils/labels";
import { CategoryDataView } from "./CategoryDataView";
import { StatusPill } from "./StatusPill";

const formatBytes = (value: string | null): string => {
  if (value === null) return "-";
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <details className="rounded-lg border border-gray-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-medium text-gray-800">
        {label}
      </summary>
      <pre className="mt-2 max-h-[420px] overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function RunDetailView({ detail }: { detail: CrawlMonitorRunDetail }) {
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

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-gray-900">
          警告・エラー（{detail.issues.length}件）
        </h2>
        {detail.issues.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            この実行では警告もエラーも出ていません。
          </p>
        ) : (
          detail.issues.map(issue => (
            <div
              key={issue.id}
              className="rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={issue.severity === "ERROR" ? "bad" : "warn"}>
                  {SEVERITY_LABELS[issue.severity]}
                </StatusPill>
                <code className="text-xs text-gray-600">{issue.code}</code>
                {issue.categoryKind ? (
                  <span className="text-xs text-gray-500">
                    {CATEGORY_LABELS[issue.categoryKind]}
                  </span>
                ) : null}
                {issue.blocksPromotion ? (
                  <StatusPill tone="bad">公開値に未反映</StatusPill>
                ) : null}
                {issue.occurrences > 1 ? (
                  <span className="text-xs text-gray-500">
                    {issue.occurrences}件
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap text-gray-800">
                {issue.message}
              </p>
              <JsonBlock label="詳細" value={issue.details} />
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-gray-900">
          取得時のDOM（{detail.artifacts.length}件）
        </h2>
        {detail.artifacts.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            この実行ではDOMを保存していません。
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 font-medium">ページ</th>
                  <th className="px-3 py-2 font-medium">取得元</th>
                  <th className="px-3 py-2 font-medium">HTTP</th>
                  <th className="px-3 py-2 font-medium">サイズ</th>
                  <th className="px-3 py-2 font-medium">保存</th>
                </tr>
              </thead>
              <tbody>
                {detail.artifacts.map(artifact => (
                  <tr key={artifact.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 align-top">
                      <p className="text-gray-800">{artifact.pageKey}</p>
                      <p className="text-xs text-gray-500">
                        {artifact.title ?? ""}
                      </p>
                    </td>
                    <td className="max-w-[280px] px-3 py-2 align-top">
                      <p className="truncate text-xs text-gray-600">
                        {artifact.finalUrl ?? artifact.requestedUrl ?? "-"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatJst(artifact.capturedAt)}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-gray-700">
                      {artifact.httpStatus ?? "-"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-gray-700">
                      {formatBytes(artifact.sizeBytes)}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {artifact.hasContent ? (
                        <a
                          href={withBasePath(
                            `/admin/crawl/artifacts/${artifact.id}`,
                          )}
                          className="text-gray-800 underline underline-offset-2"
                        >
                          ダウンロード
                        </a>
                      ) : (
                        <span className="text-gray-500">
                          {artifact.captureError ?? "保存期間切れ"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <JsonBlock
        label="rawPayload（クローラーが送った生データ）"
        value={detail.rawPayload}
      />
    </div>
  );
}
