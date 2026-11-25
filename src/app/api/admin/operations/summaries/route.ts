import { findOperatingSummariesDirect } from "@/server/course-lift/summaryClient";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 保存済みの営業集計を認証済みの内部クライアントに返す． */
export async function GET(request: Request): Promise<Response> {
  const error = requireInternalApiRequest(request);
  if (error) return error;
  try {
    return internalApiJson({ summaries: await findOperatingSummariesDirect() });
  } catch (error) {
    logInternalApiFailure("Failed to read operating summaries", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read summaries");
  }
}
