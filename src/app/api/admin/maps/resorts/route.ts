import {
  readCanonicalResortMapDirect,
  readCanonicalResortMapRevisionDirect,
} from "@/server/course-lift/mapData";
import {
  internalApiError,
  internalApiJson,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const error = requireInternalApiRequest(request);
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const resortId = searchParams.get("resortId");
  const view = searchParams.get("view");
  if (!resortId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(resortId))
    return internalApiError(400, "INVALID_QUERY", "Invalid resort ID");
  if (view !== null && view !== "revision")
    return internalApiError(400, "INVALID_QUERY", "Invalid view");
  if (view === "revision")
    return internalApiJson(
      await readCanonicalResortMapRevisionDirect(resortId),
    );
  return internalApiJson(await readCanonicalResortMapDirect(resortId));
}
