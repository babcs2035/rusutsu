import { z } from "zod";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { skiResortIdSchema } from "@/server/ski-resorts/adminContract";
import {
  findAdminSkiResortsDirect,
  findExistingSkiResortIdsDirect,
  findSkiResortNamesDirect,
  findSkiResortsDirect,
  findSkiResortsForMapDirect,
} from "@/server/ski-resorts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const viewSchema = z.enum(["full", "map", "names", "ids", "admin"]);

const parseIds = (raw: string | null) => {
  if (raw === null) return undefined;
  const ids = [...new Set(raw.split(",").filter(Boolean))];
  if (ids.length > 1_000) return null;
  const parsed = z.array(skiResortIdSchema).safeParse(ids);
  return parsed.success ? parsed.data : null;
};

export async function GET(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;

  const searchParams = new URL(request.url).searchParams;
  if ([...searchParams.keys()].some(key => key !== "view" && key !== "ids")) {
    return internalApiError(400, "INVALID_QUERY", "Unknown query parameter");
  }
  const view = viewSchema.safeParse(searchParams.get("view"));
  const ids = parseIds(searchParams.get("ids"));
  if (!view.success || ids === null) {
    return internalApiError(400, "INVALID_QUERY", "Invalid query parameter");
  }
  if (
    (view.data === "ids" && ids === undefined) ||
    ((view.data === "full" || view.data === "map" || view.data === "admin") &&
      ids !== undefined)
  ) {
    return internalApiError(400, "INVALID_QUERY", "Invalid ids parameter");
  }

  try {
    if (view.data === "full") {
      return internalApiJson({ resorts: await findSkiResortsDirect() });
    }
    if (view.data === "map") {
      return internalApiJson({ resorts: await findSkiResortsForMapDirect() });
    }
    if (view.data === "admin") {
      return internalApiJson({ resorts: await findAdminSkiResortsDirect() });
    }
    if (view.data === "names") {
      return internalApiJson({
        resorts: await findSkiResortNamesDirect(ids),
      });
    }
    return internalApiJson({
      ids: await findExistingSkiResortIdsDirect(ids ?? []),
    });
  } catch (error) {
    logInternalApiFailure("Failed to read ski resort data", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read data");
  }
}
