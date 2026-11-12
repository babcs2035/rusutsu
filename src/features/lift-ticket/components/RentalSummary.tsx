"use client";

import type { TicketPlanTierLink } from "../utils/planView";
import type { TicketRentalPick, TicketRentalResult } from "../utils/rental";
import { withSourceQuote } from "../utils/sourceQuote";
import { LinkChip, SourceLinks } from "./SourceLinks";

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

/**
 * 料金カードの中のレンタルの段。利用者ごとに「借りる物」と金額を出し、
 * その下に実際に借りる料金（セット・単品の組み合わせ）を小さく並べる。
 * レンタル情報が無いことは、合計の横の「＋ゴーグル」と注釈で知らせる
 */
export const RentalSummary = ({
  rental,
  dayCount,
  link = null,
  showTotal = true,
}: {
  rental: TicketRentalResult;
  /** 2日以上なら、日ごとに借りる料金に「× N日」を付ける */
  dayCount: number;
  /** 見出しに添えるメインのリンク（Web料金なら購入ページ、ほかは公式の料金表） */
  link?: TicketPlanTierLink | null;
  /** 段の合計。上の見出しと同じ金額になるときは出さない */
  showTotal?: boolean;
}) => {
  if (rental.status === "none" || rental.status === "not_collected") {
    return null;
  }
  // Web料金は商品ページへ（その料金の場所が分かるときも）。ほかは料金の出典へ
  const pickLink = (pick: TicketRentalPick) =>
    pick.purchaseUrl &&
    (pick.purchaseQuote || pick.purchaseUrl !== link?.url) ? (
      <LinkChip
        href={withSourceQuote(
          pick.purchaseUrl,
          pick.purchaseQuote ?? undefined,
        )}
        title={pick.purchaseUrl}
        aria-label="出典（購入ページ）"
        compact
        className="ml-1.5 align-middle"
      >
        出典
      </LinkChip>
    ) : (
      <SourceLinks
        numbers={pick.sourceNumbers}
        references={rental.references}
        quotes={pick.sourceQuotes}
        single
        compact
        className="ml-1.5 align-middle"
      />
    );
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-bold text-gray-900">
          レンタル
          {link && (
            <LinkChip href={link.url} tone={link.kind} title={link.url} compact>
              {link.kind === "purchase" ? "購入" : "出典"}
            </LinkChip>
          )}
        </p>
        {showTotal && (
          <p className="flex-shrink-0 text-sm font-bold font-mono text-gray-900">
            {rental.total == null ? "未確定" : yen(rental.total)}
          </p>
        )}
      </div>
      <div className="mt-1 flex flex-col gap-1">
        {rental.lines.map(line => (
          <div key={line.groupId} className="text-sm text-gray-900">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0">
                {line.groupLabel}
                {line.count > 1 && ` × ${line.count}`}
                <span className="ml-1.5 text-gray-600">
                  {line.requestLabel}
                </span>
              </p>
              {line.subtotal != null &&
                (rental.lines.length > 1 || !showTotal) && (
                  <p className="flex-shrink-0 font-semibold font-mono">
                    {yen(line.subtotal)}
                  </p>
                )}
            </div>
            {line.note && (
              <p className="text-xs text-orange-900">{line.note}</p>
            )}
            {(line.warnings ?? []).map(warning => (
              <p key={warning} className="text-xs text-orange-900 md:text-sm">
                {warning}
              </p>
            ))}
            {line.picks.map(pick => (
              <p
                key={`${pick.rentalId}:${pick.dates.join(",")}`}
                className="flex items-baseline justify-between gap-3 text-xs text-gray-600"
              >
                <span className="min-w-0">
                  {pick.name}
                  {pick.shopName && `（${pick.shopName}）`}
                  {pick.purchaseNote && ` ・${pick.purchaseNote}`}
                  {pickLink(pick)}
                </span>
                <span className="flex-shrink-0 font-mono">
                  {yen(pick.unitAmount)}
                  {dayCount > 1 && !pick.multiDay && ` × ${pick.times}日`}
                </span>
              </p>
            ))}
            {/* 日中のレンタルが夜も使えない場合に借り足す料金（合計には含めない） */}
            {(line.nightAddOns ?? []).map(addOn => (
              <p
                key={addOn.date}
                className="flex items-baseline justify-between gap-3 text-xs text-gray-600 md:text-sm"
              >
                <span className="min-w-0">
                  夜も借りるなら: ナイター用レンタル
                </span>
                <span className="flex-shrink-0 font-mono">
                  ＋{yen(addOn.unitTotal)}
                </span>
              </p>
            ))}
            {/* 宿泊者限定などの料金（合計には含めない） */}
            {(line.conditional ?? []).map(item => (
              <p
                key={item.label}
                className="flex items-baseline justify-between gap-3 text-xs text-gray-600 md:text-sm"
              >
                <span className="min-w-0">{item.label}なら</span>
                <span className="flex-shrink-0 font-mono">
                  {yen(item.unitTotal)}
                </span>
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
