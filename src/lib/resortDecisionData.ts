import type { LiftTicketData } from "@/features/lift-ticket/types";
import { toClientLiftTicketData } from "./publicLiftTicketData";

const RESORT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

type ResortDecisionData = {
  liftTickets: LiftTicketData[];
};

/** リフト券料金（lift_ticket_seasons）の読み込み口。 */
export type ResortDecisionLiftTicketReader = {
  find(
    resortIds: readonly string[],
  ): Promise<Array<{ resortId: string; data: Record<string, unknown> }>>;
};

const liftTicketReader: ResortDecisionLiftTicketReader = {
  async find(resortIds) {
    const { findLiftTicketSeasons } = await import(
      "@/server/lift-tickets/client"
    );
    return findLiftTicketSeasons(resortIds);
  },
};

const loadLiftTicketDataMap = async (
  reader: ResortDecisionLiftTicketReader,
  resortIds: readonly string[],
): Promise<Map<string, LiftTicketData[]>> => {
  const requestedResortIds = [
    ...new Set(resortIds.filter(resortId => RESORT_ID_PATTERN.test(resortId))),
  ];
  const byResortId = new Map(
    resortIds.map(resortId => [resortId, [] as LiftTicketData[]]),
  );
  if (requestedResortIds.length === 0) return byResortId;

  // 一覧画面では数百件を一度に読むため、1回の問い合わせにまとめる。
  for (const season of await reader.find(requestedResortIds)) {
    try {
      byResortId
        .get(season.resortId)
        ?.push(toClientLiftTicketData(season.data));
    } catch (error) {
      // 1件の不整合でページ全体を落とさず、そのシーズンだけ表示しない。
      console.warn(
        `リフト券料金の読み込みに失敗しました（${season.resortId}）:`,
        error,
      );
    }
  }

  for (const seasons of byResortId.values()) {
    seasons.sort((left, right) =>
      right.season.id.localeCompare(left.season.id),
    );
  }
  return byResortId;
};

/**
 * 永続キャッシュを持たない読み込み口。管理画面でDBを更新した後の次の
 * リクエストから、新しい内容がそのまま公開表示へ反映される。
 * レビュー（reviews/<id>/detail.json・article.json）はDBに保存するだけで、
 * 公開画面へは読み込まない。
 */
export const createResortDecisionDataLoader = (
  ticketReader: ResortDecisionLiftTicketReader,
) => {
  const getResortDecisionData = async (
    resortId: string,
  ): Promise<ResortDecisionData> => {
    const liftTicketByResortId = await loadLiftTicketDataMap(ticketReader, [
      resortId,
    ]);
    return { liftTickets: liftTicketByResortId.get(resortId) ?? [] };
  };

  const getLiftTicketDataMap = (resortIds: string[]) =>
    loadLiftTicketDataMap(ticketReader, resortIds);

  return { getLiftTicketDataMap, getResortDecisionData };
};

const resortDecisionDataLoader =
  createResortDecisionDataLoader(liftTicketReader);

export const { getLiftTicketDataMap, getResortDecisionData } =
  resortDecisionDataLoader;
