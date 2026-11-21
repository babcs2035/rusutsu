// 公開画面と HTTP 境界が直接利用する施設の取得・料金計算を集約する．
import "server-only";

import type { ResortOperatingCounts } from "@/features/home/utils/operatingCounts";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import {
  type ResortPriceSummary,
  summarizeResortPrice,
} from "@/features/lift-ticket/utils/resortPriceCalculation";
import { legacyLinkItems } from "@/features/resort-links/legacy";
import type { ResortLinkItem } from "@/features/resort-links/model";
import { getFinalizedResortMapData } from "@/lib/finalizedResortGeojson";
import { getResortLabelName } from "@/lib/resortAliases";
import { getLiftTicketDataMap } from "@/lib/resortDecisionData";
import { readDisplayGroupsForResort } from "@/lib/resortDisplayGroups";
import { getResortReadingInfo } from "@/lib/resortReadings";
import { readSkiResortsForMap } from "@/lib/skiResortData";
import { readOperatingSummaries } from "@/server/course-lift/summaryClient";
import { listLiftTicketSeasons } from "@/server/lift-tickets/client";
import { findResortLinks } from "@/server/resort-links/client";
import {
  readLegacyResortLinks,
  readResortMapDataByIds,
  readSkiResortDetails,
  type SkiResortDetailData,
} from "@/server/ski-resorts/detail";
import { combineResortMaps } from "@/server/ski-resorts/displayGroupMap";
import { withMapElevation } from "@/shared/utils/resortElevation";

// スキーリゾート一覧を地図表示用に軽量取得
// 料金データ本体は送らず、どのスキー場の料金データを使うかだけを持たせる。
// 料金は日付を入れたときに calculateLiftTicketAndRentalForList でサーバー計算する。
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
    ...withMapElevation(resort, operatingSummaries[resort.id]?.elevation),
    ...getResortReadingInfo(resort),
    liftTicketResortId: liftTicketResortIdOf(resort),
    // 対象サービスを返す前のデータAPIでは欄が無い
    passProgramIds: resort.passProgramIds ?? [],
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

/** 一覧用の料金。詳細の料金タブと同じ計算（summarizeResortPrice）で出す。 */
export async function calculateLiftTicketAndRentalForList(
  resortIds: string[],
  input: LiftTicketSearchInput,
): Promise<Record<string, ResortPriceSummary>> {
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
  const results: Record<string, ResortPriceSummary> = {};
  for (const id of uniqueIds) {
    results[id] = summarizeResortPrice(seasonsByResortId.get(id) ?? [], input);
  }
  return results;
}

/** 公開中の施設を取得し，詳細がなければ null を返す． */
export async function getSkiResortById(
  id: string,
): Promise<SkiResortDetailData | null> {
  const [detail] = await readSkiResortDetails([id], { withMap: true });
  return detail ?? null;
}

const MAX_LINK_LIST_RESORT_IDS = 20;

/**
 * リンク一覧（リンクのタブ）を開いたときに読む。
 * リンクのテーブル（公式ページ・ツアー・割引）と、旧来のリンク文書の分をまとめて返す。
 * 営業状況・リフト券のURLは詳細データがすでに持っているので、ここでは読まない。
 */
export async function getResortLinkList(
  resortIds: string[],
): Promise<ResortLinkItem[]> {
  const ids = [...new Set(resortIds)];
  if (
    ids.length === 0 ||
    ids.length > MAX_LINK_LIST_RESORT_IDS ||
    ids.some(id => !RESORT_ID_PATTERN.test(id))
  )
    throw new Error("Invalid ids");
  const [records, legacy] = await Promise.all([
    // リンクのテーブルが使えなくても、ほかのリンクは表示する
    findResortLinks(ids).catch(error => {
      console.warn("リンクのテーブルを読めませんでした:", error);
      return [];
    }),
    readLegacyResortLinks(ids),
  ]);
  return [
    ...records.map(
      ({ type, source, category, label, url, note, sortOrder }) => ({
        type,
        source,
        category,
        label,
        url,
        note,
        sortOrder,
      }),
    ),
    ...legacy.flatMap(links => legacyLinkItems(links)),
  ];
}

const MAX_LINK_LIST_RESORTS = 8;

/**
 * 複数のスキー場のリンク一覧を、スキー場ごとに分けて1回で返す（比較のリンク集）。
 * 1スキー場分は、結合元も含めたIDの組で渡す。結果は渡した順。
 */
export async function getResortLinkLists(
  resortIdGroups: string[][],
): Promise<ResortLinkItem[][]> {
  if (
    !Array.isArray(resortIdGroups) ||
    resortIdGroups.length === 0 ||
    resortIdGroups.length > MAX_LINK_LIST_RESORTS ||
    !resortIdGroups.every(Array.isArray)
  )
    throw new Error("Invalid ids");
  return Promise.all(resortIdGroups.map(ids => getResortLinkList(ids)));
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
  // 相手ごとにリンク文書と営業集計を読み直さず，共通の読込を一度だけ行う．
  const partnerIds = group.members
    .filter(member => member.id !== resortId)
    .map(member => member.id);
  const [ownMap, partnerDetails] = await Promise.all([
    group.members.some(member => member.id === resortId)
      ? getFinalizedResortMapData(resortId)
      : null,
    readSkiResortDetails(partnerIds, { withMap: true }),
  ]);
  const byId = new Map(partnerDetails.map(detail => [detail.id, detail]));
  const members = group.members.map(member => ({
    id: member.id,
    detail: byId.get(member.id),
    mapData: member.id === resortId ? ownMap : null,
  }));
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
