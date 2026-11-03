import { readOperationBaseline } from "@/server/course-lift/operationBaseline";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const error = requireInternalApiRequest(request, "crawler-ingest");
  if (error) return error;
  const params = new URL(request.url).searchParams;
  const resortId = params.get("resortId");
  if (
    !resortId ||
    params.getAll("resortId").length !== 1 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(resortId) ||
    [...params.keys()].some(key => key !== "resortId")
  ) {
    return internalApiError(400, "INVALID_QUERY", "Invalid resort ID");
  }
  try {
    return internalApiJson(await readOperationBaseline(resortId));
  } catch (cause) {
    logInternalApiFailure("Failed to read operation baseline", cause);
    return internalApiError(
      500,
      "INTERNAL_ERROR",
      "Unable to read operation baseline",
    );
  }
}
