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
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 break-words text-sm leading-5 text-slate-600">
      {showLabel && <span>{label}</span>}
      {showFetched && (
        <span>
          取得: {date ?? "日時不明"}
          {date ? "（日本時間）" : ""}
        </span>
      )}
      {links.length ? (
        links.map((url, index) => (
          <ExternalLinkComponent
            key={url}
            href={url}
            title={url}
            className="inline-flex min-h-8 shrink-0 font-medium text-blue-700 underline underline-offset-2"
            aria-label={`${label}の出典を開く${links.length > 1 ? `（${index + 1}）` : ""}`}
          >
            出典{links.length > 1 ? index + 1 : ""}
            <ExternalLink className="size-3.5" />
          </ExternalLinkComponent>
        ))
      ) : (
        <span>出典未登録</span>
      )}
      {published.length ? (
        published.map(update => (
          <span key={update} className="min-w-0 max-w-full">
            {update}
          </span>
        ))
      ) : (
        <span>日時不明</span>
      )}
    </div>
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
      <dt className="text-sm text-slate-600">{label}</dt>
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
      className={`inline-flex size-5 shrink-0 items-center justify-center align-middle leading-none ${symbol === "○" ? "text-emerald-700" : symbol === "△" ? "text-amber-800" : "text-slate-600"}`}
    >
      {Icon ? (
        <Icon aria-hidden="true" className="size-5" strokeWidth={3.25} />
      ) : (
        <span className="text-lg font-bold">—</span>
      )}
    </span>
  );
}
