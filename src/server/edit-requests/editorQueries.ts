/** 管理画面の編集に必要な正本と版を取得する．呼び出す入口で編集者権限を確認する． */
import "server-only";
import path from "node:path";
import { loadLatestStatusMappingWorkspace } from "@/features/latest-status-mapping/server/mappingFiles";
import type {
  LatestStatusMappingKind,
  LatestStatusMappingWorkspace,
} from "@/features/latest-status-mapping/types";
import {
  parseLiftBeforeGeojson,
  readLiftBeforeDocument,
  readLiftDetailEntries,
  readResortLinks,
} from "@/features/lift/server/liftFiles";
import type { LiftSourceData, ResortLinks } from "@/features/lift/types";
import { readReviewForEdit } from "@/features/review/server/reviewFiles";
import type { ReviewEditData } from "@/features/review/types";
import {
  parseSlopeBeforeGeojson,
  parseSlopeDetailEntries,
  readSlopeBeforeDocument,
  readSlopeDetailDocument,
} from "@/features/slope/server/slopeFiles";
import type { SlopeSourceData, SlopeSourceKind } from "@/features/slope/types";
import { readTicketForEdit } from "@/features/ticket/server/ticketFiles";
import type { TicketEditData } from "@/features/ticket/types";
import {
  readMappingCrawlLatestStatus,
  readMappingStatusHistory,
} from "@/lib/crawlLatestCurrent";

const TEMPORARY_ROOT = path.join(
  process.cwd(),
  "src/private/data/resorts-temporary",
);

/** 保存時の比較に必要な元の文書 hash とリフトの属性を返す． */
export async function loadLiftSourceData(
  resortId: string,
): Promise<LiftSourceData> {
  const [document, details] = await Promise.all([
    readLiftBeforeDocument(resortId),
    readLiftDetailEntries(resortId),
  ]);
  if (document === null) return { geojson: null, details, fileHash: null };
  return {
    geojson: parseLiftBeforeGeojson(document.content),
    details,
    fileHash: document.hash,
  };
}

/** 編集画面に施設単位の参考リンクを渡す． */
export async function loadResortLinks(resortId: string): Promise<ResortLinks> {
  return readResortLinks(resortId);
}

/** 編集する地形の出どころと文書 hash を読み込む． */
export async function loadSlopeSourceData(
  resortId: string,
  sourceKind: SlopeSourceKind = "curated",
): Promise<SlopeSourceData> {
  const [beforeDocument, detailDocument] = await Promise.all([
    readSlopeBeforeDocument(resortId, sourceKind),
    sourceKind === "curated" ? readSlopeDetailDocument(resortId) : null,
  ]);
  const beforeRaw = beforeDocument?.content ?? null;
  const detailRaw = detailDocument?.content ?? null;
  return {
    sourceKind,
    geojson: beforeRaw === null ? null : parseSlopeBeforeGeojson(beforeRaw),
    details: detailRaw === null ? null : parseSlopeDetailEntries(detailRaw),
    fileHash: beforeDocument?.hash ?? null,
    detailFileHash: detailDocument?.hash ?? null,
  };
}

/** 料金編集で比較するシーズンと版を返す． */
export async function loadTicketForEdit(
  resortId: string,
  seasonId: string,
): Promise<TicketEditData> {
  return readTicketForEdit(resortId, seasonId);
}

/** 記事と編集用の原稿を一緒に返す． */
export async function loadReviewForEdit(
  resortId: string,
): Promise<ReviewEditData> {
  return readReviewForEdit(resortId);
}

/** 正本と営業履歴から対応表の編集状態を作る． */
export const loadLatestStatusMapping = async (
  resortId: string,
  kind: LatestStatusMappingKind,
  geojsonNames?: string[],
): Promise<LatestStatusMappingWorkspace> => {
  return loadLatestStatusMappingWorkspace(
    TEMPORARY_ROOT,
    resortId,
    kind,
    geojsonNames,
    readMappingCrawlLatestStatus,
    readMappingStatusHistory,
  );
};
