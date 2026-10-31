"use server";

import type { ResortOperatingCounts } from "@/features/home/utils/operatingCounts";
import {
  parseResortLinksMap,
  SKI_RESORT_LINKS_DOCUMENT_KEY,
} from "@/features/lift/server/liftFiles";
import type {
  LiftTicketSearchInput,
  TicketCalculationResult,
} from "@/features/lift-ticket/types";
import {
  calculateLiftTicketForSeasons,
  calculateLiftTicketPlan,
  selectLiftTicketSeason,
} from "@/features/lift-ticket/utils/calculateLiftTicket";
import {
  calculateRentalPlan,
  type TicketRentalResult,
} from "@/features/lift-ticket/utils/rental";
import {
  calculateRentalBundle,
  type TicketBundleResult,
} from "@/features/lift-ticket/utils/rentalBundle";
import { collectSocialAccounts } from "@/features/resort-detail/utils/socialAccounts";
import {
  collectNewsLinks,
  collectTrailMapLinks,
} from "@/features/resort-detail/utils/trailMapLinks";
import {
  resolveResortWeatherIds,
  weatherLinksMapFromDocument,
} from "@/features/weather/weatherLinks";
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
import { readDisplayGroupsForResort } from "@/lib/resortDisplayGroups";
import { getResortReadingInfo } from "@/lib/resortReadings";
import {
  readSkiResortById,
  readSkiResorts,
  readSkiResortsForMap,
  readSkiResortWeather,
  readYukiMagiList,
} from "@/lib/skiResortData";
import { readOperatingSummaries } from "@/server/course-lift/summaryClient";
import { getDataDocument } from "@/server/data-documents/client";
import { listLiftTicketSeasons } from "@/server/lift-tickets/client";
import {
  combineResortMaps,
  filterLinkedAreaMap,
  readLinkedAreaOwners,
} from "@/server/ski-resorts/linkedAreaMap";
import type { SkiResortWithRelations } from "@/types";

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
    // 連携エリアの子は、親に登録した共通の料金を使う。
    const candidates = [
      resort.mergedIntoId,
      resort.id,
      resort.sourceResortIds?.[0],
    ];
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
    const seasons = seasonsByResortId.get(id) ?? [];
    try {
      const season =
        selectLiftTicketSeason(seasons, input.visitDate) ?? seasons[0];
      const rental = season ? calculateRentalPlan(season, input) : null;
      results[id] = {
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
      results[id] = { ticket: null, rental: null, bundle: null };
    }
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
  const resort = await readSkiResortById(id);

  if (!resort) return null;

  // 連携エリアの子として開いたときは、地図・料金・レビューを親のIDで読む。
  const dataId = resort.linkedArea?.id ?? resort.id;
  const sourceIds = resort.sourceResortIds?.length
    ? resort.sourceResortIds
    : [resort.id];
  const [areaMapData, decisionData, primaryDecisionData, linksDocument] =
    await Promise.all([
      getFinalizedResortMapData(dataId),
      getResortDecisionData(dataId),
      sourceIds[0] !== dataId ? getResortDecisionData(sourceIds[0]) : null,
      getDataDocument(SKI_RESORT_LINKS_DOCUMENT_KEY),
    ]);
  const { finalizedMapData, linkedAreaMapData } = await resolveLinkedMapData(
    resort.id,
    dataId,
    areaMapData,
  );
  const simultaneousOptions = await resolveSimultaneousOptions(
    resort,
    linkedAreaMapData,
  );
  const linksMap = parseResortLinksMap(linksDocument?.content ?? null);
  const rawLinksMap = weatherLinksMapFromDocument(
    linksDocument?.content ?? null,
  );
  const weatherIds = resolveResortWeatherIds(
    rawLinksMap,
    resort.id,
    resort.linkedArea ? [] : sourceIds,
  );
  // 連携エリアは天気・予報・積雪をスキー場ごとのタブで出す。
  const memberWeatherIds = resort.linkedArea
    ? Object.fromEntries(
        resort.linkedArea.members.map(member => [
          member.id,
          resolveResortWeatherIds(rawLinksMap, member.id),
        ]),
      )
    : null;

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
    socialAccounts: collectSocialAccounts(linksMap, [dataId, ...sourceIds]),
    trailMapLinks: collectTrailMapLinks(linksMap, [dataId, ...sourceIds]),
    newsLinks: collectNewsLinks(linksMap, [dataId, ...sourceIds]),
    weatherIds,
    memberWeatherIds,
    finalizedMapData,
    // 連携エリア全体の地図。同時表示の組の地図は、チェックしたときに読む
    linkedAreaMapData,
    simultaneousOptions,
    finalizedOperationSummary:
      createFinalizedOperationSummary(finalizedMapData),
  };
}

/**
 * 連携エリアの子では、親の地図から自分の線だけを取り出す。
 * 線を振り分けていない地図は、これまでどおり親の地図全体を出す。
 */
async function resolveLinkedMapData(
  resortId: string,
  areaId: string,
  areaMapData: FinalizedResortMapData | null,
) {
  if (areaId === resortId || !areaMapData)
    return { finalizedMapData: areaMapData, linkedAreaMapData: null };
  const owners = await readLinkedAreaOwners(areaId);
  if (!owners.size)
    return { finalizedMapData: areaMapData, linkedAreaMapData: null };
  const ownMapData = await getFinalizedResortMapData(resortId);
  return {
    finalizedMapData: filterLinkedAreaMap(
      areaMapData,
      owners,
      resortId,
      ownMapData?.courseStatusSummary,
    ),
    linkedAreaMapData: areaMapData,
  };
}

type ResortRecord = NonNullable<Awaited<ReturnType<typeof readSkiResortById>>>;

/** 詳細と同じ規則で、そのスキー場自身の地図を読む */
async function readOwnMapData(id: string) {
  const resort = await readSkiResortById(id);
  if (!resort) return null;
  const dataId = resort.linkedArea?.id ?? resort.id;
  return (
    await resolveLinkedMapData(
      resort.id,
      dataId,
      await getFinalizedResortMapData(dataId),
    )
  ).finalizedMapData;
}

export type SimultaneousOption = {
  /** 表示状態を覚えるキー。組のどのスキー場から開いても同じになる */
  key: string;
  /** 管理画面で作った組のID。連携エリアは null */
  groupId: string | null;
  /** 「ニセコ全山」など。null なら相手の名前で「〇〇も同時に表示」と出す */
  label: string | null;
  partners: Array<{ id: string; nameJa: string; shortName: string | null }>;
};

/** 「〇〇も同時に表示」の選択肢。連携エリアと、管理画面で作った同時表示の組 */
async function resolveSimultaneousOptions(
  resort: ResortRecord,
  linkedAreaMapData: FinalizedResortMapData | null,
): Promise<SimultaneousOption[]> {
  const groups = await readDisplayGroupsForResort(resort.id);
  return [
    ...(resort.linkedArea && linkedAreaMapData
      ? [
          {
            key: resort.linkedArea.id,
            groupId: null,
            label: null,
            partners: resort.linkedArea.members
              .filter(member => member.id !== resort.id)
              .map(({ id, nameJa, shortName }) => ({ id, nameJa, shortName })),
          },
        ]
      : []),
    ...groups.map(group => ({
      key: `group:${group.id}`,
      groupId: group.id,
      label: group.label,
      partners: group.members.filter(member => member.id !== resort.id),
    })),
  ];
}

/**
 * 同時表示の組の地図とコンディション。チェックを入れたときに読む。
 * 地図は自分を含む全スキー場分をまとめ、コンディションは相手の分だけ返す。
 */
export async function getSimultaneousView(resortId: string, groupId: string) {
  const group = (await readDisplayGroupsForResort(resortId)).find(
    item => item.id === groupId,
  );
  if (!group) return null;
  const members = await Promise.all(
    group.members.map(async member => {
      const [mapData, conditions] = await Promise.all([
        readOwnMapData(member.id),
        member.id === resortId ? null : readCurrentResortConditions(member.id),
      ]);
      return { id: member.id, mapData, conditions };
    }),
  );
  return {
    mapData: combineResortMaps(members.map(member => member.mapData)),
    conditions: members.flatMap(member =>
      member.conditions ? [{ id: member.id, ...member.conditions }] : [],
    ),
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
