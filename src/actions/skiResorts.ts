"use server";

import { readResortLinksMap } from "@/features/lift/server/liftFiles";
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
export async function getSkiResortsForMap() {
  const resorts = await readSkiResortsForMap();
  const liftTicketsByResortId = await getLiftTicketDataMap(
    resorts.flatMap(resort => [
      resort.id,
      ...(resort.sourceResortIds ?? []).slice(0, 1),
    ]),
  );

  return resorts.map(resort => ({
    ...resort,
    ...getResortReadingInfo(resort),
    liftTickets: liftTicketsByResortId.get(resort.id)?.length
      ? (liftTicketsByResortId.get(resort.id) ?? [])
      : (liftTicketsByResortId.get(resort.sourceResortIds?.[0] ?? resort.id) ??
        []),
  }));
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
