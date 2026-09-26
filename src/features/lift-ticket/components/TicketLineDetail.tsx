import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { TicketCalculationLine } from "../types";

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

/** 「12/19から販売開始です」。日ごとに繰り返さず、カードの下に1回だけ出す */
const isSalesStartWarning = (warning: string) =>
  /から販売開始です$/u.test(warning);

/** オンラインで買う料金か（購入ページのURLがある） */
const isOnlineLine = (line: TicketCalculationLine) => line.purchaseUrl != null;

/**
 * 行に出す券名。オンライン料金・通常料金は券種名だけ。年齢割引などを
 * 自動適用したときだけ、何の料金かが分かる offer 名を出す
 */
const ticketNameOf = (line: TicketCalculationLine) =>
  line.standardOfferName != null && !isOnlineLine(line)
    ? line.offerName
    : (line.productName ?? line.offerName);

/** 券名と「オンライン」の目印 */
export const TicketName = ({ line }: { line: TicketCalculationLine }) => (
  <>
    <span className="font-semibold">{ticketNameOf(line)}</span>
    {isOnlineLine(line) && (
      <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 align-middle text-blue-700 text-xs font-semibold">
        オンライン
      </span>
    )}
  </>
);

/**
 * 枠の中の行がすべて同じ券なら、券名は枠の見出しの下に1回だけ出し、
 * 行には「誰が何人」と金額だけを出す（「25時間券 オンライン」を人数分繰り返さない）
 */
export const sharesTicket = (lines: TicketCalculationLine[]) =>
  lines.length > 1 &&
  new Set(lines.map(line => `${ticketNameOf(line)}|${isOnlineLine(line)}`))
    .size === 1;

/**
 * 1枚の券の行。「券名［オンライン］ 誰が何人」と金額だけを出す。
 *
 * ★購入ページ・窓口との差額・販売開始日は日ごとに繰り返さず、
 * カードの下に1回だけ出す（PurchaseSummary）。
 */
export const TicketLineDetail = ({
  line,
  multiplier = 1,
  multiplierUnit = "枚",
  showAmount = true,
  showTicket = true,
}: {
  line: TicketCalculationLine;
  /** 25時間券を2枚買うときなどの枚数、同じ券を買う日数 */
  multiplier?: number;
  /** 「× 2枚」（25時間券）か「× 3日」（同じ券を3日買う）か */
  multiplierUnit?: "枚" | "日";
  /** 日の見出しに同じ金額が出ているときは false */
  showAmount?: boolean;
  /** 券名を枠の見出しに出したときは false */
  showTicket?: boolean;
}) => {
  const subtotal = line.subtotal == null ? null : line.subtotal * multiplier;
  // ナイター券の行は groupLabel に「（ナイター）」が付くが、券名で分かる
  const person = line.groupLabel.replace(/（ナイター）$/u, "");
  const warnings = (line.warnings ?? []).filter(
    warning => !isSalesStartWarning(warning),
  );
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-sm text-gray-900">
          {showTicket && <TicketName line={line} />}
          <span
            className={cn(
              "whitespace-nowrap",
              showTicket ? "ml-2 text-gray-600" : "text-gray-800",
            )}
          >
            {person} {line.count}名
            {multiplier > 1 ? ` × ${multiplier}${multiplierUnit}` : ""}
          </span>
        </p>
        {showAmount && (
          <p className="flex-shrink-0 text-sm font-semibold text-gray-900 font-mono">
            {subtotal == null ? "未確定" : yen(subtotal)}
          </p>
        )}
      </div>
      {warnings.map(warning => (
        <p key={warning} className="text-xs text-orange-900 leading-snug">
          ※ {warning}
        </p>
      ))}
    </div>
  );
};

/** 行のどれかがオンライン購入か。合計の見出しに「（オンライン購入）」を付ける */
export const hasOnlineLine = (lines: TicketCalculationLine[]) =>
  lines.some(isOnlineLine);

/**
 * カードの下に1回だけ出す、オンライン購入の案内。
 * 「窓口で買う場合 ¥50,100」と購入ページ、販売開始日。
 * lines は画面に出した行と、その行を何回買うか（日数・枚数）。
 */
export const PurchaseSummary = ({
  lines,
  total,
}: {
  lines: Array<{ line: TicketCalculationLine; multiplier: number }>;
  total: number | null;
}) => {
  const online = lines.filter(({ line }) => isOnlineLine(line));
  if (online.length === 0) return null;
  const urls = [...new Set(online.map(({ line }) => line.purchaseUrl ?? ""))];
  const counterExtra = online.reduce(
    (sum, { line, multiplier }) =>
      line.standardSubtotal != null && line.subtotal != null
        ? sum + (line.standardSubtotal - line.subtotal) * multiplier
        : sum,
    0,
  );
  const salesStarts = [
    ...new Set(
      online.flatMap(({ line }) =>
        (line.warnings ?? []).filter(isSalesStartWarning),
      ),
    ),
  ];
  return (
    <div className="flex flex-col gap-1 border-t border-orange-200 pt-2 text-sm">
      {total != null && counterExtra > 0 && (
        <div className="flex items-baseline justify-between gap-3 text-gray-600">
          <span>窓口で買う場合</span>
          <span className="font-mono">{yen(total + counterExtra)}</span>
        </div>
      )}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {urls.map(url => (
          <ExternalLinkComponent
            key={url}
            href={url}
            className="inline-flex items-center gap-0.5 font-semibold text-blue-700 underline underline-offset-2"
          >
            オンライン購入ページ
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </ExternalLinkComponent>
        ))}
        {salesStarts.map(warning => (
          <span key={warning} className="text-gray-600 text-xs">
            {warning.replace(/です$/u, "")}
          </span>
        ))}
      </div>
    </div>
  );
};
