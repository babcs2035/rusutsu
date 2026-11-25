import {
  readCanonicalResortMapDirect,
  readCanonicalResortMapRevisionDirect,
} from "@/server/course-lift/mapData";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 正本の地図またはリビジョンを取得する． */
export async function GET(request: Request): Promise<Response> {
  const error = requireInternalApiRequest(request);
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const resortId = searchParams.get("resortId");
  const view = searchParams.get("view");
  if (!resortId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(resortId))
    return internalApiError(400, "INVALID_QUERY", "Invalid resort ID");
  if (view !== null && view !== "revision")
    return internalApiError(400, "INVALID_QUERY", "Invalid view");
  try {
    return internalApiJson(
      view === "revision"
        ? await readCanonicalResortMapRevisionDirect(resortId)
        : await readCanonicalResortMapDirect(resortId),
    );
  } catch (error) {
    logInternalApiFailure("Failed to read canonical map", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read map");
  }
}
