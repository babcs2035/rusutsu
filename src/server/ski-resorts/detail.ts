import {
  parseResortLinksMap,
  SKI_RESORT_LINKS_DOCUMENT_KEY,
} from "@/features/lift/server/liftFiles";
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
import { getResortDecisionData } from "@/lib/resortDecisionData";
import { readDisplayGroupsForResort } from "@/lib/resortDisplayGroups";
import { getResortReadingInfo } from "@/lib/resortReadings";
import { readSkiResortById } from "@/lib/skiResortData";
import { getDataDocument } from "@/server/data-documents/client";
import type { SkiResortDetailRecord } from "@/server/ski-resorts/repository";

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

export const createFinalizedOperationSummary = (
  finalizedMapData: FinalizedResortMapData | null,
): FinalizedOperationSummary => ({
  courses: finalizedMapData?.courses
    ? createCourseOperationSummary(finalizedMapData.courses.features)
    : null,
  lifts: finalizedMapData?.lifts
    ? createLiftOperationSummary(finalizedMapData.lifts.features)
    : null,
});

export type SimultaneousOption = {
  /** 表示状態を覚えるキー。組のどのスキー場から開いても同じになる */
  key: string;
  /** 管理画面で作った組のID */
  groupId: string;
  /** 「ニセコ全山」など。null なら相手の名前で「〇〇も同時に表示」と出す */
  label: string | null;
  partners: Array<{
    id: string;
    nameJa: string;
    shortName: string | null;
    /** 組の中での表示名。null なら短縮名 */
    label: string | null;
  }>;
  /** 組の全スキー場（開いたスキー場を含む）の表示名。設定したものだけ */
  memberLabels: Record<string, string>;
};

/** 「〇〇も同時に表示」の選択肢。管理画面で作った同時表示の組 */
export async function resolveSimultaneousOptions(
  resortId: string,
): Promise<SimultaneousOption[]> {
  const groups = await readDisplayGroupsForResort(resortId);
  return groups.map(group => ({
    key: `group:${group.id}`,
    groupId: group.id,
    label: group.label,
    partners: group.members.filter(member => member.id !== resortId),
    memberLabels: Object.fromEntries(
      group.members.flatMap(member =>
        member.label ? [[member.id, member.label]] : [],
      ),
    ),
  }));
}

/** SNS・コースマップ・ニュース・天気のリンク一覧。全スキー場で 1 つの文書 */
type ResortLinks = {
  linksMap: ReturnType<typeof parseResortLinksMap>;
  rawLinksMap: ReturnType<typeof weatherLinksMapFromDocument>;
};

const readResortLinks = async (): Promise<ResortLinks> => {
  const document = await getDataDocument(SKI_RESORT_LINKS_DOCUMENT_KEY);
  return {
    linksMap: parseResortLinksMap(document?.content ?? null),
    rawLinksMap: weatherLinksMapFromDocument(document?.content ?? null),
  };
};

const buildSkiResortDetail = async (
  resort: SkiResortDetailRecord,
  links: ResortLinks,
  finalizedMapData: FinalizedResortMapData | null,
) => {
  const sourceIds = resort.sourceResortIds?.length
    ? resort.sourceResortIds
    : [resort.id];
  const [decisionData, primaryDecisionData, simultaneousOptions] =
    await Promise.all([
      getResortDecisionData(resort.id),
      sourceIds[0] !== resort.id ? getResortDecisionData(sourceIds[0]) : null,
      resolveSimultaneousOptions(resort.id),
    ]);
  const weatherIds = resolveResortWeatherIds(
    links.rawLinksMap,
    resort.id,
    sourceIds,
  );

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
    socialAccounts: collectSocialAccounts(links.linksMap, [
      resort.id,
      ...sourceIds,
    ]),
    trailMapLinks: collectTrailMapLinks(links.linksMap, [
      resort.id,
      ...sourceIds,
    ]),
    newsLinks: collectNewsLinks(links.linksMap, [resort.id, ...sourceIds]),
    weatherIds,
    // 同時表示の組の地図は、チェックしたときに読む
    finalizedMapData,
    simultaneousOptions,
    finalizedOperationSummary:
      createFinalizedOperationSummary(finalizedMapData),
  };
};

export type SkiResortDetailData = Awaited<
  ReturnType<typeof buildSkiResortDetail>
>;

/**
 * 複数スキー場の詳細をまとめて読む。順序は ids のまま、無いものは除く。
 * 比較は地図（コース・リフトの形）を別に読むので、withMap=false で軽く返す。
 */
export async function readSkiResortDetails(
  ids: string[],
  { withMap }: { withMap: boolean },
): Promise<SkiResortDetailData[]> {
  if (ids.length === 0) return [];
  const [links, resorts] = await Promise.all([
    readResortLinks(),
    Promise.all(ids.map(id => readSkiResortById(id))),
  ]);
  const details = await Promise.all(
    resorts.map(async resort => {
      if (!resort) return null;
      const finalizedMapData = withMap
        ? await getFinalizedResortMapData(resort.id)
        : null;
      return buildSkiResortDetail(resort, links, finalizedMapData);
    }),
  );
  return details.filter(detail => detail !== null);
}

export type ResortMapDataEntry = {
  id: string;
  finalizedMapData: FinalizedResortMapData | null;
};

/** 比較のゲレンデ表示に使う地図データだけを、まとめて読む */
export async function readResortMapDataByIds(
  ids: string[],
): Promise<ResortMapDataEntry[]> {
  return Promise.all(
    ids.map(async id => ({
      id,
      finalizedMapData: await getFinalizedResortMapData(id),
    })),
  );
}
