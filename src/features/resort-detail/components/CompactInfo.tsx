import { Circle, ExternalLink, Triangle, X } from "lucide-react";
import type { ReactNode } from "react";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { sourceUrls } from "../utils/currentConditions";
import { normalizeIconSymbol, type StatusSymbol } from "../utils/detailMetrics";
import {
  formatOperationDate,
  formatPublishedDate,
} from "../utils/operationDates";

export function SourceLine({
  label,
  time,
  urls,
  updates = [],
  showFetched = true,
  showLabel = true,
}: {
  label: string;
  time?: string | null;
  urls?: string[];
  updates?: string[];
  showFetched?: boolean;
  showLabel?: boolean;
}) {
  const date = formatOperationDate(time);
  const published = [
    ...new Set(updates.map(formatPublishedDate).filter(Boolean)),
  ];
  const links = sourceUrls(urls);
  // 出典リンクと「〜現在」は対応する組として、同じ色の枠でまとめて囲う。
  const rowCount = Math.max(links.length, published.length);
  const rows =
    rowCount > 0
      ? Array.from({ length: rowCount }, (_, index) => ({
          url: links[index],
          publishedDate: published[index],
        }))
      : [{ url: undefined, publishedDate: undefined }];
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 break-words text-sm leading-5 text-slate-700">
      {showLabel && <span>{label}</span>}
      {showFetched && (
        <span>
          取得: {date ?? "日時不明"}
          {date ? "（日本時間）" : ""}
        </span>
      )}
      {rows.map((row, index) => (
        <span
          key={row.url ?? row.publishedDate ?? index}
          className="inline-flex min-h-7 min-w-0 max-w-full shrink-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5"
        >
          {row.url ? (
            <ExternalLinkComponent
              href={row.url}
              title={row.url}
              className="inline-flex shrink-0 items-center gap-0.5 font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800"
              aria-label={`${label}の出典を開く${rows.length > 1 ? `（${index + 1}）` : ""}`}
            >
              出典{rows.length > 1 ? index + 1 : ""}
              <ExternalLink className="size-3.5" />
            </ExternalLinkComponent>
          ) : (
            <span className="font-medium text-blue-700">出典未登録</span>
          )}
          <span className="min-w-0 max-w-full text-blue-800">
            {row.publishedDate ?? "日時不明"}
          </span>
        </span>
      ))}
    </div>
  );
}
/**
 * まだ一度も取得できていない情報だと分かるようにする。
 * 「0件」や「取得日時不明」と読み違えられないよう、色と文言を他と変える。
 */
export function NotFetchedBadge({ title }: { title?: string }) {
  return (
    <span
      title={title ?? "この情報はまだ取得できていません"}
      className="inline-flex shrink-0 items-center rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-sm font-semibold text-amber-800"
    >
      未取得
    </span>
  );
}
export function CompactMetric({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-slate-700">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
        {children}
      </dd>
    </div>
  );
}
export function operationText(
  statuses: Array<string | null | undefined>,
  partialLabel = "一部",
) {
  const symbols = statuses.map(normalizeIconSymbol);
  const known = symbols.filter(Boolean);
  if (!statuses.length) return "—";
  if (!known.length) return `不明 / ${statuses.length || "—"}`;
  const open = symbols.filter(s => s === "○").length;
  const partial = symbols.filter(s => s === "△").length;
  const unknown = symbols.length - known.length;
  return `${open}/${symbols.length}${partial ? ` · ${partialLabel}${partial}` : ""}${unknown ? ` · 不明${unknown}` : ""}`;
}
export function StatusMark({
  symbol,
  lift = false,
}: {
  symbol: StatusSymbol | null;
  lift?: boolean;
}) {
  const label =
    symbol === "○"
      ? lift
        ? "運行中"
        : "全面滑走可"
      : symbol === "△"
        ? lift
          ? "待機"
          : "一部滑走可"
        : symbol === "×"
          ? lift
            ? "運休"
            : "クローズ"
          : "状況不明";
  const Icon =
    symbol === "○"
      ? Circle
      : symbol === "△"
        ? Triangle
        : symbol === "×"
          ? X
          : null;
  return (
    <span
      role="img"
      title={label}
      aria-label={label}
      className={`inline-flex size-5 shrink-0 items-center justify-center align-middle leading-none ${symbol === "○" ? "text-emerald-700" : symbol === "△" ? "text-amber-800" : "text-slate-700"}`}
    >
      {Icon ? (
        <Icon aria-hidden="true" className="size-5" strokeWidth={3.25} />
      ) : (
        <span className="text-lg font-bold">—</span>
      )}
    </span>
  );
}
