import path from "node:path";
import { z } from "zod";
import { loadStatusHistory } from "@/lib/latestStatusFiles";
import {
  findAvailableCrawlLatestStatusDirect,
  listAvailableCrawlLatestResortIdsDirect,
} from "@/server/crawl-latest/availableStatus";
import { readAvailableConditions } from "@/server/crawl-latest/conditions";
import { listMappingStatusHistoryDirect } from "@/server/crawl-latest/current";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resortIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const kindSchema = z.enum(["courses", "lifts"]);
const viewSchema = z.enum([
  "status",
  "resortIds",
  "conditions",
  "mappingStatus",
  "mappingHistory",
  "mappingResortIds",
]);

export async function GET(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;

  const searchParams = new URL(request.url).searchParams;
  if (
    [...searchParams.keys()].some(
      key => key !== "resortId" && key !== "kind" && key !== "view",
    )
  ) {
    return internalApiError(400, "INVALID_QUERY", "Unknown query parameter");
  }
  const kind = kindSchema.safeParse(searchParams.get("kind"));
  const view = viewSchema.safeParse(searchParams.get("view"));
  if (!kind.success || !view.success) {
    return internalApiError(400, "INVALID_QUERY", "Invalid query parameter");
  }

  try {
    if (view.data === "resortIds" || view.data === "mappingResortIds") {
      if (searchParams.has("resortId")) {
        return internalApiError(
          400,
          "INVALID_QUERY",
          "resortId is not allowed for this view",
        );
      }
      return internalApiJson({
        resortIds: await listAvailableCrawlLatestResortIdsDirect(
          kind.data,
          undefined,
          undefined,
          view.data === "mappingResortIds",
        ),
      });
    }

    const resortId = resortIdSchema.safeParse(searchParams.get("resortId"));
    if (!resortId.success) {
      return internalApiError(400, "INVALID_QUERY", "resortId is required");
    }
    if (view.data === "mappingHistory") {
      const [database, bundled] = await Promise.all([
        listMappingStatusHistoryDirect(resortId.data, kind.data),
        loadStatusHistory(
          path.join(process.cwd(), "src/private/data/resorts-temporary"),
          resortId.data,
          kind.data,
        ),
      ]);
      return internalApiJson({ history: [...database, ...bundled] });
    }
    if (view.data === "conditions") {
      return internalApiJson({
        conditions: await readAvailableConditions(resortId.data),
      });
    }
    return internalApiJson({
      status: await findAvailableCrawlLatestStatusDirect(
        resortId.data,
        kind.data,
        undefined,
        undefined,
        view.data === "mappingStatus",
      ),
    });
  } catch (error) {
    logInternalApiFailure("Failed to read current crawl data", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read data");
  }
}
