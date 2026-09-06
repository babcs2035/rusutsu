import { z } from "zod";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";
import {
  adminSkiResortUpdateRequestSchema,
  skiResortIdSchema,
} from "@/server/ski-resorts/adminContract";
import {
  findSkiResortByIdDirect,
  findSkiResortWeatherDirect,
  updateAdminSkiResortDirect,
} from "@/server/ski-resorts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const viewSchema = z.enum(["detail", "weather"]);

export async function GET(
  request: Request,
  context: { params: Promise<{ resortId: string }> },
) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;

  const { resortId: rawResortId } = await context.params;
  const resortId = skiResortIdSchema.safeParse(rawResortId);
  const searchParams = new URL(request.url).searchParams;
  const view = viewSchema.safeParse(searchParams.get("view"));
  if (
    !resortId.success ||
    !view.success ||
    [...searchParams.keys()].some(key => key !== "view")
  ) {
    return internalApiError(400, "INVALID_QUERY", "Invalid query parameter");
  }

  try {
    if (view.data === "weather") {
      return internalApiJson({
        weather: await findSkiResortWeatherDirect(resortId.data),
      });
    }
    return internalApiJson({
      resort: await findSkiResortByIdDirect(resortId.data),
    });
  } catch (error) {
    logInternalApiFailure("Failed to read ski resort detail", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read data");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ resortId: string }> },
) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;

  const { resortId: rawResortId } = await context.params;
  const resortId = skiResortIdSchema.safeParse(rawResortId);
  if (
    !resortId.success ||
    [...new URL(request.url).searchParams.keys()].length > 0
  ) {
    return internalApiError(400, "INVALID_REQUEST", "Invalid resort id");
  }

  let body: unknown;
  try {
    body = await readRequestJson(request, 64 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    return internalApiError(400, "INVALID_JSON", "Invalid JSON body");
  }
  const updateRequest = adminSkiResortUpdateRequestSchema.safeParse(body);
  if (!updateRequest.success) {
    return internalApiError(422, "INVALID_REQUEST", "Invalid update data");
  }

  try {
    const result = await updateAdminSkiResortDirect(
      resortId.data,
      updateRequest.data.expectedUpdatedAt,
      updateRequest.data.data,
    );
    if (result.status === "not_found") {
      return internalApiError(404, "RESORT_NOT_FOUND", "Resort not found");
    }
    if (result.status === "conflict") {
      return internalApiJson(
        {
          error: {
            code: "VERSION_CONFLICT",
            message: "The resort was changed after it was loaded",
            currentUpdatedAt: result.currentUpdatedAt,
          },
        },
        409,
      );
    }
    return internalApiJson({ resort: result.resort });
  } catch (error) {
    logInternalApiFailure("Failed to update ski resort", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to update data");
  }
}
