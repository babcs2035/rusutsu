import type { ResortOperatingCounts } from "@/features/home/utils/operatingCounts";
import {
  parseResortLinksMap,
  SKI_RESORT_LINKS_DOCUMENT_KEY,
} from "@/features/lift/server/liftFiles";
import {
  createFinalizedOperationSummary,
  createResortOperationStatus,
} from "@/features/resort-detail/utils/operationStatus";
import {
  collectNewsLinks,
  collectTrailMapLinks,
} from "@/features/resort-detail/utils/trailMapLinks";
import {
  resolveResortWeatherIds,
  weatherLinksMapFromDocument,
} from "@/features/weather/weatherLinks";
import { readCurrentResortConditions } from "@/lib/crawlLatestCurrent";
import {
  getFinalizedResortMapData,
  getFinalizedResortMapDataSnapshot,
} from "@/lib/finalizedResortGeojson";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { getResortDecisionData } from "@/lib/resortDecisionData";
import { readDisplayGroupsForResort } from "@/lib/resortDisplayGroups";
import { getResortReadingInfo } from "@/lib/resortReadings";
import { readSkiResortById } from "@/lib/skiResortData";
import { readCanonicalResortMapRevision } from "@/server/course-lift/mapData";
import { readOperatingSummaries } from "@/server/course-lift/summaryClient";
import {
  getDataDocument,
  listDataDocuments,
} from "@/server/data-documents/client";
import { currentEditCapture } from "@/server/edit-requests/capture";
import { readPublicResortAccess } from "@/server/ski-resorts/publicAccess";
import type { SkiResortDetailRecord } from "@/server/ski-resorts/repository";
import { withMapElevation } from "@/shared/utils/resortElevation";

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
  const { sourceIdsByResort } = await readPublicResortAccess();
  if (!sourceIdsByResort.has(resortId)) return [];
  const groups = await readDisplayGroupsForResort(resortId);
  return groups.flatMap(group => {
    const members = group.members.filter(member =>
      sourceIdsByResort.has(member.id),
    );
    if (members.length < 2) return [];
    return [
      {
        key: `group:${group.id}`,
        groupId: group.id,
        label: group.label,
        partners: members.filter(member => member.id !== resortId),
        memberLabels: Object.fromEntries(
          members.flatMap(member =>
            member.label ? [[member.id, member.label]] : [],
          ),
        ),
      },
    ];
  });
}

/** SNS・コースマップ・ニュース・天気のリンク一覧。全スキー場で 1 つの文書 */
type ResortLinks = {
  linksMap: ReturnType<typeof parseResortLinksMap>;
  rawLinksMap: ReturnType<typeof weatherLinksMapFromDocument>;
};

/**
 * この文書は全スキー場分で約75万文字ある。詳細を開くたびに本文を読んで解析し直さないよう、
 * 読んだ結果を版（hash）と一緒に覚えておき、版が変わったときだけ読み直す。
 * 版の確認は本文を読まない一覧の問い合わせで行う。
 */
let cachedResortLinks: { hash: string; links: ResortLinks } | null = null;

const readResortLinks = async (): Promise<ResortLinks> => {
  // 申請の下書きを重ねて読む場面では、覚えた内容を使わない
  if (!currentEditCapture() && cachedResortLinks) {
    const summaries = await listDataDocuments(SKI_RESORT_LINKS_DOCUMENT_KEY);
    const current = summaries.find(
      summary => summary.key === SKI_RESORT_LINKS_DOCUMENT_KEY,
    );
    if (current?.hash === cachedResortLinks.hash)
      return cachedResortLinks.links;
  }
  const document = await getDataDocument(SKI_RESORT_LINKS_DOCUMENT_KEY);
  const links = {
    linksMap: parseResortLinksMap(document?.content ?? null),
    rawLinksMap: weatherLinksMapFromDocument(document?.content ?? null),
  };
  if (document && !currentEditCapture())
    cachedResortLinks = { hash: document.hash, links };
  return links;
};

/** リンク一覧用。旧来のリンク文書から、指定スキー場の分だけを取り出す */
export async function readLegacyResortLinks(resortIds: readonly string[]) {
  const { linksMap } = await readResortLinks();
  return resortIds.map(id => linksMap[id]).filter(Boolean);
}

const buildSkiResortDetail = async (
  resort: SkiResortDetailRecord,
  links: ResortLinks,
  finalizedMapData: FinalizedResortMapData | null,
  operationMapData: FinalizedResortMapData | null = finalizedMapData,
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
    currentConditions: await Promise.all(
      [...new Set([resort.id, ...sourceIds])].map(async id => ({
        id,
        ...(await readCurrentResortConditions(id)),
      })),
    ),
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
    operationStatus: createResortOperationStatus(operationMapData),
  };
};

export type SkiResortDetailData = Awaited<
  ReturnType<typeof buildSkiResortDetail>
>;

const MAX_CACHED_RESORT_MAPS = 32;
const cachedResortMaps = new Map<
  string,
  { revision: string; data: FinalizedResortMapData | null }
>();
const pendingResortMaps = new Map<
  string,
  Promise<FinalizedResortMapData | null>
>();

/** geometry と現在値の版が一致するときだけ，同一プロセス内の地図を再利用する． */
async function readResortMap(
  resortId: string,
): Promise<FinalizedResortMapData | null> {
  if (currentEditCapture()) return getFinalizedResortMapData(resortId);
  const existing = pendingResortMaps.get(resortId);
  if (existing) return existing;
  const pending = readCurrentResortMap(resortId);
  pendingResortMaps.set(resortId, pending);
  try {
    return await pending;
  } finally {
    pendingResortMaps.delete(resortId);
  }
}

/** 版の照合から再取得までを一つの進行中の読み込みとして扱う． */
async function readCurrentResortMap(
  resortId: string,
): Promise<FinalizedResortMapData | null> {
  const cached = cachedResortMaps.get(resortId);
  if (cached) {
    const current = await readCanonicalResortMapRevision(resortId);
    if (current.enabled && current.revision === cached.revision) {
      cachedResortMaps.delete(resortId);
      cachedResortMaps.set(resortId, cached);
      return cached.data;
    }
    cachedResortMaps.delete(resortId);
  }

  const snapshot = await getFinalizedResortMapDataSnapshot(resortId);
  if (snapshot.canonicalEnabled && snapshot.revision) {
    cachedResortMaps.set(resortId, {
      revision: snapshot.revision,
      data: snapshot.data,
    });
    if (cachedResortMaps.size > MAX_CACHED_RESORT_MAPS) {
      const oldest = cachedResortMaps.keys().next();
      if (!oldest.done) cachedResortMaps.delete(oldest.value);
    }
  }
  return snapshot.data;
}

/**
 * 複数スキー場の詳細をまとめて読む。順序は ids のまま、無いものは除く。
 * 比較は地図（コース・リフトの形）を別に読むので、withMap=false で軽く返す。
 */
export async function readSkiResortDetails(
  ids: string[],
  { withMap }: { withMap: boolean },
): Promise<SkiResortDetailData[]> {
  if (ids.length === 0) return [];
  const [links, maps, summaries] = await Promise.all([
    readResortLinks(),
    Promise.all(
      ids.map(async id => {
        const source = await readSkiResortById(id);
        return source
          ? {
              source,
              mapData: await readResortMap(source.id),
            }
          : null;
      }),
    ),
    // 標高は付加情報なので、集計を読めなくても掲載元の値で詳細を出す
    readOperatingSummaries().catch(
      (error): Record<string, ResortOperatingCounts> => {
        console.warn("地図の標高の集計を取得できませんでした:", error);
        return {};
      },
    ),
  ]);
  const details = await Promise.all(
    maps.map(async entry => {
      if (!entry) return null;
      const { source, mapData } = entry;
      const resort = withMapElevation(source, summaries[source.id]?.elevation);
      return buildSkiResortDetail(
        resort,
        links,
        withMap ? mapData : null,
        mapData,
      );
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
      finalizedMapData: await readResortMap(id),
    })),
  );
}
