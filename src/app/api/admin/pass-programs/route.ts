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
 * 手元のクローラーから 1 サービス分の対象スキー場を受け取り，差分を返すか DB に反映する．
 */
export async function PUT(request: Request): Promise<Response> {
  const denied = requireInternalApiRequest(request);
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
      "Unable to sync pass program",
    );
  }
}
