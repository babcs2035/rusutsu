import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { findYukiMagiListDirect } from "@/server/ski-resorts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;
  const searchParams = new URL(request.url).searchParams;
  if ([...searchParams.keys()].length > 0) {
    return internalApiError(400, "INVALID_QUERY", "Unknown query parameter");
  }

  try {
    return internalApiJson({ entries: await findYukiMagiListDirect() });
  } catch (error) {
    logInternalApiFailure("Failed to read YukiMagi data", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read data");
  }
}
