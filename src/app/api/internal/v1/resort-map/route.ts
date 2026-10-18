import { readCanonicalResortMapDirect } from "@/server/course-lift/mapData";
import {
  internalApiError,
  internalApiJson,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const error = requireInternalApiRequest(request, "admin-data");
  if (error) return error;
  const resortId = new URL(request.url).searchParams.get("resortId");
  if (!resortId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(resortId))
    return internalApiError(400, "INVALID_QUERY", "Invalid resort ID");
  return internalApiJson(await readCanonicalResortMapDirect(resortId));
}
