import { z } from "zod";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import {
  PASS_PROGRAM_MAX_BODY_BYTES,
  passProgramSyncSchema,
} from "@/server/pass-programs/contract";
import { syncPassProgramDirect } from "@/server/pass-programs/repository";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * シーズン券・キッズパス1サービス分の対象スキー場一覧を、手元のクローラー（mise run crawl:pass-programs）から受け取る。
 * dryRun なら差分を返すだけ、そうでなければ pass_program_resorts（NSDキッズはリンク集も）へ反映する。
 */
export async function PUT(request: Request) {
  const denied = requireInternalApiRequest(request, "admin-data");
  if (denied) return denied;
  try {
    const input = passProgramSyncSchema.parse(
      await readRequestJson(request, PASS_PROGRAM_MAX_BODY_BYTES),
    );
    return internalApiJson({ result: await syncPassProgramDirect(input) });
  } catch (error) {
    if (error instanceof z.ZodError)
      return internalApiError(
        422,
        "INVALID_PASS_PROGRAM",
        error.issues
          .slice(0, 5)
          .map(issue => `${issue.path.join(".")}: ${issue.message}`)
          .join(" / "),
      );
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    logInternalApiFailure("Pass program sync failed", error);
    return internalApiError(
      500,
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "反映できませんでした。",
    );
  }
}
