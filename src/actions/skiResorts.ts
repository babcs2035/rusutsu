"use server";

import { readResortLinksMap } from "@/features/lift/server/liftFiles";
import type {
  LiftTicketSearchInput,
  TicketCalculationResult,
} from "@/features/lift-ticket/types";
import { calculateLiftTicketForSeasons } from "@/features/lift-ticket/utils/calculateLiftTicket";
import { collectSocialAccounts } from "@/features/resort-detail/utils/socialAccounts";
import { collectTrailMapLinks } from "@/features/resort-detail/utils/trailMapLinks";
import { readCurrentResortConditions } from "@/lib/crawlLatestCurrent";
import { getFinalizedResortMapData } from "@/lib/finalizedResortGeojson";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
  FinalizedResortMapData,
} from "@/lib/finalizedResortGeojsonShared";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getLiftTicketDataMap,
  getResortDecisionData,
} from "@/lib/resortDecisionData";
import { getResortReadingInfo } from "@/lib/resortReadings";
import {
  readSkiResortById,
  readSkiResorts,
  readSkiResortsForMap,
  readSkiResortWeather,
  readYukiMagiList,
} from "@/lib/skiResortData";
import SkiResortWeatherIds from "@/private/data/SkiResortWeatherIds.json";
import { listLiftTicketSeasons } from "@/server/lift-tickets/client";
import type { SkiResortWithRelations } from "@/types";

type TenkiJpWeatherId = {
  tenkijpId: string;
  tenkijpName?: string | null;
  displayName?: string | null;
};

type SnowForecastWeatherId = {
  snowForecastId: string;
  snowForecastName?: string | null;
  displayName?: string | null;
};

type SkiResortWeatherIdsEntry = {
  skiResortId?: string;
  tenkijp?: TenkiJpWeatherId[];
  weathernewsSpotId?: string | null;
  snowForecast?: SnowForecastWeatherId[];
  SnowForecastId?: string | null;
  SnowForecastName?: string | null;
};

type OperationCountSummary = {
  total: number;
  open: number;
  partial: number;
  hasPartial: boolean;
};

type FinalizedOperationSummary = {
  courses: OperationCountSummary | null;
  lifts: OperationCountSummary | null;
};

const getOperationSymbol = (status: string | null | undefined) => {
  if (!status) return null;
  if (/[○〇◯]/u.test(status)) return "open";
  if (/[△]/u.test(status)) return "partial";
  return null;
};

const isCountableCourseName = (name: string) =>
  !name.startsWith("無名") && !name.includes("_");

const createOperationCountSummary = (
  statuses: Array<string | null | undefined>,
): OperationCountSummary | null => {
  if (statuses.length === 0) return null;

  const operationSymbols = statuses.map(getOperationSymbol);
  if (operationSymbols.every(symbol => symbol === null)) return null;

  const open = operationSymbols.filter(symbol => symbol === "open");
  const partial = operationSymbols.filter(symbol => symbol === "partial");

  return {
    total: statuses.length,
    open: open.length,
    partial: partial.length,
    hasPartial: partial.length > 0,
  };
};

const createCourseOperationSummary = (
  courses: FinalizedCourseFeature[],
): OperationCountSummary | null =>
  createOperationCountSummary(
    courses
      .filter(course => isCountableCourseName(course.name))
      .map(course => course.properties.status),
  );

const createLiftOperationSummary = (
  lifts: FinalizedLiftFeature[],
): OperationCountSummary | null =>
  createOperationCountSummary(lifts.map(lift => lift.properties.status));

const createFinalizedOperationSummary = (
  finalizedMapData: FinalizedResortMapData | null,
): FinalizedOperationSummary => ({
  courses: finalizedMapData?.courses
    ? createCourseOperationSummary(finalizedMapData.courses.features)
    : null,
  lifts: finalizedMapData?.lifts
    ? createLiftOperationSummary(finalizedMapData.lifts.features)
    : null,
});

function getWeatherIdsBySkiResortId(id: string) {
  const entry = (SkiResortWeatherIds as SkiResortWeatherIdsEntry[]).find(
    weatherIds => weatherIds.skiResortId === id,
  );

  if (!entry) return null;

  return {
    tenkijp: entry.tenkijp ?? [],
    weathernewsSpotId: entry.weathernewsSpotId ?? null,
    snowForecast: entry.snowForecast ?? [],
    SnowForecastId: entry.SnowForecastId ?? null,
    SnowForecastName: entry.SnowForecastName ?? null,
  };
}

// スキーリゾート一覧を取得（リレーション込み）
export async function getSkiResorts(): Promise<SkiResortWithRelations[]> {
  return readSkiResorts();
}

// スキーリゾート一覧を地図表示用に軽量取得
// 料金データ本体は送らず、どのスキー場の料金データを使うかだけを持たせる。
// 料金は日付を入れたときに calculateLiftTicketsForList でサーバー計算する。
export async function getSkiResortsForMap() {
  const [resorts, liftTicketSeasons] = await Promise.all([
    readSkiResortsForMap(),
    // 料金は付加情報なので、取得できなくても地図と一覧は表示する。
    listLiftTicketSeasons().catch(error => {
      console.warn("リフト券料金の一覧を取得できませんでした:", error);
      return [];
    }),
  ]);
  const resortIdsWithTickets = new Set(
    liftTicketSeasons.map(season => season.resortId),
  );
  const liftTicketResortIdOf = (resort: (typeof resorts)[number]) => {
    const fallback = resort.sourceResortIds?.[0];
    if (resortIdsWithTickets.has(resort.id)) return resort.id;
    return fallback && resortIdsWithTickets.has(fallback) ? fallback : null;
  };

  return resorts.map(resort => ({
    ...resort,
    ...getResortReadingInfo(resort),
    liftTicketResortId: liftTicketResortIdOf(resort),
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

// スキーリゾート詳細を取得
export async function getSkiResortById(id: string) {
  const resort = await readSkiResortById(id);

  if (!resort) return null;

  const sourceIds = resort.sourceResortIds?.length
    ? resort.sourceResortIds
    : [resort.id];
  const [finalizedMapData, decisionData, primaryDecisionData, linksMap] =
    await Promise.all([
      getFinalizedResortMapData(resort.id),
      getResortDecisionData(resort.id),
      sourceIds[0] !== resort.id ? getResortDecisionData(sourceIds[0]) : null,
      readResortLinksMap(),
    ]);
  const weatherEntries = sourceIds.flatMap(sourceId => {
    const entry = getWeatherIdsBySkiResortId(sourceId);
    return entry ? [entry] : [];
  });
  const weatherIds =
    getWeatherIdsBySkiResortId(resort.id) ??
    (weatherEntries.length
      ? {
          ...weatherEntries[0],
          tenkijp: weatherEntries.flatMap(entry => entry.tenkijp),
          snowForecast: weatherEntries.flatMap(entry => [
            ...entry.snowForecast,
            ...(entry.SnowForecastId
              ? [
                  {
                    snowForecastId: entry.SnowForecastId,
                    snowForecastName: entry.SnowForecastName,
                  },
                ]
              : []),
          ]),
          SnowForecastId: null,
          SnowForecastName: null,
        }
      : null);

  return {
    ...resort,
    ...getResortReadingInfo(resort),
    ...decisionData,
    liftTickets: decisionData.liftTickets.length
      ? decisionData.liftTickets
      : (primaryDecisionData?.liftTickets ?? []),
    reviewData:
      decisionData.reviewData ?? primaryDecisionData?.reviewData ?? null,
    currentConditions: await Promise.all(
      [...new Set([resort.id, ...sourceIds])].map(async id => ({
        id,
        ...(await readCurrentResortConditions(id)),
      })),
    ),
    socialAccounts: collectSocialAccounts(linksMap, [resort.id, ...sourceIds]),
    trailMapLinks: collectTrailMapLinks(linksMap, [resort.id, ...sourceIds]),
    weatherIds,
    finalizedMapData,
    finalizedOperationSummary:
      createFinalizedOperationSummary(finalizedMapData),
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
