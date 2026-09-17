import type { CrawlMonitorCurrent } from "@/server/crawl-latest/adminContract";
import {
  CATEGORY_KINDS,
  CATEGORY_LABELS,
  categoryTone,
  formatJst,
  STATE_LABELS,
} from "../utils/labels";
import { CategoryDataView } from "./CategoryDataView";
import { StatusPill } from "./StatusPill";

/**
 * 公開に使われている現在値。runの履歴と違い、ここに出るものがサイトに反映されている。
 */
export function CurrentSnapshots({
  currents,
}: {
  currents: readonly CrawlMonitorCurrent[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {CATEGORY_KINDS.map(kind => {
        const current = currents.find(entry => entry.kind === kind);
        return (
          <section
            key={kind}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-gray-900">
                {CATEGORY_LABELS[kind]}
              </h3>
              {current ? (
                <StatusPill tone={categoryTone(current)}>
                  {STATE_LABELS[current.state]}
                  {current.validationState !== "VALID"
                    ? ` / ${current.validationState === "WARNING" ? "警告あり" : "不採用"}`
                    : ""}
                </StatusPill>
              ) : (
                <StatusPill tone="muted">現在値なし</StatusPill>
              )}
            </header>
            {current ? (
              <>
                <p className="mb-2 text-xs text-gray-500">
                  取得 {formatJst(current.observedAt)}
                  {current.origin === "FILE"
                    ? "（ファイルの記録）"
                    : ` / 反映 ${formatJst(current.updatedAt)}`}
                  {current.itemCount > 0
                    ? ` / ${current.usableItemCount}件が有効（全${current.itemCount}件）`
                    : ""}
                </p>
                <CategoryDataView kind={kind} data={current.data} />
                {current.sourceUrls.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1">
                    {current.sourceUrls.map(url => (
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
              </>
            ) : (
              <p className="text-sm text-gray-500">
                このカテゴリは取得できた記録がありません。
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
