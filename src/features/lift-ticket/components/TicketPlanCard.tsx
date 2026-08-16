"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TicketPlanResult } from "../utils/calculateLiftTicket";
import { SourceList, SourceMarks } from "./SourceMarks";

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

const durationLabelOf = (
  duration: TicketPlanResult["days"][number]["plan"]["duration"],
) =>
  duration.kind === "hours"
    ? `${duration.hours}時間`
    : duration.withNight
      ? "1日（ナイター込）"
      : "1日（ナイター無）";

const weekdayOf = (date: string) => {
  if (!date) return "";
  const at = new Date(`${date}T12:00:00Z`);
  return ["日", "月", "火", "水", "木", "金", "土"][at.getUTCDay()];
};

/**
 * 日ごとの料金と合計を出す。
 *
 * ★**2日以上滑る場合は「連続2日券」と「1日券×2」を比べて安いほうを出す。**
 * どちらを採用したかが分かるように、採用しなかった側の金額も併記する。
 */
export const TicketPlanCard = ({ plan }: { plan: TicketPlanResult }) => {
  const usesMultiDay = plan.multiDay != null;

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
          <p className="text-xs font-medium text-gray-700">
            {plan.days.length === 1 ? "合計" : `${plan.days.length}日の合計額`}
          </p>
          {plan.total == null ? (
            <p className="text-sm font-semibold text-gray-600">未確定</p>
          ) : (
            <p className="text-2xl font-bold text-gray-900 font-mono">
              {yen(plan.total)}
            </p>
          )}
        </div>

        {plan.multiDay && (
          <p className="mt-1.5 text-xs text-orange-900 leading-relaxed">
            {plan.multiDay.productName}（{plan.multiDay.days}
            日券）を使うほうが安いです。 1日ずつ買うと{" "}
            {yen(plan.multiDay.perDayTotal)}。
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2">
          {plan.days.map((day, index) => {
            const covered =
              usesMultiDay && plan.multiDay?.dates.includes(day.plan.date);
            return (
              <div key={day.plan.id} className="pb-2 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {index + 1}日目
                      {day.plan.date && (
                        <span className="ml-1.5 text-gray-600 font-semibold">
                          {day.plan.date}（{weekdayOf(day.plan.date)}）
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      {durationLabelOf(day.plan.duration)}
                      {day.result.productName
                        ? ` → ${day.result.productName}`
                        : ""}
                    </p>
                    {day.result.status === "closed" && (
                      <p className="mt-0.5 text-xs text-orange-900">
                        この日は営業していません
                        {day.result.notes[0]
                          ? `（${day.result.notes[0]}）`
                          : ""}
                      </p>
                    )}
                    {day.result.status === "outside_season" && (
                      <p className="mt-0.5 text-xs text-orange-900">
                        {day.result.notes[0]}
                      </p>
                    )}
                  </div>
                  <p
                    className={cn(
                      "flex-shrink-0 text-sm font-bold font-mono",
                      covered ? "text-gray-500 line-through" : "text-gray-900",
                    )}
                  >
                    {day.result.payableTotal == null
                      ? "未確定"
                      : yen(day.result.payableTotal)}
                    <SourceMarks
                      numbers={day.result.lines.flatMap(
                        line => line.sourceNumbers,
                      )}
                      references={plan.references}
                    />
                  </p>
                </div>

                {/* 誰がいくらか。日ごとに区分が変わることはないが、
                    どの券が当たったかは日によって変わる */}
                {day.result.lines.length > 0 && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {day.result.lines.map(line => (
                      <div
                        key={line.groupId}
                        className="flex justify-between gap-2"
                      >
                        <p className="text-[0.6875rem] text-gray-600">
                          {line.groupLabel} × {line.count}
                          {line.offerName ? ` ${line.offerName}` : ""}
                          {line.note ? ` ${line.note}` : ""}
                        </p>
                        <p className="flex-shrink-0 text-[0.6875rem] text-gray-700 font-mono">
                          {line.subtotal == null
                            ? "未確定"
                            : yen(line.subtotal)}
                        </p>
                      </div>
                    ))}
                    {day.result.lines.flatMap(line =>
                      (line.warnings ?? []).map(warning => (
                        <p
                          key={`${line.groupId}:${warning}`}
                          className="text-[0.6875rem] text-orange-900 leading-snug"
                        >
                          ※ {warning}
                        </p>
                      )),
                    )}
                    {day.result.lines.some(
                      line => line.standardSubtotal != null,
                    ) && (
                      <p className="text-[0.6875rem] text-gray-500">
                        通常料金:{" "}
                        {day.result.lines
                          .filter(line => line.standardSubtotal != null)
                          .map(
                            line =>
                              `${line.groupLabel} ${yen(line.standardSubtotal ?? 0)}`,
                          )
                          .join("、")}
                      </p>
                    )}
                  </div>
                )}

                {day.result.conditionalOffers.length > 0 && (
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
                            </div>
                            <p className="flex-shrink-0 text-[0.6875rem] font-bold text-purple-900 font-mono">
                              {yen(offer.subtotal)}
                              <SourceMarks
                                numbers={offer.sourceNumbers}
                                references={plan.references}
                              />
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
        </div>

        {usesMultiDay && plan.multiDay && (
          <div className="mt-2 flex justify-between gap-3">
            <p className="text-sm font-bold text-orange-900">
              {plan.multiDay.productName}（
              {plan.multiDay.dates.map(date => date.slice(5)).join("・")}）
            </p>
            <p className="text-sm font-bold text-orange-900 font-mono">
              {yen(plan.multiDay.total)}
            </p>
          </div>
        )}
      </div>

      {plan.references.length > 0 && (
        <SourceList references={plan.references} />
      )}
    </div>
  );
};
