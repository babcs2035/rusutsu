"use client";

import { useEffect, useRef, useState } from "react";
import type { CrawlMonitorRunDetail } from "@/server/crawl-latest/adminContract";
import { withBasePath } from "@/shared/utils/basePath";
import { CATEGORY_LABELS, formatJst, SEVERITY_LABELS } from "../utils/labels";
import { StatusPill } from "./StatusPill";

type Issue = CrawlMonitorRunDetail["issues"][number];
type Artifact = CrawlMonitorRunDetail["artifacts"][number];
type Preview = { artifact: Artifact; selector: string | null };

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

/** 警告に記録された要素の指定（クローラーが待った・読んだセレクター）。 */
const issueSelector = (issue: Issue): string | null => {
  const details = issue.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const selector = (details as Record<string, unknown>).selector;
  return typeof selector === "string" && selector.trim() !== ""
    ? selector
    : null;
};

const linkedArtifacts = (issue: Issue, artifacts: Artifact[]) =>
  issue.externalId
    ? artifacts.filter(artifact =>
        artifact.issueExternalIds.includes(issue.externalId ?? ""),
      )
    : [];

const previewUrl = ({ artifact, selector }: Preview) => {
  const search = new URLSearchParams();
  const base = artifact.finalUrl ?? artifact.requestedUrl;
  if (base) search.set("base", base);
  if (selector) search.set("selector", selector);
  return withBasePath(
    `/admin/crawl/artifacts/${artifact.id}/preview?${search.toString()}`,
  );
};

export function RunDiagnostics({
  issues,
  artifacts,
  initialIssueId,
}: {
  issues: Issue[];
  artifacts: Artifact[];
  initialIssueId: string | null;
}) {
  const [preview, setPreview] = useState<Preview | null>(() => {
    const issue = issues.find(candidate => candidate.id === initialIssueId);
    const artifact = issue
      ? linkedArtifacts(issue, artifacts).find(item => item.hasContent)
      : undefined;
    return issue && artifact
      ? { artifact, selector: issueSelector(issue) }
      : null;
  });
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (preview) panel.current?.scrollIntoView({ block: "start" });
  }, [preview]);

  const issuesByExternalId = new Map(
    issues.flatMap(issue =>
      issue.externalId ? [[issue.externalId, issue] as const] : [],
    ),
  );

  return (
    <>
      {preview ? (
        <section
          ref={panel}
          aria-label="DOMプレビュー"
          className="flex scroll-mt-4 flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">DOMプレビュー</h2>
            <p className="min-w-0 flex-1 truncate text-xs text-gray-600">
              {preview.artifact.finalUrl ?? preview.artifact.requestedUrl ?? ""}
              {" · "}
              {formatJst(preview.artifact.capturedAt)}
            </p>
            <a
              href={withBasePath(
                `/admin/crawl/artifacts/${preview.artifact.id}`,
              )}
              className="text-xs text-gray-800 underline underline-offset-2"
            >
              ダウンロード
            </a>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              閉じる
            </button>
          </div>
          <iframe
            key={previewUrl(preview)}
            title="取得時のDOM"
            src={previewUrl(preview)}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="h-[70vh] w-full rounded border border-gray-200 bg-white"
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-gray-900">
          警告・エラー（{issues.length}件）
        </h2>
        {issues.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            この実行では警告もエラーも出ていません。
          </p>
        ) : (
          issues.map(issue => {
            const pages = linkedArtifacts(issue, artifacts);
            return (
              <div
                key={issue.id}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    tone={issue.severity === "ERROR" ? "bad" : "warn"}
                  >
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
                {pages.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {pages.map(artifact =>
                      artifact.hasContent ? (
                        <button
                          key={artifact.id}
                          type="button"
                          onClick={() =>
                            setPreview({
                              artifact,
                              selector: issueSelector(issue),
                            })
                          }
                          className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-800 hover:bg-gray-50"
                        >
                          DOMを表示
                          {pages.length > 1 ? `（${artifact.pageKey}）` : ""}
                        </button>
                      ) : (
                        <span
                          key={artifact.id}
                          className="text-xs text-gray-500"
                        >
                          DOM: {artifact.captureError ?? "保存期間切れ"}
                        </span>
                      ),
                    )}
                  </div>
                ) : null}
                <JsonBlock label="詳細" value={issue.details} />
              </div>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-gray-900">
          取得時のDOM（{artifacts.length}件）
        </h2>
        {artifacts.length === 0 ? (
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
                  <th className="px-3 py-2 font-medium">保存した理由</th>
                  <th className="px-3 py-2 font-medium">HTTP</th>
                  <th className="px-3 py-2 font-medium">サイズ</th>
                  <th className="px-3 py-2 font-medium">DOM</th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map(artifact => {
                  const reasons = artifact.issueExternalIds.flatMap(id => {
                    const issue = issuesByExternalId.get(id);
                    return issue ? [issue] : [];
                  });
                  return (
                    <tr key={artifact.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 align-top">
                        <p className="text-gray-800">{artifact.pageKey}</p>
                        <p className="text-xs text-gray-500">
                          {artifact.categoryKind
                            ? CATEGORY_LABELS[artifact.categoryKind]
                            : ""}
                          {artifact.title ? ` ${artifact.title}` : ""}
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
                      <td className="max-w-[280px] px-3 py-2 align-top text-xs text-gray-700">
                        {reasons.length > 0
                          ? [...new Set(reasons.map(issue => issue.code))].join(
                              ", ",
                            )
                          : "-"}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-gray-700">
                        {artifact.httpStatus ?? "-"}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-gray-700">
                        {formatBytes(artifact.sizeBytes)}
                      </td>
                      <td className="px-3 py-2 align-top text-xs">
                        {artifact.hasContent ? (
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setPreview({
                                  artifact,
                                  selector:
                                    reasons.map(issueSelector).find(Boolean) ??
                                    null,
                                })
                              }
                              className="text-gray-800 underline underline-offset-2"
                            >
                              表示
                            </button>
                            <a
                              href={withBasePath(
                                `/admin/crawl/artifacts/${artifact.id}`,
                              )}
                              className="text-gray-800 underline underline-offset-2"
                            >
                              ダウンロード
                            </a>
                          </div>
                        ) : (
                          <span className="text-gray-500">
                            {artifact.captureError ?? "保存期間切れ"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
