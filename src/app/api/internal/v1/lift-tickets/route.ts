import { z } from "zod";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import {
  LIFT_TICKET_MAX_CONTENT_BYTES,
  LiftTicketConflictError,
  liftTicketSeasonIdSchema,
  liftTicketSeasonWriteSchema,
} from "@/server/lift-tickets/contract";
import {
  findLiftTicketSeasonsDirect,
  getLiftTicketSeasonDirect,
  listLiftTicketSeasonsDirect,
  writeLiftTicketSeasonDirect,
} from "@/server/lift-tickets/repository";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";
import { skiResortIdSchema } from "@/server/ski-resorts/adminContract";
import { findExistingSkiResortIdsDirect } from "@/server/ski-resorts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESORT_IDS = 100;
const resortIdListSchema = z
  .string()
  .transform(value => value.split(","))
  .pipe(z.array(skiResortIdSchema).min(1).max(MAX_RESORT_IDS));

const issuesOf = (error: z.ZodError) =>
  error.issues
    .map(issue => `${issue.path.join(".")}: ${issue.message}`)
    .slice(0, 12)
    .join("\n");

/**
 * - クエリなし: 全シーズンの一覧（本文なし）
 * - resortId + seasonId: 1シーズン分の本文
 * - resortIds（カンマ区切り）: 指定スキー場の全シーズンの本文
 */
export async function GET(request: Request) {
  const denied = requireInternalApiRequest(request, "admin-data");
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const keys = [...params.keys()].sort().join(",");

  try {
    if (keys === "")
      return internalApiJson({ seasons: await listLiftTicketSeasonsDirect() });
    if (keys === "resortId,seasonId") {
      const resortId = skiResortIdSchema.safeParse(params.get("resortId"));
      const seasonId = liftTicketSeasonIdSchema.safeParse(
        params.get("seasonId"),
      );
      if (!resortId.success || !seasonId.success)
        return internalApiError(400, "INVALID_QUERY", "Invalid season key");
      return internalApiJson({
        season: await getLiftTicketSeasonDirect(resortId.data, seasonId.data),
      });
    }
    if (keys === "resortIds") {
      const resortIds = resortIdListSchema.safeParse(params.get("resortIds"));
      if (!resortIds.success)
        return internalApiError(400, "INVALID_QUERY", "Invalid resortIds");
      return internalApiJson({
        seasons: await findLiftTicketSeasonsDirect(resortIds.data),
      });
    }
    return internalApiError(400, "INVALID_QUERY", "Unknown query parameter");
  } catch (error) {
    logInternalApiFailure("Failed to read lift ticket seasons", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read data");
  }
}

export async function PUT(request: Request) {
  const denied = requireInternalApiRequest(request, "admin-data");
  if (denied) return denied;
  try {
    const write = liftTicketSeasonWriteSchema.parse(
      // JSON全体に少し余裕を持たせる（本文上限はスキーマ側で検査する）
      await readRequestJson(request, LIFT_TICKET_MAX_CONTENT_BYTES + 64 * 1024),
    );
    if (!(await findExistingSkiResortIdsDirect([write.resortId])).length)
      return internalApiError(404, "NOT_FOUND", "スキー場IDが存在しません。");
    return internalApiJson({
      season: await writeLiftTicketSeasonDirect(write),
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return internalApiError(422, "INVALID_LIFT_TICKET", issuesOf(error));
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    if (error instanceof LiftTicketConflictError)
      return internalApiJson(
        {
          error: {
            code: "VERSION_CONFLICT",
            message:
              "本番データが変更されています。差分を確認し直してください。",
            details: { actualVersion: error.actualVersion },
          },
        },
        409,
      );
    logInternalApiFailure("Lift ticket write failed", error);
    return internalApiError(
      500,
      "INTERNAL_ERROR",
      "リフト券料金を保存できませんでした。",
    );
  }
}
