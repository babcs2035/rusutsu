import path from "node:path";
import { z } from "zod";
import {
  listResortIdsWithLatestStatus,
  loadLatestSuccessfulStatus,
} from "@/lib/latestStatusFiles";
import {
  findCurrentCrawlLatestStatusDirect,
  listCurrentCrawlLatestResortIdsDirect,
} from "@/server/crawl-latest/current";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPORARY_ROOT = path.join(
  process.cwd(),
  "src",
  "private",
  "data",
  "resorts-temporary",
);

const resortIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const kindSchema = z.enum(["courses", "lifts"]);
const viewSchema = z.enum(["status", "resortIds"]);

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
    if (view.data === "resortIds") {
      if (searchParams.has("resortId")) {
        return internalApiError(
          400,
          "INVALID_QUERY",
          "resortId is not allowed for this view",
        );
      }
      const [databaseIds, bundledIds] = await Promise.all([
        listCurrentCrawlLatestResortIdsDirect(kind.data),
        listResortIdsWithLatestStatus(TEMPORARY_ROOT),
      ]);
      return internalApiJson({
        resortIds: [
          ...new Set([...databaseIds, ...bundledIds[kind.data]]),
        ].sort(),
      });
    }

    const resortId = resortIdSchema.safeParse(searchParams.get("resortId"));
    if (!resortId.success) {
      return internalApiError(400, "INVALID_QUERY", "resortId is required");
    }
    const databaseStatus = await findCurrentCrawlLatestStatusDirect(
      resortId.data,
      kind.data,
    );
    return internalApiJson({
      status:
        databaseStatus ??
        (await loadLatestSuccessfulStatus(
          TEMPORARY_ROOT,
          resortId.data,
          kind.data,
        )),
    });
  } catch (error) {
    logInternalApiFailure("Failed to read current crawl data", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read data");
  }
}
