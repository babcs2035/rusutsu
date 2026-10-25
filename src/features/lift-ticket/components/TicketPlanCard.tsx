"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PriceReference, TicketCalculationLine } from "../types";
import type { TicketPlanResult } from "../utils/calculateLiftTicket";
import type { TicketRentalResult } from "../utils/rental";
import {
  planWithoutBundledGroups,
  type TicketBundleResult,
} from "../utils/rentalBundle";
import { BundleSummary } from "./BundleSummary";
import { ConditionalOffers } from "./ConditionalOffers";
import { RentalSummary } from "./RentalSummary";
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
  references,
}: {
  lines: TicketCalculationLine[];
  multiplier: number;
  multiplierUnit: "枚" | "日";
  /** 枠の中に券が複数種類あるときは、1人でも行ごとの金額を出す */
  showAmounts?: boolean;
  /** 券の料金の根拠。各行の下に1つずつ出す */
  references: PriceReference[];
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
          sources={
            <SourceLinks
              numbers={line.sourceNumbers}
              references={references}
              quotes={line.sourceQuotes}
              single
              className="mt-0.5"
            />
          }
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

const shortDateOf = (date: string) =>
  `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${weekdayOf(date)}）`;

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
export const TicketPlanCard = ({
  plan: fullPlan,
  rental: fullRental = null,
  bundle = null,
}: {
  plan: TicketPlanResult;
  /** レンタルを選んだ人がいれば、リフト券の合計に足して内訳を出す */
  rental?: TicketRentalResult | null;
  /** リフト券とレンタルのセット券。別々に買うより安いときだけ使う */
  bundle?: TicketBundleResult | null;
}) => {
  // セット券を使う人は、リフト券もレンタルもセット券の枠に移す
  const bundleApplied =
    bundle != null && bundle.lines.length > 0 ? bundle : null;
  const plan = bundleApplied
    ? planWithoutBundledGroups(fullPlan, bundleApplied)
    : fullPlan;
  const bundledIds = new Set(bundleApplied?.lines.map(line => line.groupId));
  const rental: TicketRentalResult | null =
    bundleApplied && fullRental
      ? fullRental.status === "not_collected"
        ? bundleApplied.unbundledRenterGroupIds.length > 0
          ? fullRental
          : null
        : (() => {
            const lines = fullRental.lines.filter(
              line => !bundledIds.has(line.groupId),
            );
            const complete = lines.every(line => line.subtotal != null);
            const knownTotal = lines.reduce(
              (sum, line) => sum + (line.subtotal ?? 0),
              0,
            );
            return lines.length === 0
              ? null
              : {
                  ...fullRental,
                  lines,
                  knownTotal,
                  total: complete ? knownTotal : null,
                };
          })()
      : fullRental;
  const tripDayCount = fullPlan.days.length;
  const usesMultiDay = plan.multiDay != null;
  const rentalShown =
    rental != null &&
    (rental.status === "complete" || rental.status === "partial");
  // リフト券もレンタルも出たときだけ合計を出す。どちらかが未確定なら合計も未確定
  const separateTotal = !rentalShown
    ? plan.total
    : plan.total == null || rental.total == null
      ? null
      : plan.total + rental.total;
  const total = bundleApplied ? bundleApplied.total : separateTotal;
  const withRental = rentalShown || bundleApplied != null;
  const references = bundle
    ? [
        ...plan.references,
        ...bundle.references.filter(
          reference =>
            !plan.references.some(other => other.number === reference.number),
        ),
      ]
    : plan.references;

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
    const short = shortDateOf;
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

  // 画面に出す券の行と、その行を買う回数（日数・枚数）。WEB購入の案内に使う
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
    fullPlan.days.length > 0 &&
    fullPlan.days.every(
      day =>
        day.result.status === "unavailable" &&
        day.result.notes[0] === fullPlan.days[0].result.notes[0],
    )
      ? fullPlan.days[0].result.notes[0]
      : null;

  if (fullPlan.days.length === 0 || blockingNote) {
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
          total == null
            ? "bg-gray-50 border-gray-200"
            : "bg-orange-50 border-orange-300",
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-700">
              {tripDayCount === 1 ? "合計" : `${tripDayCount}日の合計`}
            </p>
            {(withRental ||
              hasOnlineLine(shownLines.map(({ line }) => line))) && (
              <p className="text-xs text-gray-600">
                {[
                  withRental && "リフト券＋レンタル",
                  hasOnlineLine(shownLines.map(({ line }) => line)) &&
                    "WEB購入の料金",
                ]
                  .filter(Boolean)
                  .join("・")}
              </p>
            )}
          </div>
          {total == null ? (
            <p className="text-sm font-semibold text-gray-600">未確定</p>
          ) : (
            <p className="text-2xl font-bold text-gray-900 font-mono">
              {yen(total)}
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
                    references={plan.references}
                  />
                )}

                {!covered && (
                  <ConditionalOffers
                    className="mt-2"
                    dayCount={dayCount}
                    offers={day.result.conditionalOffers}
                    sourcesOf={offer => offer.sourceNumbers}
                    references={plan.references}
                  />
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
                {plan.multiDay.ticketSet ? (
                  <p className="text-sm text-gray-900">
                    {plan.multiDay.productName} × {plan.multiDay.ticketCount}
                    セット
                    <span className="ml-2 whitespace-nowrap text-xs text-gray-600 md:text-sm">
                      {plan.multiDay.ticketSet.ticketsPerSet *
                        plan.multiDay.ticketCount}
                      枚（のべ{plan.multiDay.ticketSet.coveredPersonDays}
                      人日分）
                    </span>
                  </p>
                ) : (
                  <TicketLines
                    lines={plan.multiDay.lines}
                    multiplier={plan.multiDay.ticketCount}
                    multiplierUnit="枚"
                    showAmounts={
                      plan.multiDay.lines.length > 1 ||
                      plan.multiDay.addOns.length > 0
                    }
                    references={plan.references}
                  />
                )}
                {/* 足りない時間を足す追加券（トップアップ5時間など） */}
                {plan.multiDay.addOns.map(addOn => (
                  <TicketLines
                    key={`${addOn.productId}:${addOn.date}`}
                    lines={addOn.lines}
                    multiplier={addOn.ticketCount}
                    multiplierUnit="枚"
                    showAmounts
                    references={plan.references}
                  />
                ))}
                {plan.multiDay.ticketSet && (
                  <SourceLinks
                    numbers={plan.multiDay.sourceNumbers}
                    references={plan.references}
                  />
                )}
              </div>
              <ConditionalOffers
                className="mt-2"
                offers={plan.multiDay.conditionalOffers}
                sourcesOf={offer => offer.sourceNumbers}
                references={plan.references}
              />
            </div>
          )}
        </div>

        {bundleApplied && (
          <div className="mt-2">
            <BundleSummary bundle={bundleApplied} />
          </div>
        )}

        {rental && rental.status !== "none" && (
          <div className="mt-2">
            <RentalSummary rental={rental} dayCount={tripDayCount} />
          </div>
        )}

        {/* 会員・クーポンなど条件を満たせば使えるセット券。合計には含めない */}
        {bundle && bundle.conditionalOffers.length > 0 && (
          <ConditionalOffers
            className="mt-2"
            offers={bundle.conditionalOffers}
            sourcesOf={offer => offer.sourceNumbers}
            references={references}
          />
        )}

        {/* WEB購入の案内は、日ごとに繰り返さず最後に1回だけ出す。出典は各料金の下に出す */}
        <div className="mt-3 flex flex-col gap-2">
          {/* 見出しの合計（レンタル込み）と同じ基準で「窓口で買う場合」を出す */}
          <PurchaseSummary lines={shownLines} total={total} />
        </div>
      </div>
    </div>
  );
};
