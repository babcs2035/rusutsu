import type { Metadata } from "next";
import { EvChargersAdminClient } from "@/features/ev-chargers/EvChargersAdminClient";
import { getResortSearchName } from "@/lib/resortAliases";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import { requireEditingPage } from "@/server/edit-requests/authPages";
import { readEvChargerCandidates } from "@/server/ev-chargers/candidates";
import { isMergedSource } from "@/server/ski-resorts/adminContract";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "EV充電 | 管理画面" };

export default async function EvChargersAdminPage() {
  await requireEditingPage();
  const [resorts, candidates] = await Promise.all([
    readAdminSkiResorts(),
    readEvChargerCandidates(),
  ]);
  return (
    <EvChargersAdminClient
      resorts={resorts
        .filter(resort => !isMergedSource(resort))
        .map(resort => ({
          id: resort.id,
          name: resort.nameJa,
          prefecture: resort.prefecture,
          isActive: resort.isActive,
          searchName: getResortSearchName(
            resort.id,
            resort.nameJa,
            resort.shortName,
          ),
          updatedAt: resort.updatedAt,
          evChargers: resort.evChargers ?? null,
          // 結合先は結合元の候補もまとめて出す
          candidates: [resort.id, ...resort.sourceResortIds].flatMap(
            id => candidates?.resorts[id] ?? [],
          ),
        }))}
      candidateInfo={
        candidates
          ? { surveyDate: candidates.surveyDate, radiusM: candidates.radiusM }
          : null
      }
    />
  );
}
