"use server";

import type { ResortOperatingCounts } from "@/features/home/utils/operatingCounts";
import type {
  LiftTicketSearchInput,
  TicketCalculationResult,
} from "@/features/lift-ticket/types";
import { calculateLiftTicketForSeasons } from "@/features/lift-ticket/utils/calculateLiftTicket";
import type { TicketRentalResult } from "@/features/lift-ticket/utils/rental";
import type { TicketBundleResult } from "@/features/lift-ticket/utils/rentalBundle";
import { calculateResortPrice } from "@/features/lift-ticket/utils/resortPriceCalculation";
import { getFinalizedResortMapData } from "@/lib/finalizedResortGeojson";
import { requireAdmin } from "@/lib/requireAdmin";
import { getResortLabelName } from "@/lib/resortAliases";
import { getLiftTicketDataMap } from "@/lib/resortDecisionData";
import { readDisplayGroupsForResort } from "@/lib/resortDisplayGroups";
import { getResortReadingInfo } from "@/lib/resortReadings";
import {
  readSkiResorts,
  readSkiResortsForMap,
  readSkiResortWeather,
  readYukiMagiList,
} from "@/lib/skiResortData";
import { readOperatingSummaries } from "@/server/course-lift/summaryClient";
import { listLiftTicketSeasons } from "@/server/lift-tickets/client";
import {
  readResortMapDataByIds,
  readSkiResortDetails,
} from "@/server/ski-resorts/detail";
import { combineResortMaps } from "@/server/ski-resorts/displayGroupMap";
import type { SkiResortWithRelations } from "@/types";

// スキーリゾート一覧を取得（リレーション込み）
export async function getSkiResorts(): Promise<SkiResortWithRelations[]> {
  return readSkiResorts();
}

// スキーリゾート一覧を地図表示用に軽量取得
// 料金データ本体は送らず、どのスキー場の料金データを使うかだけを持たせる。
// 料金は日付を入れたときに calculateLiftTicketsForList でサーバー計算する。
export async function getSkiResortsForMap() {
  const [resorts, liftTicketSeasons, operatingSummaries] = await Promise.all([
    readSkiResortsForMap(),
    // 料金は付加情報なので、取得できなくても地図と一覧は表示する。
    listLiftTicketSeasons().catch(error => {
      console.warn("リフト券料金の一覧を取得できませんでした:", error);
      return [];
    }),
    readOperatingSummaries().catch(
      (error): Record<string, ResortOperatingCounts> => {
        console.warn("コース・リフトの集計を取得できませんでした:", error);
        return {};
      },
    ),
  ]);
  const resortIdsWithTickets = new Set(
    liftTicketSeasons.map(season => season.resortId),
  );
  const liftTicketResortIdOf = (resort: (typeof resorts)[number]) => {
    // 完全統合で結合先の料金がなければ、引き継ぎ元の料金を使う。
    const candidates = [resort.id, resort.sourceResortIds?.[0]];
    return (
      candidates.find(
        (id): id is string => Boolean(id) && resortIdsWithTickets.has(id ?? ""),
      ) ?? null
    );
  };

  return resorts.map(resort => ({
    ...resort,
    ...getResortReadingInfo(resort),
    liftTicketResortId: liftTicketResortIdOf(resort),
    operatingCounts: operatingSummaries[resort.id] ?? {
      hasMap: false,
      courses:
        resort.numberOfCourses > 0
          ? { active: null, total: resort.numberOfCourses }
          : null,
      lifts:
        resort.numberOfLifts > 0
          ? { active: null, total: resort.numberOfLifts }
          : null,
    },
  }));
}

const RESORT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_LIST_CALCULATION_RESORTS = 500;

// 一覧の各スキー場について、同じ日程・メンバーでの料金を計算して結果だけ返す。
export async function calculateLiftTicketsForList(
  resortIds: string[],
  input: LiftTicketSearchInput,
): Promise<Record<string, TicketCalculationResult | null>> {
  if (
    !Array.isArray(resortIds) ||
    resortIds.length > MAX_LIST_CALCULATION_RESORTS ||
    !resortIds.every(
      id => typeof id === "string" && RESORT_ID_PATTERN.test(id),
    ) ||
    typeof input?.visitDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(input.visitDate) ||
    !Array.isArray(input.party) ||
    input.party.length > 50 ||
    (input.days !== undefined &&
      (!Array.isArray(input.days) || input.days.length > 31))
  ) {
    throw new Error("料金計算の条件が不正です。");
  }
  const uniqueIds = [...new Set(resortIds)];
  const seasonsByResortId = await getLiftTicketDataMap(uniqueIds);
  const results: Record<string, TicketCalculationResult | null> = {};
  for (const id of uniqueIds) {
    try {
      results[id] = calculateLiftTicketForSeasons(
        seasonsByResortId.get(id) ?? [],
        input,
      );
    } catch {
      results[id] = null;
    }
  }
  return results;
}

/** 一覧用にリフト券と、利用者が選んだレンタル用具の料金を計算する。 */
export async function calculateLiftTicketAndRentalForList(
  resortIds: string[],
  input: LiftTicketSearchInput,
): Promise<
  Record<
    string,
    {
      ticket: TicketCalculationResult | null;
      rental: TicketRentalResult | null;
      bundle: TicketBundleResult | null;
    }
  >
> {
  if (
    !Array.isArray(resortIds) ||
    resortIds.length > MAX_LIST_CALCULATION_RESORTS ||
    !resortIds.every(
      id => typeof id === "string" && RESORT_ID_PATTERN.test(id),
    ) ||
    typeof input?.visitDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(input.visitDate) ||
    !Array.isArray(input.party) ||
    input.party.length > 50 ||
    (input.days !== undefined &&
      (!Array.isArray(input.days) || input.days.length > 31))
  ) {
    throw new Error("料金計算の条件が不正です。");
  }
  const uniqueIds = [...new Set(resortIds)];
  const seasonsByResortId = await getLiftTicketDataMap(uniqueIds);
  const results: Record<
    string,
    {
      ticket: TicketCalculationResult | null;
      rental: TicketRentalResult | null;
      bundle: TicketBundleResult | null;
    }
  > = {};
  for (const id of uniqueIds) {
    results[id] = calculateResortPrice(seasonsByResortId.get(id) ?? [], input);
  }
  return results;
}

/** 一覧表示用の営業状況を集計し、地図の座標を含めずに返す。 */
export async function getResortOperatingCountsForList(
  resorts: Array<{
    id: string;
    candidates: string[];
    fallbackCourses: number;
    fallbackLifts: number;
  }>,
): Promise<Record<string, ResortOperatingCounts>> {
  if (
    !Array.isArray(resorts) ||
    resorts.length > MAX_LIST_CALCULATION_RESORTS ||
    !resorts.every(
      resort =>
        typeof resort?.id === "string" &&
        RESORT_ID_PATTERN.test(resort.id) &&
        Array.isArray(resort.candidates) &&
        resort.candidates.length <= 10 &&
        resort.candidates.every(
          id => typeof id === "string" && RESORT_ID_PATTERN.test(id),
        ) &&
        Number.isInteger(resort.fallbackCourses) &&
        resort.fallbackCourses >= 0 &&
        Number.isInteger(resort.fallbackLifts) &&
        resort.fallbackLifts >= 0,
    )
  ) {
    throw new Error("営業状況の条件が不正です。");
  }

  const summaries = await readOperatingSummaries();
  return Object.fromEntries(
    resorts.map(resort => [
      resort.id,
      summaries[resort.id] ?? {
        hasMap: false,
        courses:
          resort.fallbackCourses > 0
            ? { active: null, total: resort.fallbackCourses }
            : null,
        lifts:
          resort.fallbackLifts > 0
            ? { active: null, total: resort.fallbackLifts }
            : null,
      },
    ]),
  );
}

// スキーリゾート詳細を取得
export async function getSkiResortById(id: string) {
  const [detail] = await readSkiResortDetails([id], { withMap: true });
  return detail ?? null;
}

// 比較用の読み取りは数件ずつに限る。一度に大量のデータを取れる入口にしないため。
const MAX_COMPARE_DETAIL_IDS = 8;
const MAX_COMPARE_MAP_IDS = 4;

/** 比較で使う詳細を、地図（コース・リフトの形）抜きでまとめて返す */
export async function getSkiResortsForCompare(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > MAX_COMPARE_DETAIL_IDS)
    throw new Error("Invalid ids");
  return readSkiResortDetails(unique, { withMap: false });
}

/** 比較のゲレンデ表示に使う地図データ（コース・リフトの形と営業状況） */
export async function getResortMapDataForCompare(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > MAX_COMPARE_MAP_IDS)
    throw new Error("Invalid ids");
  return readResortMapDataByIds(unique);
}

/**
 * 同時表示の組の地図と、相手のスキー場の詳細。チェックを入れたときに読む。
 * 地図は自分を含む全スキー場分をまとめる。相手の詳細は SNS・料金・天気・投稿で
 * 使うので、重い地図は外して返す。
 */
export async function getSimultaneousView(resortId: string, groupId: string) {
  const group = (await readDisplayGroupsForResort(resortId)).find(
    item => item.id === groupId,
  );
  if (!group) return null;
  const members = await Promise.all(
    group.members.map(async member =>
      member.id === resortId
        ? { id: member.id, mapData: await getFinalizedResortMapData(member.id) }
        : { id: member.id, detail: await getSkiResortById(member.id) },
    ),
  );
  const partners = members.flatMap(member => {
    if (!member.detail) return [];
    const { finalizedMapData: _map, ...detail } = member.detail;
    return [detail];
  });
  return {
    communityResorts: members.map(member => {
      const map = member.detail?.finalizedMapData ?? member.mapData;
      return {
        id: member.id,
        name: (() => {
          const item = group.members.find(item => item.id === member.id);
          return (
            item?.label ??
            getResortLabelName(
              member.id,
              item?.nameJa ?? member.id,
              item?.shortName,
            )
          );
        })(),
        courseIds: [
          ...new Set(
            (map?.courses?.features ?? []).map(feature => feature.groupId),
          ),
        ],
        liftIds: (map?.lifts?.features ?? []).map(feature => feature.id),
      };
    }),
    mapData: combineResortMaps(
      members.map(member =>
        member.detail
          ? member.detail.finalizedMapData
          : (member.mapData ?? null),
      ),
    ),
    conditions: partners.flatMap(partner =>
      (partner.currentConditions ?? []).filter(item => item.id === partner.id),
    ),
    partners,
  };
}

// 旧形式の天気JSONは管理用の読取に限定する。
// 公開画面で必要になった場合は、表示項目を絞る専用projectionを追加する。
export async function getSkiResortWeather(id: string) {
  await requireAdmin();
  return readSkiResortWeather(id);
}

// 雪マジ一覧を取得
export async function getYukiMagiList() {
  return readYukiMagiList();
}
