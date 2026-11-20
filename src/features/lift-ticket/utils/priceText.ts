import { formatVisitDates } from "@/features/home/utils/formatVisitDates";
import type { LiftTicketSearchInput } from "../types";
import { TICKET_PARTY_CATEGORY_LABELS } from "./calculateLiftTicket";
import type { ResortPriceSummary } from "./resortPriceCalculation";

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

/**
 * 一覧の料金欄の名前。条件が「大人1人・1日券・レンタルなし」のあいだは「大人1日料金」、
 * 人数・滑る長さ・日数・レンタルを変えたら「合計料金」と出す。
 * 何の金額かを、注記ではなく欄の名前で伝える。
 */
export const priceColumnLabel = (input: LiftTicketSearchInput) => {
  const groups = input.party.filter(group => group.count > 0);
  const [group] = groups;
  const days = input.days ?? [];
  const [day] = days;
  const isFullDay = day
    ? day.duration.kind === "day" && !day.duration.withNight
    : input.usePreference === "full_day";
  return groups.length === 1 &&
    group?.category === "adult" &&
    group.count === 1 &&
    (group.rental?.items.length ?? 0) === 0 &&
    days.length <= 1 &&
    isFullDay
    ? "大人1日料金"
    : "合計料金";
};
