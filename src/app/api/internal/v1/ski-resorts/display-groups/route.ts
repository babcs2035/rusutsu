import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";
import { skiResortIdSchema } from "@/server/ski-resorts/adminContract";
import {
  displayGroupDeleteRequestSchema,
  displayGroupSaveRequestSchema,
} from "@/server/ski-resorts/displayGroupContract";
import {
  deleteDisplayGroupDirect,
  listDisplayGroupsDirect,
  listDisplayGroupsForResortDirect,
  saveDisplayGroupDirect,
} from "@/server/ski-resorts/displayGroupRepository";

export const runtime = "nodejs";

/** 同時表示の組。resortId を指定すると、そのスキー場が入っている組だけを返す。 */
export async function GET(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;
  const resortId = new URL(request.url).searchParams.get("resortId");
  try {
    if (resortId === null)
      return internalApiJson({ groups: await listDisplayGroupsDirect() });
    const parsed = skiResortIdSchema.safeParse(resortId);
    if (!parsed.success)
      return internalApiError(400, "INVALID_QUERY", "Invalid resortId");
    return internalApiJson({
      groups: await listDisplayGroupsForResortDirect(parsed.data),
    });
  } catch (error) {
    logInternalApiFailure("Failed to read display groups", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read groups");
  }
}

export async function PUT(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;
  try {
    const parsed = displayGroupSaveRequestSchema.safeParse(
      await readRequestJson(request, 64 * 1024),
    );
    if (!parsed.success)
      return internalApiError(422, "INVALID_REQUEST", "Invalid group data");
    return internalApiJson(await saveDisplayGroupDirect(parsed.data));
  } catch (error) {
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    logInternalApiFailure("Failed to save display group", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to save group");
  }
}

export async function DELETE(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;
  try {
    const parsed = displayGroupDeleteRequestSchema.safeParse(
      await readRequestJson(request, 16 * 1024),
    );
    if (!parsed.success)
      return internalApiError(422, "INVALID_REQUEST", "Invalid group data");
    return internalApiJson(await deleteDisplayGroupDirect(parsed.data));
  } catch (error) {
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    logInternalApiFailure("Failed to delete display group", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to delete group");
  }
}
