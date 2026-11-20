import type { LiftTicketData, LiftTicketSearchInput } from "../types";
import { calculateLiftTicketPlan } from "./calculateLiftTicket";
import {
  buildPlanTiers,
  type TicketPlanTier,
  type TicketPlanTierInput,
} from "./planView";
import {
  dataForPurchaseTier,
  firstVisitDateOf,
  purchaseTierKeysOf,
} from "./purchaseTiers";
import { calculateRentalPlan } from "./rental";
import { calculateRentalBundle } from "./rentalBundle";
import { selectLiftTicketSeason } from "./ticketCalendar";

export type ResortPriceTiers = {
  data: LiftTicketData;
  /** 買い方（早割・Web・通常）ごとの計算結果 */
  tierInputs: TicketPlanTierInput[];
  /** 画面に出す段階。安い順で、先頭が一番安い買い方 */
  tiers: TicketPlanTier[];
};

/**
 * ★**料金計算の唯一の入口。** 詳細の料金タブ・一覧・比較はすべてこれを使い、
 * 同じ条件なら同じ金額を出す（画面ごとに別の計算を書かない）。
 *
 * 買い方（早割・Web・通常）ごとに、日ごとの計画（2日以上なら複数日券と
 * 1日券×日数の比較）・レンタル・セット券を計算し、安い順の段階にまとめる。
 */
export const calculateResortPriceTiers = (
  seasons: LiftTicketData[],
  input: LiftTicketSearchInput,
): ResortPriceTiers | null => {
  const data =
    selectLiftTicketSeason(seasons, input.visitDate) ?? seasons[0] ?? null;
  if (!data) return null;
  const visitDate = firstVisitDateOf(input);
  const tierInputs = purchaseTierKeysOf(data, visitDate).map(key => {
    const tierData = dataForPurchaseTier(data, key, visitDate);
    const plan = calculateLiftTicketPlan(tierData, input);
    // 選べる用具は検索画面と同じ。借りられない物は「＋ゴーグル」と添えて知らせる
    const rental = calculateRentalPlan(tierData, input);
    // リフト券とレンタルのセット券が、別々に買うより安ければ使う
    const bundle = calculateRentalBundle(tierData, input, plan, rental);
    return { key, plan, rental, bundle };
  });
  return { data, tierInputs, tiers: buildPlanTiers(data, tierInputs) };
};

/** 一覧・比較に出す1行の料金。詳細の一番安い段階の見出し金額と同じもの */
export type ResortPriceSummary =
  | { kind: "price"; total: number; rentalMissing: boolean }
  /** 料金はあるが合計が決まらない（年齢の未入力・一部の日の料金が無いなど） */
  | { kind: "partial" }
  | { kind: "outside_season" }
  | { kind: "unknown" };

export const summarizeResortPrice = (
  seasons: LiftTicketData[],
  input: LiftTicketSearchInput,
): ResortPriceSummary => {
  try {
    const calculated = calculateResortPriceTiers(seasons, input);
    const view = calculated?.tiers[0]?.view;
    if (!view || view.fullPlan.days.length === 0) return { kind: "unknown" };
    if (view.total != null) {
      return {
        kind: "price",
        total: view.total,
        rentalMissing: view.missingRentalLabels.length > 0,
      };
    }
    const statuses = view.fullPlan.days.map(day => day.result.status);
    if (statuses.every(status => status === "outside_season")) {
      return { kind: "outside_season" };
    }
    if (
      statuses.every(status =>
        ["unavailable", "outside_season", "closed"].includes(status),
      )
    ) {
      return { kind: "unknown" };
    }
    return { kind: "partial" };
  } catch (error) {
    // 業務上の欠測（unknown）と区別して計算バグを検知できるようにログへ出す。
    // 表示は欠測のまま維持し、一覧・詳細の挙動を変えない。
    console.error(
      "summarizeResortPrice: unexpected calculation error, treating as unknown",
      { name: error instanceof Error ? error.name : "UnknownError" },
    );
    return { kind: "unknown" };
  }
};
