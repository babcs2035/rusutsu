"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { TicketCalculationResult } from "../types";
import { ConditionalOffers } from "./ConditionalOffers";
import { SourceLinks } from "./SourceLinks";
import { PurchaseSummary, TicketLineDetail } from "./TicketLineDetail";

export const TicketCalculationCard = ({
  result,
  compact = false,
}: {
  result: TicketCalculationResult | null;
  compact?: boolean;
}) => {
  if (!result) {
    return (
      <Alert variant="default" className="border-dashed bg-gray-50 text-center">
        <AlertTitle className="text-sm font-semibold text-gray-500">
          このスキー場には詳細料金データがありません。
        </AlertTitle>
      </Alert>
    );
  }

  if (
    result.status === "unavailable" ||
    result.status === "outside_season" ||
    result.status === "closed"
  ) {
    // ★営業していない日に料金を出さない。定休日・期間外は理由を注意色で出す
    const isAlert =
      result.status === "outside_season" || result.status === "closed";
    return (
      <Alert
        variant={isAlert ? "destructive" : "default"}
        className={cn(
          "rounded-xl",
          isAlert
            ? "bg-orange-50 border-orange-300"
            : "bg-gray-50 border-gray-200",
        )}
      >
        <AlertTitle
          className={cn(
            "text-sm font-bold",
            isAlert ? "text-orange-900" : "text-gray-600",
          )}
        >
          {result.status === "closed"
            ? "この日は営業していません"
            : result.notes[0]}
        </AlertTitle>
        <AlertDescription>
          {result.status === "closed" && result.notes[0] && (
            <p className="mt-1 text-xs text-gray-700 leading-relaxed">
              {result.notes[0]}
            </p>
          )}
          {result.status === "outside_season" && (
            <p className="mt-1 text-xs text-gray-600">
              収録シーズン: {result.seasonLabel}
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const displayedTotal =
    result.ticketTotal == null ? result.knownTicketTotal : result.ticketTotal;
  // 料金行の出典は内訳の上に1回だけ出し、条件付き割引には追加分だけ出す
  const lineSources = [
    ...new Set(result.lines.flatMap(line => line.sourceNumbers)),
  ].sort((left, right) => left - right);

  return (
    <Alert
      // 背景・ボーダー・タイトル色は className で明示指定しているため，
      // destructive バリアントの Description 向け赤文字（*:data-[slot=alert-description]:text-destructive/90，
      // 具体度 (0,2,0) で注記の text-gray-600 を上書きする）を避けるため default を固定する．
      variant="default"
      className={cn(
        "rounded-xl",
        result.status === "complete"
          ? "bg-blue-50 border-blue-200"
          : "bg-orange-50 border-orange-300",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "mt-1 font-bold leading-none",
              compact ? "text-lg" : "text-2xl",
              "text-gray-900",
            )}
          >
            ¥{displayedTotal.toLocaleString("ja-JP")}
            {result.status === "partial" && (
              <span className="ml-1 text-xs text-orange-900">＋未確定</span>
            )}
          </p>
        </div>
      </div>

      {!compact && (
        <div className="mt-4 flex flex-col gap-2">
          {result.lines.map(line => (
            <div key={line.groupId} className="pb-2 border-b border-gray-100">
              <TicketLineDetail
                line={line}
                sources={
                  <SourceLinks
                    numbers={line.sourceNumbers}
                    references={result.references}
                    quotes={line.sourceQuotes}
                    single
                    className="mt-0.5"
                  />
                }
              />
            </div>
          ))}
          <PurchaseSummary
            lines={result.lines.map(line => ({ line, multiplier: 1 }))}
            total={result.ticketTotal}
          />
        </div>
      )}

      {!compact && (
        <ConditionalOffers
          offers={result.conditionalOffers}
          sourcesOf={offer =>
            offer.sourceNumbers.filter(number => !lineSources.includes(number))
          }
          references={result.references}
          className="mt-3"
        />
      )}
      {result.notes.length > 0 && !compact && (
        <AlertDescription className="mt-3 text-xs text-gray-600 leading-relaxed">
          {result.notes.join(" / ")}
        </AlertDescription>
      )}
    </Alert>
  );
};
