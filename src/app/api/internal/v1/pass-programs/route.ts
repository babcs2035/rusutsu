import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { findPassProgramStatusDirect } from "@/server/pass-programs/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** シーズン券・キッズパスの対象一覧の状態（管理画面のクローラー監視用） */
export async function GET(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    return internalApiError(400, "INVALID_QUERY", "Unknown query parameter");
  }
  try {
    return internalApiJson({ status: await findPassProgramStatusDirect() });
  } catch (error) {
    logInternalApiFailure("Failed to read pass program status", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read data");
  }
}
