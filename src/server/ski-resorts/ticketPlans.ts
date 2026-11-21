// 公開施設の詳細・比較に必要な料金プランを正本から計算する．
import "server-only";

import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import {
  calculateTicketPlanDisplay,
  type TicketPlanDisplay,
} from "@/features/lift-ticket/utils/resortPriceCalculation";
import { ticketCategoriesOf } from "@/features/lift-ticket/utils/ticketCategories";
import { getLiftTicketDataMap } from "@/lib/resortDecisionData";
import { readPublicResortAccess } from "./publicAccess";

type Target = { resortId: string; categoryKey?: string };

/** 施設と券種だけを受け，クライアントから料金文書を受け取らない． */
export async function readResortTicketPlans(
  targets: readonly Target[],
  input: LiftTicketSearchInput,
): Promise<TicketPlanDisplay[]> {
  const { sourceIdsByResort } = await readPublicResortAccess();
  const ids = new Set<string>();
  for (const { resortId } of targets) {
    const sources = sourceIdsByResort.get(resortId);
    if (!sources) continue;
    ids.add(resortId);
    if (sources[0]) ids.add(sources[0]);
  }
  const byId = await getLiftTicketDataMap([...ids]);
  return targets.map(({ resortId, categoryKey }) => {
    const sources = sourceIdsByResort.get(resortId);
    if (!sources) return null;
    const ownSeasons = byId.get(resortId) ?? [];
    const seasons = ownSeasons.length
      ? ownSeasons
      : (byId.get(sources[0]) ?? []);
    if (!categoryKey) return calculateTicketPlanDisplay(seasons, input, false);
    const category = ticketCategoriesOf([
      { resortId, nameJa: resortId, shortName: null, seasons },
    ]).find(item => item.key === categoryKey);
    return category
      ? calculateTicketPlanDisplay(category.seasons, input, true)
      : null;
  });
}
