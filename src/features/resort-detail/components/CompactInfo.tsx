import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { sourceUrls } from "../utils/currentConditions";
import { normalizeIconSymbol, type StatusSymbol } from "../utils/detailMetrics";

export function SourceLine({
  label,
  time,
  urls,
  updates = [],
}: {
  label: string;
  time?: string | null;
  urls?: string[];
  updates?: string[];
}) {
  const date =
    time && /Z$|[+-]\d\d:\d\d$/u.test(time)
      ? new Date(time).toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
          hour12: false,
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : time?.replace(/(\d{1,2}:\d{2}):\d{2}$/, "$1");
  const links = sourceUrls(urls);
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-[10px] leading-5 text-slate-600">
      <span>
        {label} · 取得 {date || "日時不明"} {date ? "JST" : ""}
      </span>
      {links.length ? (
        links.map((url, index) => (
          <ExternalLinkComponent
            key={url}
            href={url}
            title={url}
            className="max-w-full min-h-6 text-blue-700 underline underline-offset-2"
            aria-label={`${label}の出典を開く: ${url}`}
          >
            <span className="max-w-28 truncate">
              出典{links.length > 1 ? index + 1 : ""}: {url}
            </span>
            <ExternalLink className="size-3 shrink-0" />
          </ExternalLinkComponent>
        ))
      ) : (
        <span>出典URL未登録</span>
      )}
      {[...new Set(updates.filter(Boolean))].map(update => (
        <span key={update}>発表: {update}</span>
      ))}
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
      <dt className="text-xs text-slate-600">{label}</dt>
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
  return (
    <span
      role="img"
      title={label}
      aria-label={label}
      className={`font-bold ${symbol === "○" ? "text-emerald-700" : symbol === "△" ? "text-amber-800" : "text-slate-500"}`}
    >
      {symbol ?? "—"}
    </span>
  );
}
