import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";
import { resortLinkConversionRequestSchema } from "@/server/ski-resorts/mergeContract";
import { convertToLinkedAreaDirect } from "@/server/ski-resorts/repository";

export const runtime = "nodejs";

/** 完全統合の親を連携エリアにする。 */
export async function POST(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;
  try {
    const parsed = resortLinkConversionRequestSchema.safeParse(
      await readRequestJson(request, 16 * 1024),
    );
    if (!parsed.success)
      return internalApiError(422, "INVALID_REQUEST", "Invalid link data");
    return internalApiJson(await convertToLinkedAreaDirect(parsed.data));
  } catch (error) {
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    logInternalApiFailure("Failed to convert to linked area", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to link resorts");
  }
}
