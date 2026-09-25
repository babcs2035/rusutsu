import {
  LiftTicketConflictError,
  type LiftTicketSeason,
  type LiftTicketSeasonSummary,
  type LiftTicketSeasonWrite,
  liftTicketSeasonIdSchema,
  serializeLiftTicket,
} from "@/server/lift-tickets/contract";
import { skiResortIdSchema } from "@/server/ski-resorts/adminContract";
import type {
  SaveTicketRequest,
  TicketActionResult,
  TicketDocument,
  TicketEditData,
  TicketFileSummary,
  ValidationReport,
} from "../types";
import { validateTicketContent } from "./validateTicket";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const countArray = (value: unknown) =>
  Array.isArray(value) ? value.length : 0;

const summarize = (season: LiftTicketSeason): TicketFileSummary => {
  const seasonInfo = asRecord(season.data.season);
  const dataQuality = asRecord(season.data.data_quality);
  return {
    resortId: season.resortId,
    seasonId: season.seasonId,
    seasonLabelJa:
      typeof seasonInfo?.label_ja === "string" ? seasonInfo.label_ja : null,
    status: season.status,
    offerCount: countArray(season.data.offers),
    humanReviewCount: countArray(dataQuality?.human_review_required),
    unresolvedCount: countArray(dataQuality?.unresolved_questions),
  };
};

export type TicketSeasonClient = {
  listLiftTicketSeasons(): Promise<LiftTicketSeasonSummary[]>;
  findLiftTicketSeasons(
    resortIds: readonly string[],
  ): Promise<LiftTicketSeason[]>;
  getLiftTicketSeason(
    resortId: string,
    seasonId: string,
  ): Promise<LiftTicketSeason | null>;
  writeLiftTicketSeason(
    write: LiftTicketSeasonWrite,
  ): Promise<LiftTicketSeason>;
};

type TicketContentValidator = (content: string) => Promise<ValidationReport>;

// 取得結果は module scope に保持しない。管理画面の各操作で正本を読み直すため、
// `mise run lift-ticket:publish` による更新も直ちに反映される。
const defaultClient: TicketSeasonClient = {
  async listLiftTicketSeasons() {
    const client = await import("@/server/lift-tickets/client");
    return client.listLiftTicketSeasons();
  },
  async findLiftTicketSeasons(resortIds) {
    const client = await import("@/server/lift-tickets/client");
    return client.findLiftTicketSeasons(resortIds);
  },
  async getLiftTicketSeason(resortId, seasonId) {
    const client = await import("@/server/lift-tickets/client");
    return client.getLiftTicketSeason(resortId, seasonId);
  },
  async writeLiftTicketSeason(write) {
    const client = await import("@/server/lift-tickets/client");
    return client.writeLiftTicketSeason(write);
  },
};

/** 編集できる全シーズンを列挙する（1スキー場 × 1シーズンで1件）。 */
export const listTicketFiles = async (
  client: TicketSeasonClient = defaultClient,
): Promise<TicketFileSummary[]> => {
  try {
    const summaries = await client.listLiftTicketSeasons();
    const resortIds = [...new Set(summaries.map(summary => summary.resortId))];
    return (await client.findLiftTicketSeasons(resortIds)).map(summarize);
  } catch {
    return [];
  }
};

const parseIdentity = (resortId: string, seasonId: string) => {
  if (!skiResortIdSchema.safeParse(resortId).success)
    throw new Error("不正なスキー場IDです。");
  if (!liftTicketSeasonIdSchema.safeParse(seasonId).success)
    throw new Error("不正なシーズンIDです。");
};

export const readTicketForEdit = async (
  resortId: string,
  seasonId: string,
  client: TicketSeasonClient = defaultClient,
): Promise<TicketEditData> => {
  parseIdentity(resortId, seasonId);
  const season = await client.getLiftTicketSeason(resortId, seasonId);
  if (!season) throw new Error("リフト券料金が見つかりません。");
  return { resortId, seasonId, data: season.data, baseVersion: season.version };
};

const conflictResult = (): TicketActionResult => ({
  ok: false,
  errors: [
    "読み込み後に本番データが変更されています。再読み込みしてから編集してください。",
  ],
  report: null,
});

export const writeTicketFile = async (
  request: SaveTicketRequest,
  client: TicketSeasonClient = defaultClient,
  validateContent: TicketContentValidator = validateTicketContent,
): Promise<TicketActionResult> => {
  try {
    parseIdentity(request.resortId, request.seasonId);
  } catch (error) {
    return { ok: false, errors: [String(error)], report: null };
  }

  const record = asRecord(request.data);
  if (!record) {
    return {
      ok: false,
      errors: ["リフト券JSONの形式が不正です。"],
      report: null,
    };
  }

  // ★Skill の検証3本を通らないJSONは保存しない。
  // 構造とラベル体系の正本は Skill 側にあり、画面から壊せてはいけない。
  const report = await validateContent(serializeLiftTicket(record));
  if (report.failedToRun !== null) {
    return { ok: false, errors: [report.failedToRun], report };
  }
  if (!report.ok) {
    return {
      ok: false,
      errors: [
        "検証エラーがあるため保存していません。下の検証結果を解消してください。",
      ],
      report,
    };
  }

  try {
    // 版の確認と更新は同一トランザクションで行われる。
    const written = await client.writeLiftTicketSeason({
      resortId: request.resortId,
      seasonId: request.seasonId,
      data: record,
      expectedVersion: request.baseVersion,
    });
    return {
      ok: true,
      data: {
        resortId: written.resortId,
        seasonId: written.seasonId,
        data: written.data,
        baseVersion: written.version,
      },
      report,
    };
  } catch (error) {
    if (error instanceof LiftTicketConflictError) return conflictResult();
    return {
      ok: false,
      errors: [`保存に失敗しました: ${String(error)}`],
      report,
    };
  }
};

/** 保存せずに検証だけ実行する（編集中の確認用） */
export const validateTicketDocument = async (data: TicketDocument) => {
  const record = asRecord(data);
  if (!record) {
    return {
      ok: false,
      issues: [],
      failedToRun: "リフト券JSONの形式が不正です。",
      checkedAt: new Date().toISOString(),
    };
  }
  return validateTicketContent(serializeLiftTicket(record));
};
