import { formatVisitDates } from "@/shared/utils/formatVisitDates";
import {
  type LiftTicketPrice,
  type LiftTicketSearchInput,
  priceModeOf,
} from "../types";
import type { ResortPriceSummary } from "./resortPriceCalculation";
import { TICKET_PARTY_CATEGORY_LABELS } from "./ticketAudience";

/** 単体の券の価格を表示する．未確定の料金を無料として扱わない． */
export const formatLiftTicketPrice = (price: LiftTicketPrice | undefined) => {
  const mode = priceModeOf(price);
  if (mode === "free") return "無料";
  if (["fixed", "derived_discount"].includes(mode) && price?.amount != null) {
    return `¥${price.amount.toLocaleString("ja-JP")}`;
  }
  if (mode === "range" && price?.range) {
    const minimum =
      price.range.min == null
        ? ""
        : `¥${price.range.min.toLocaleString("ja-JP")}`;
    const maximum =
      price.range.max == null
        ? ""
        : `¥${price.range.max.toLocaleString("ja-JP")}`;
    return `${minimum}〜${maximum}`;
  }
  if (mode === "live_dynamic") return "変動料金";
  return "要確認";
};

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

/**
 * 一覧・比較に出す料金。詳細の料金タブの一番安い段階の見出し金額と同じ値を出す。
 * 選んだ用具のレンタル情報が無いときは、詳細の「¥3,900 ＋ゴーグル」を
 * 狭い欄に収まるよう「¥3,900＋α」と縮める
 */
export const priceText = (
  summary: ResortPriceSummary | null | undefined,
  /** 一覧の狭い欄では「営業期間外」を「期間外」、「料金一部不明」を「一部不明」と縮める */
  { compact = false }: { compact?: boolean } = {},
) => {
  switch (summary?.kind) {
    case "price":
      return `¥${summary.total.toLocaleString("ja-JP")}${
        summary.rentalMissing ? "＋α" : ""
      }`;
    case "partial":
      return compact ? "一部不明" : "料金一部不明";
    case "outside_season":
      return compact ? "期間外" : "営業期間外";
    default:
      return "不明";
  }
};
