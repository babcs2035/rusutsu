import { z } from "zod";
import {
  CRAWL_MONITOR_PAGE_SIZE,
  CRAWL_MONITOR_SOURCE_MODES,
  crawlMonitorIssueListQuerySchema,
  crawlMonitorResortIdSchema,
  crawlMonitorRunListQuerySchema,
  crawlMonitorSourceModeSchema,
} from "@/server/crawl-latest/adminContract";
import {
  fetchCrawlMonitorCurrentsDirect,
  fetchCrawlMonitorIssuesDirect,
  fetchCrawlMonitorMappingDirect,
  fetchCrawlMonitorOverviewDirect,
  fetchCrawlMonitorRunDetailDirect,
  fetchCrawlMonitorRunsDirect,
} from "@/server/crawl-latest/adminRepository";
import { CRAWL_LATEST_CATEGORY_KINDS } from "@/server/crawl-latest/contract";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 管理画面のクローラー監視が読む集計API。
 *
 * 集計は必ずDB側で行い、応答は画面に必要な最小限に絞る。ローカルNext.jsが
 * `DATA_API_BASE_URL` 越しに本番を見るときの唯一の入口でもある。
 */

const QUERY_KEYS = new Set([
  "view",
  "origin",
  "resortId",
  "runId",
  "sourceModes",
  "page",
  "pageSize",
  "severity",
  "code",
  "categoryKind",
  "blockingOnly",
  "since",
]);

const viewSchema = z.enum([
  "overview",
  "runs",
  "run",
  "currents",
  "issues",
  "mapping",
]);
// DBのrunはcuid、latest_data由来のrunは `file-2025_1123_202120` 形式。
const runIdSchema = z
  .string()
  .regex(/^(?:[a-z0-9]{20,40}|file-\d{4}_\d{4}_\d{6})$/u);
const originSchema = z.enum(["DATABASE", "FILE"]);
const pageSchema = z.coerce.number().int().min(1).max(200);
const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(CRAWL_MONITOR_PAGE_SIZE);

const parseSourceModes = (raw: string | null) => {
  if (raw === null) return [...CRAWL_MONITOR_SOURCE_MODES];
  const values = raw
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const parsed = z.array(crawlMonitorSourceModeSchema).min(1).safeParse(values);
  return parsed.success ? [...new Set(parsed.data)] : null;
};

export async function GET(request: Request) {
  const authorizationError = requireInternalApiRequest(
    request,
    "diagnostics-read",
  );
  if (authorizationError) return authorizationError;

  const searchParams = new URL(request.url).searchParams;
  if ([...searchParams.keys()].some(key => !QUERY_KEYS.has(key))) {
    return internalApiError(400, "INVALID_QUERY", "Unknown query parameter");
  }
  const view = viewSchema.safeParse(searchParams.get("view"));
  if (!view.success) {
    return internalApiError(400, "INVALID_QUERY", "Invalid view");
  }
  const sourceModes = parseSourceModes(searchParams.get("sourceModes"));
  if (sourceModes === null) {
    return internalApiError(400, "INVALID_QUERY", "Invalid sourceModes");
  }

  try {
    if (view.data === "overview") {
      return internalApiJson(
        await fetchCrawlMonitorOverviewDirect(sourceModes),
      );
    }

    if (view.data === "run") {
      const runId = runIdSchema.safeParse(searchParams.get("runId"));
      const resortId = crawlMonitorResortIdSchema.safeParse(
        searchParams.get("resortId"),
      );
      if (!runId.success || !resortId.success) {
        return internalApiError(400, "INVALID_QUERY", "Invalid run reference");
      }
      const detail = await fetchCrawlMonitorRunDetailDirect(
        resortId.data,
        runId.data,
      );
      return detail
        ? internalApiJson(detail)
        : internalApiError(404, "RUN_NOT_FOUND", "Crawl run was not found");
    }

    if (view.data === "mapping") {
      const resortId = crawlMonitorResortIdSchema.safeParse(
        searchParams.get("resortId"),
      );
      if (!resortId.success) {
        return internalApiError(400, "INVALID_QUERY", "Invalid resortId");
      }
      return internalApiJson(
        await fetchCrawlMonitorMappingDirect(resortId.data),
      );
    }

    if (view.data === "currents") {
      const resortId = crawlMonitorResortIdSchema.safeParse(
        searchParams.get("resortId"),
      );
      if (!resortId.success) {
        return internalApiError(400, "INVALID_QUERY", "Invalid resortId");
      }
      return internalApiJson(
        await fetchCrawlMonitorCurrentsDirect(resortId.data),
      );
    }

    if (view.data === "runs") {
      const query = crawlMonitorRunListQuerySchema.safeParse({
        resortId: searchParams.get("resortId"),
        origin: originSchema.safeParse(searchParams.get("origin") ?? "DATABASE")
          .data,
        sourceModes,
        page: pageSchema.safeParse(searchParams.get("page") ?? 1).data,
        pageSize: pageSizeSchema.safeParse(
          searchParams.get("pageSize") ?? CRAWL_MONITOR_PAGE_SIZE,
        ).data,
      });
      if (!query.success) {
        return internalApiError(400, "INVALID_QUERY", "Invalid run query");
      }
      return internalApiJson(await fetchCrawlMonitorRunsDirect(query.data));
    }

    const query = crawlMonitorIssueListQuerySchema.safeParse({
      severity: searchParams.get("severity"),
      code: searchParams.get("code"),
      resortId: searchParams.get("resortId"),
      categoryKind: searchParams.get("categoryKind"),
      sourceModes,
      blockingOnly: searchParams.get("blockingOnly") === "1",
      since: searchParams.get("since"),
      page: pageSchema.safeParse(searchParams.get("page") ?? 1).data,
      pageSize: pageSizeSchema.safeParse(
        searchParams.get("pageSize") ?? CRAWL_MONITOR_PAGE_SIZE,
      ).data,
    });
    if (
      !query.success ||
      (query.data.categoryKind !== null &&
        !CRAWL_LATEST_CATEGORY_KINDS.includes(query.data.categoryKind))
    ) {
      return internalApiError(400, "INVALID_QUERY", "Invalid issue query");
    }
    if (
      query.data.since !== null &&
      Number.isNaN(Date.parse(query.data.since))
    ) {
      return internalApiError(400, "INVALID_QUERY", "Invalid since");
    }
    return internalApiJson(await fetchCrawlMonitorIssuesDirect(query.data));
  } catch (error) {
    logInternalApiFailure("Failed to read crawl monitor data", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read crawl data");
  }
}
