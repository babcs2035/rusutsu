"use client";

import type { TicketRentalResult } from "../utils/rental";
import { SourceLinks } from "./SourceLinks";

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

/**
 * 料金カードの中のレンタルの枠。利用者ごとに「借りる物」と金額を出し、
 * その下に実際に借りる料金（セット・単品の組み合わせ）を小さく並べる。
 * レンタル情報が無いことは、合計の横の「＋ゴーグル」と注釈で知らせる
 */
export const RentalSummary = ({
  rental,
  dayCount,
}: {
  rental: TicketRentalResult;
  /** 2日以上なら、日ごとに借りる料金に「× N日」を付ける */
  dayCount: number;
}) => {
  if (rental.status === "none" || rental.status === "not_collected") {
    return null;
  }
  return (
    <div className="rounded-lg border border-orange-200 bg-white px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-base font-bold text-gray-900">レンタル</p>
        <p className="flex-shrink-0 text-base font-bold font-mono text-gray-900">
          {rental.total == null ? "未確定" : yen(rental.total)}
        </p>
      </div>
      <div className="mt-1.5 flex flex-col gap-1.5">
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
              {line.subtotal != null && rental.lines.length > 1 && (
                <p className="flex-shrink-0 font-mono">{yen(line.subtotal)}</p>
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
              <div key={`${pick.rentalId}:${pick.dates.join(",")}`}>
                <p className="flex items-baseline justify-between gap-3 text-xs text-gray-600">
                  <span className="min-w-0">
                    {pick.name}
                    {pick.shopName && `（${pick.shopName}）`}
                    {pick.purchaseNote && ` ・${pick.purchaseNote}`}
                  </span>
                  <span className="flex-shrink-0 font-mono">
                    {yen(pick.unitAmount)}
                    {dayCount > 1 && !pick.multiDay && ` × ${pick.times}日`}
                  </span>
                </p>
                <SourceLinks
                  numbers={pick.sourceNumbers}
                  references={rental.references}
                  quotes={pick.sourceQuotes}
                  single
                  className="mt-0.5"
                />
              </div>
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
