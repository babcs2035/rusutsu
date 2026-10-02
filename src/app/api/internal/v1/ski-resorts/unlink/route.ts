import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";
import { resortUnlinkRequestSchema } from "@/server/ski-resorts/mergeContract";
import { unlinkAdminSkiResortsDirect } from "@/server/ski-resorts/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;
  try {
    const parsed = resortUnlinkRequestSchema.safeParse(
      await readRequestJson(request, 16 * 1024),
    );
    if (!parsed.success)
      return internalApiError(422, "INVALID_REQUEST", "Invalid unlink data");
    return internalApiJson(await unlinkAdminSkiResortsDirect(parsed.data));
  } catch (error) {
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    logInternalApiFailure("Failed to unlink ski resorts", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to unlink resorts");
  }
}
