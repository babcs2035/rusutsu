import type { TicketConditionalOffer } from "../types";
import type { TicketPlanConditionalOffer } from "../utils/calculateLiftTicket";
import type { PriceReference } from "../utils/priceTable";
import { SourceLinks } from "./SourceLinks";

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

const weekdayOf = (date: string) =>
  ["日", "月", "火", "水", "木", "金", "土"][
    new Date(`${date}T12:00:00Z`).getUTCDay()
  ];

const shortDateOf = (date: string) =>
  `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${weekdayOf(date)}）`;

/**
 * 条件付きの割引。「誰なら」を見出しに大きく出し、金額と出典だけを添える。
 *
 * ★**補足の文章（提示物・割引額の説明など）は出さない。** 詳しい条件は出典で確かめる。
 * 1日ずつ割引を使って買う案（木曜だけレディースDAY）は、日ごとに1行ずつ内訳を出す。
 * 利用者区分は、パーティに複数の区分があるときだけ添える。
 */
type ConditionalOffer = TicketConditionalOffer | TicketPlanConditionalOffer;

/**
 * 同じ割引（見出しの条件名が同じ）の offer を1つにまとめる。
 * 1日ずつ割引を使う案（days あり）は日ごとの内訳があるので、そのまま1件ずつ出す。
 */
const groupByLabel = (offers: ConditionalOffer[]) => {
  const groups: ConditionalOffer[][] = [];
  const byLabel = new Map<string, ConditionalOffer[]>();
  for (const offer of offers) {
    if ("days" in offer && offer.days) {
      groups.push([offer]);
      continue;
    }
    const group = byLabel.get(offer.label);
    if (group) {
      group.push(offer);
    } else {
      const created = [offer];
      byLabel.set(offer.label, created);
      groups.push(created);
    }
  }
  return groups;
};

export const ConditionalOffers = ({
  offers,
  sourcesOf,
  references,
  dayCount = 1,
  className,
}: {
  offers: ConditionalOffer[];
  sourcesOf: (offer: TicketConditionalOffer) => number[];
  references: PriceReference[];
  /** 同じ内容の日が何日あるか。offer は1日分なので、金額と行に日数を掛ける */
  dayCount?: number;
  className?: string;
}) => {
  if (offers.length === 0) return null;
  const daySuffix = dayCount > 1 ? ` × ${dayCount}日` : "";
  const showGroup = new Set(offers.map(offer => offer.groupId)).size > 1;
  return (
    <div
      className={`rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 ${className ?? ""}`}
    >
      <span className="inline-block whitespace-nowrap rounded-full bg-purple-700 px-2 py-0.5 text-[0.6875rem] font-bold leading-none text-white md:text-xs">
        条件付き割引
      </span>
      <ul className="mt-1.5 flex flex-col divide-y divide-purple-100">
        {groupByLabel(offers).map(group => {
          const first = group[0];
          const days = "days" in first ? first.days : null;
          const numbers = [
            ...new Set(group.flatMap(offer => sourcesOf(offer))),
          ].sort((left, right) => left - right);
          const sources = (
            <SourceLinks
              numbers={numbers}
              references={references}
              quotes={group.length === 1 ? first.sourceQuotes : undefined}
              compact
              className="ml-1.5 align-middle"
            />
          );
          // パーティに複数の区分があるときは、割引ごとに区分別の行へ分ける
          if (showGroup && !days) {
            return (
              <li key={first.id} className="py-1.5 first:pt-0 last:pb-0">
                <p className="text-[0.8125rem] font-bold text-purple-950 md:text-sm">
                  {first.label}
                  {sources}
                </p>
                {group.map(offer => (
                  <p
                    key={offer.id}
                    className="flex items-baseline justify-between gap-2 pl-2 text-[0.8125rem] text-purple-950 md:text-sm"
                  >
                    <span className="min-w-0">
                      {offer.groupLabel} {offer.count}名{daySuffix}
                    </span>
                    <span className="flex-shrink-0 font-bold font-mono">
                      {yen(offer.subtotal * dayCount)}
                    </span>
                  </p>
                ))}
              </li>
            );
          }
          return (
            <li key={first.id} className="py-1.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 text-[0.8125rem] font-bold text-purple-950 md:text-sm">
                  {first.label}
                  {!days && daySuffix && (
                    <span className="ml-1 whitespace-nowrap text-[0.6875rem] font-normal md:text-xs">
                      {daySuffix.trim()}
                    </span>
                  )}
                  {sources}
                </p>
                <p className="flex-shrink-0 text-[0.8125rem] font-bold text-purple-950 font-mono md:text-sm">
                  {yen(days ? first.subtotal : first.subtotal * dayCount)}
                </p>
              </div>
              {days?.map(day => (
                <p
                  key={day.date}
                  className="flex justify-between gap-2 text-[0.6875rem] text-purple-900 md:text-xs"
                >
                  <span className="min-w-0">
                    {shortDateOf(day.date)} {day.label}
                  </span>
                  <span className="flex-shrink-0 font-mono">
                    {yen(day.subtotal)}
                  </span>
                </p>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
