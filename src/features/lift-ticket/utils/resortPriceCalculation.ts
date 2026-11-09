import type {
  LiftTicketData,
  LiftTicketSearchInput,
  TicketCalculationResult,
} from "../types";
import {
  calculateLiftTicketForSeasons,
  calculateLiftTicketPlan,
  selectLiftTicketSeason,
} from "./calculateLiftTicket";
import { calculateRentalPlan, type TicketRentalResult } from "./rental";
import { calculateRentalBundle, type TicketBundleResult } from "./rentalBundle";

export type ResortPriceCalculation = {
  ticket: TicketCalculationResult | null;
  rental: TicketRentalResult | null;
  bundle: TicketBundleResult | null;
};

/** 1スキー場分のリフト券・レンタル・セット券を計算する（サーバー／クライアント共用）。 */
export const calculateResortPrice = (
  seasons: LiftTicketData[],
  input: LiftTicketSearchInput,
): ResortPriceCalculation => {
  try {
    const season =
      selectLiftTicketSeason(seasons, input.visitDate) ?? seasons[0];
    const rental = season ? calculateRentalPlan(season, input) : null;
    return {
      ticket: calculateLiftTicketForSeasons(seasons, input),
      rental,
      // セット券（リフト券＋レンタル）が別々に買うより安ければ、その合計を使う
      bundle:
        season && rental && rental.status !== "none" && input.days?.length
          ? calculateRentalBundle(
              season,
              input,
              calculateLiftTicketPlan(season, input),
              rental,
            )
          : null,
    };
  } catch {
    return { ticket: null, rental: null, bundle: null };
  }
};
