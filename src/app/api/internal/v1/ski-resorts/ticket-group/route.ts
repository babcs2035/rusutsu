import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";
import { ticketGroupRequestSchema } from "@/server/ski-resorts/mergeContract";
import { updateTicketGroupDirect } from "@/server/ski-resorts/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;
  try {
    const parsed = ticketGroupRequestSchema.safeParse(
      await readRequestJson(request, 64 * 1024),
    );
    if (!parsed.success)
      return internalApiError(
        422,
        "INVALID_REQUEST",
        "Invalid ticket group data",
      );
    return internalApiJson(await updateTicketGroupDirect(parsed.data));
  } catch (error) {
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    logInternalApiFailure("Failed to update ticket group", error);
    return internalApiError(
      500,
      "INTERNAL_ERROR",
      "Unable to update ticket group",
    );
  }
}
