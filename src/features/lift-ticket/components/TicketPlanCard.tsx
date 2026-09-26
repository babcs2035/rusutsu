"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TicketCalculationLine } from "../types";
import type { TicketPlanResult } from "../utils/calculateLiftTicket";
import { splitSources } from "../utils/sources";
import { SourceLinks } from "./SourceLinks";
import {
  hasOnlineLine,
  PurchaseSummary,
  sharesTicket,
  TicketLineDetail,
  TicketName,
} from "./TicketLineDetail";

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

/**
 * 枠の中の券の行。全員が同じ券なら券名を1回だけ出す。
 * 券が1行だけなら金額は枠の見出しと同じなので行には出さない
 */
const TicketLines = ({
  lines,
  multiplier,
  multiplierUnit,
  showAmounts = lines.length > 1,
}: {
  lines: TicketCalculationLine[];
  multiplier: number;
  multiplierUnit: "枚" | "日";
  /** 枠の中に券が複数種類あるときは、1人でも行ごとの金額を出す */
  showAmounts?: boolean;
}) => {
  const shared = sharesTicket(lines);
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {shared && (
        <p className="text-sm text-gray-900">
          <TicketName line={lines[0]} />
        </p>
      )}
      {lines.map(line => (
        <TicketLineDetail
          key={line.groupId}
          line={line}
          multiplier={multiplier}
          multiplierUnit={multiplierUnit}
          showAmount={showAmounts}
          showTicket={!shared}
        />
      ))}
    </div>
  );
};

const weekdayOf = (date: string) => {
  if (!date) return "";
  const at = new Date(`${date}T12:00:00Z`);
  return ["日", "月", "火", "水", "木", "金", "土"][at.getUTCDay()];
};

/**
 * 日ごとの料金と合計を出す。
 *
 * ★**2日以上滑る場合は「連続2日券」「25時間券（＋トップアップ）」と「1日ずつ」を比べて安いほうを出す。**
 * 採用した券でまかなう日は、その日の欄にも採用した券を出す。採用しなかった
 * 1日ずつの券や金額は並べない（使わない券の料金は利用者に要らない）。
 *
 * ★**同じ金額を何度も並べない。** 日ごとの小計は、2日以上あって
 * その日の内訳が複数行ある（または追加費用がある）ときだけ出す。
 * 1人1日なら「合計」と内訳の2か所で足りる。
 */
export const TicketPlanCard = ({ plan }: { plan: TicketPlanResult }) => {
  const usesMultiDay = plan.multiDay != null;

  // 全日に共通する出典は合計の横に1回だけ出し、日ごとには追加分だけ出す。
  // 複数日券でまかなう日は、その券の出典を使う
  const daySources = plan.days.map(day =>
    usesMultiDay && plan.multiDay?.dates.includes(day.plan.date)
      ? plan.multiDay.sourceNumbers
      : [...new Set(day.result.lines.flatMap(line => line.sourceNumbers))],
  );
  const sources = splitSources(daySources);
  const extraSourcesOf = (numbers: number[], dayIndex: number) =>
    numbers.filter(
      number =>
        !sources.common.includes(number) &&
        !daySources[dayIndex]?.includes(number),
    );

  // ★**券も金額も同じ日は1つにまとめて「× 3日」と出す**（同じ内訳を繰り返さない）
  const dayGroups: Array<{ indices: number[] }> = [];
  const signatureOf = (index: number) => {
    const day = plan.days[index];
    const covered =
      usesMultiDay && plan.multiDay?.dates.includes(day.plan.date);
    return JSON.stringify([
      covered,
      day.result.status,
      day.result.notes[0] ?? null,
      day.result.payableTotal,
      day.result.lines,
      day.result.conditionalOffers.map(offer => [offer.id, offer.subtotal]),
    ]);
  };
  const groupBySignature = new Map<string, { indices: number[] }>();
  plan.days.forEach((day, index) => {
    // 複数日券・25時間券でまかなう日は、その券の枠にまとめて出す（日ごとの枠は作らない）
    if (usesMultiDay && plan.multiDay?.dates.includes(day.plan.date)) return;
    const signature = signatureOf(index);
    const existing = groupBySignature.get(signature);
    if (existing) {
      existing.indices.push(index);
      return;
    }
    const group = { indices: [index] };
    groupBySignature.set(signature, group);
    dayGroups.push(group);
  });

  // 日の枠と複数日券の枠を日付順に並べる（複数日券が途中の日だけをまかなうこともある）
  const sortedDates = [...plan.days.map(day => day.plan.date)].sort();
  const orderOfDate = (date: string) => sortedDates.indexOf(date);

  const dateLabelOf = (indices: number[]) =>
    dateLabelOfDates(indices.map(index => plan.days[index].plan.date));
  function dateLabelOfDates(dates: string[]) {
    if (dates.length === 1 && !dates[0]) return "日付未入力";
    const short = (date: string) =>
      `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${weekdayOf(date)}）`;
    const consecutive = dates.every(
      (date, i) =>
        i === 0 ||
        Date.parse(`${date}T12:00:00Z`) -
          Date.parse(`${dates[i - 1]}T12:00:00Z`) ===
          86400000,
    );
    if (dates.length === 1) return short(dates[0]);
    return consecutive
      ? `${short(dates[0])}〜${short(dates[dates.length - 1])}`
      : dates.map(short).join("・");
  }

  // 画面に出す券の行と、その行を買う回数（日数・枚数）。オンライン購入の案内に使う
  const shownLines = [
    ...dayGroups.flatMap(({ indices }) => {
      const day = plan.days[indices[0]];
      if (usesMultiDay && plan.multiDay?.dates.includes(day.plan.date)) {
        return [];
      }
      return day.result.lines.map(line => ({
        line,
        multiplier: indices.length,
      }));
    }),
    ...(plan.multiDay?.lines ?? []).map(line => ({
      line,
      multiplier: plan.multiDay?.ticketCount ?? 1,
    })),
    ...(plan.multiDay?.addOns ?? []).flatMap(addOn =>
      addOn.lines.map(line => ({ line, multiplier: addOn.ticketCount })),
    ),
  ];

  // 全日が同じ理由で計算できない場合（日付・人数の未入力など）は、
  // 未確定の行を並べるより理由を1つ出したほうが分かりやすい
  const blockingNote =
    plan.days.length > 0 &&
    plan.days.every(
      day =>
        day.result.status === "unavailable" &&
        day.result.notes[0] === plan.days[0].result.notes[0],
    )
      ? plan.days[0].result.notes[0]
      : null;

  if (plan.days.length === 0 || blockingNote) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-sm font-semibold text-gray-500">
            {blockingNote ?? "日付と1人以上の人数を入力してください。"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "rounded-xl border p-4",
          plan.total == null
            ? "bg-gray-50 border-gray-200"
            : "bg-orange-50 border-orange-300",
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-700">
              {plan.days.length === 1 ? "合計" : `${plan.days.length}日の合計`}
            </p>
            {hasOnlineLine(shownLines.map(({ line }) => line)) && (
              <p className="text-xs text-gray-600">オンライン購入の料金</p>
            )}
          </div>
          {plan.total == null ? (
            <p className="text-sm font-semibold text-gray-600">未確定</p>
          ) : (
            <p className="text-2xl font-bold text-gray-900 font-mono">
              {yen(plan.total)}
            </p>
          )}
        </div>

        {/* 1日（または同じ内容の日のまとまり）ごとに白い枠で囲み、日付を見出しにする */}
        <div className="mt-3 flex flex-col gap-2">
          {dayGroups.map(({ indices }) => {
            const index = indices[0];
            const day = plan.days[index];
            const dayCount = indices.length;
            const covered =
              usesMultiDay && plan.multiDay?.dates.includes(day.plan.date);
            return (
              <div
                key={day.plan.id}
                className="rounded-lg border border-orange-200 bg-white px-3 py-2.5"
                style={{ order: orderOfDate(day.plan.date) }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 text-base font-bold text-gray-900">
                    {dateLabelOf(indices)}
                  </p>
                  {!covered && (
                    <p className="flex-shrink-0 text-base font-bold font-mono text-gray-900">
                      {day.result.payableTotal == null
                        ? "未確定"
                        : yen(day.result.payableTotal * dayCount)}
                    </p>
                  )}
                </div>
                {covered && plan.multiDay && (
                  <p className="mt-1 text-sm text-gray-600">
                    {plan.multiDay.productName}で滑る
                  </p>
                )}
                {day.result.status === "closed" && (
                  <p className="mt-1 text-sm text-orange-900">
                    この日は営業していません
                    {day.result.notes[0] ? `（${day.result.notes[0]}）` : ""}
                  </p>
                )}
                {day.result.status === "outside_season" && (
                  <p className="mt-1 text-sm text-orange-900">
                    {day.result.notes[0]}
                  </p>
                )}

                {/* 券が1枚なら金額は見出しと同じなので行には出さない */}
                {!covered && day.result.lines.length > 0 && (
                  <TicketLines
                    lines={day.result.lines}
                    multiplier={dayCount}
                    multiplierUnit="日"
                  />
                )}
                <SourceLinks
                  numbers={sources.extras[index] ?? []}
                  references={plan.references}
                  className="mt-1.5"
                />

                {!covered && day.result.conditionalOffers.length > 0 && (
                  <Card className="mt-2 rounded-lg border-purple-200 bg-purple-50">
                    <CardHeader>
                      <CardTitle className="text-[0.6875rem] font-bold text-purple-900">
                        条件を満たす場合の割引料金
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="mt-1.5 flex flex-col gap-1.5">
                        {day.result.conditionalOffers.map(offer => (
                          <div
                            key={offer.id}
                            className="flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-[0.6875rem] font-bold text-purple-900">
                                {offer.offerName}（{offer.groupLabel} ×{" "}
                                {offer.count}）
                              </p>
                              <p className="mt-0.5 text-[0.6875rem] text-purple-900 leading-snug">
                                {offer.conditions.length > 0
                                  ? offer.conditions.join(" / ")
                                  : "公式の適用条件を確認してください。"}
                              </p>
                              <SourceLinks
                                numbers={extraSourcesOf(
                                  offer.sourceNumbers,
                                  index,
                                )}
                                references={plan.references}
                                className="mt-1"
                              />
                            </div>
                            <p className="flex-shrink-0 text-[0.6875rem] font-bold text-purple-900 font-mono">
                              {yen(offer.subtotal)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })}

          {usesMultiDay && plan.multiDay && (
            <div
              className="rounded-lg border border-orange-200 bg-white px-3 py-2.5"
              style={{ order: orderOfDate(plan.multiDay.dates[0]) }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-base font-bold text-gray-900">
                  {dateLabelOfDates(plan.multiDay.dates)}
                </p>
                <p className="flex-shrink-0 text-base font-bold text-gray-900 font-mono">
                  {yen(plan.multiDay.ticketTotal)}
                </p>
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                <TicketLines
                  lines={plan.multiDay.lines}
                  multiplier={plan.multiDay.ticketCount}
                  multiplierUnit="枚"
                  showAmounts={
                    plan.multiDay.lines.length > 1 ||
                    plan.multiDay.addOns.length > 0
                  }
                />
                {/* 足りない時間を足す追加券（トップアップ5時間など） */}
                {plan.multiDay.addOns.map(addOn => (
                  <TicketLines
                    key={`${addOn.productId}:${addOn.date}`}
                    lines={addOn.lines}
                    multiplier={addOn.ticketCount}
                    multiplierUnit="枚"
                    showAmounts
                  />
                ))}
                <SourceLinks
                  numbers={plan.multiDay.sourceNumbers.filter(
                    number => !sources.common.includes(number),
                  )}
                  references={plan.references}
                />
              </div>
            </div>
          )}
        </div>

        {/* オンライン購入の案内・出典は、日ごとに繰り返さず最後に1回だけ出す */}
        <div className="mt-3 flex flex-col gap-2">
          <PurchaseSummary lines={shownLines} total={plan.total} />
          <SourceLinks numbers={sources.common} references={plan.references} />
        </div>
      </div>
    </div>
  );
};
