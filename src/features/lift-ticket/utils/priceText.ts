import { formatVisitDates } from "@/features/home/utils/formatVisitDates";
import type { LiftTicketSearchInput, TicketCalculationResult } from "../types";
import { TICKET_PARTY_CATEGORY_LABELS } from "./calculateLiftTicket";
import type { TicketRentalResult } from "./rental";
import type { TicketBundleResult } from "./rentalBundle";

export const dateLabel = (input: LiftTicketSearchInput) => {
  const dates = (
    input.days?.length ? input.days : [{ date: input.visitDate }]
  ).map(day => day.date);
  return formatVisitDates(dates);
};

export const conditionsLabel = (input: LiftTicketSearchInput) => {
  const party = input.party
    .filter(group => group.count > 0)
    .map(
      group =>
        `${TICKET_PARTY_CATEGORY_LABELS[group.category]}${group.count}名`,
    )
    .join("・");
  const hasRental = input.party.some(
    group => (group.rental?.items.length ?? 0) > 0,
  );
  return [dateLabel(input), party, hasRental ? "レンタルあり" : null]
    .filter(Boolean)
    .join("　");
};

export const priceText = (
  ticket: TicketCalculationResult | null | undefined,
  rental: TicketRentalResult | null | undefined,
  bundle: TicketBundleResult | null | undefined,
) => {
  if (!ticket) return "不明";
  if (["unavailable", "outside_season", "closed"].includes(ticket.status)) {
    return ticket.status === "outside_season" ? "営業期間外" : "不明";
  }
  // セット券の合計が出たときは、レンタルを借りる全員の料金が出ている
  const bundleApplied =
    bundle != null && bundle.lines.length > 0 && bundle.total != null;
  // 選んだ用具のレンタル情報が無いスキー場は、詳細の「¥3,900 ＋ゴーグル」を
  // 一覧の幅に収まるよう「¥3,900＋α」と縮めて出す（「〜」は一部不明のとき）
  const rentalMissing =
    (rental?.missingLabels.length ?? 0) > 0 ||
    (rental?.status === "not_collected" && !bundleApplied);
  const suffix = (uncertain: boolean) =>
    rentalMissing ? "＋α" : uncertain ? "〜" : "";
  // セット券（リフト券＋レンタル）のほうが安いときは、その合計を使う
  if (bundleApplied) {
    return `¥${bundle.total?.toLocaleString("ja-JP")}${suffix(false)}`;
  }
  const ticketAmount = ticket.ticketTotal ?? ticket.knownTicketTotal;
  const rentalAmount = rental?.total ?? rental?.knownTotal ?? 0;
  const uncertain =
    ticket.status === "partial" ||
    (rental != null &&
      rental.status !== "none" &&
      rental.status !== "complete" &&
      rental.status !== "not_collected");
  if (uncertain && ticketAmount + rentalAmount === 0) {
    return "料金一部不明";
  }
  return `¥${(ticketAmount + rentalAmount).toLocaleString("ja-JP")}${suffix(
    uncertain,
  )}`;
};
