"use client";

import type { TicketBundleResult } from "../utils/rentalBundle";
import { SourceLinks } from "./SourceLinks";

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

/**
 * リフト券とレンタルを別々に買うより、セット券のほうが安いときの枠。
 * 利用者ごとにセット券名と中身、別々に買った場合との差額を出す。
 * 券の枠（日ごとの枠）からはこの人たちのリフト券を外してある
 */
export const BundleSummary = ({ bundle }: { bundle: TicketBundleResult }) => {
  if (bundle.lines.length === 0) return null;
  const subtotal = bundle.lines.reduce((sum, line) => sum + line.subtotal, 0);
  return (
    <div className="rounded-lg border border-orange-200 bg-white px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-base font-bold text-gray-900">
          セット券
          <span className="ml-1.5 text-xs font-normal text-gray-600 md:text-sm">
            リフト券＋レンタル
          </span>
        </p>
        <p className="flex-shrink-0 text-base font-bold font-mono text-gray-900">
          {yen(subtotal)}
        </p>
      </div>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {bundle.lines.map(line => {
          const saved =
            line.separateSubtotal == null
              ? 0
              : line.separateSubtotal - line.subtotal;
          return (
            <div key={line.groupId} className="text-sm text-gray-900">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0">
                  <span className="font-semibold">{line.productName}</span>
                  <span className="ml-2 whitespace-nowrap text-gray-600">
                    {line.groupLabel} {line.count}名
                  </span>
                </p>
                {bundle.lines.length > 1 && (
                  <p className="flex-shrink-0 font-semibold font-mono">
                    {yen(line.subtotal)}
                  </p>
                )}
              </div>
              <p className="text-xs leading-snug text-gray-600">
                {line.includes.join("・")}
                {saved > 0 && (
                  <span className="ml-1.5 font-semibold text-orange-800">
                    別々に買うより{yen(saved)}安い
                  </span>
                )}
              </p>
              {line.purchaseNote && (
                <p className="text-xs leading-snug text-gray-600">
                  {line.purchaseNote}
                </p>
              )}
              {line.warnings.map(warning => (
                <p
                  key={warning}
                  className="text-xs leading-snug text-orange-900"
                >
                  ※ {warning}
                </p>
              ))}
              <SourceLinks
                numbers={line.sourceNumbers}
                references={bundle.references}
                quotes={line.sourceQuotes}
                single
                className="mt-0.5"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
