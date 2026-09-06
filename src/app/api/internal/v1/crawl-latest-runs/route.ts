import { after } from "next/server";
import { z } from "zod";
import { maybeCollectOrphanedCrawlLatestArtifacts } from "@/server/crawl-latest/artifactGarbageCollector";
import {
  CRAWL_LATEST_MAX_BODY_BYTES,
  crawlLatestResortIdSchema,
  crawlLatestRunIdSchema,
  crawlLatestRunInputSchema,
  idempotencyKeySchema,
  sourceModeSchema,
} from "@/server/crawl-latest/contract";
import {
  CrawlLatestIdempotencyConflictError,
  CrawlLatestResortNotFoundError,
  getCrawlLatestArtifact,
  getCrawlLatestRun,
  listCrawlLatestRuns,
  persistCrawlLatestRun,
} from "@/server/crawl-latest/persistence";
import { requireInternalApiRequest } from "@/server/internalApiHttp";
import { RequestBodyError, readRequestText } from "@/server/readRequestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_CONTENT_TYPE = "application/json";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Vary: "Authorization",
} as const;
const RUN_INCLUDES = new Set([
  "rawPayload",
  "categoryData",
  "issues",
  "artifacts",
]);
const GET_QUERY_KEYS = new Set([
  "runId",
  "artifactId",
  "resortId",
  "sourceMode",
  "limit",
  "include",
]);

const jsonResponse = (
  body: unknown,
  status: number,
  headers?: Record<string, string>,
) =>
  Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });

const errorResponse = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers?: Record<string, string>,
) =>
  jsonResponse(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
    headers,
  );

const authorize = requireInternalApiRequest;

const mediaType = (contentType: string | null) =>
  contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";

const requestBodyTooLarge = (request: Request): boolean => {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return false;
  const length = Number(rawLength);
  return Number.isFinite(length) && length > CRAWL_LATEST_MAX_BODY_BYTES;
};

const safeErrorMetadata = (error: unknown) => {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  return { name: error.name, ...(code ? { code } : {}) };
};

export async function POST(request: Request) {
  const authorizationError = authorize(request, "crawler-ingest");
  if (authorizationError) return authorizationError;

  if (mediaType(request.headers.get("content-type")) !== JSON_CONTENT_TYPE) {
    return errorResponse(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json",
    );
  }
  if (requestBodyTooLarge(request)) {
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }

  const idempotency = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key"),
  );
  if (!idempotency.success) {
    return errorResponse(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "A valid Idempotency-Key header is required",
    );
  }

  let bodyText: string;
  try {
    bodyText = await readRequestText(request, CRAWL_LATEST_MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError)
      return errorResponse(error.status, error.code, error.message);
    return errorResponse(400, "INVALID_BODY", "Unable to read request body");
  }
  if (Buffer.byteLength(bodyText, "utf8") > CRAWL_LATEST_MAX_BODY_BYTES) {
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }

  let untrustedBody: unknown;
  try {
    untrustedBody = JSON.parse(bodyText) as unknown;
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body is not valid JSON");
  }

  const parsed = crawlLatestRunInputSchema.safeParse(untrustedBody);
  if (!parsed.success) {
    return errorResponse(
      422,
      "INVALID_PAYLOAD",
      "Request payload failed validation",
      parsed.error.issues.slice(0, 25).map(issue => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  try {
    const result = await persistCrawlLatestRun(parsed.data, idempotency.data);
    after(async () => {
      try {
        await maybeCollectOrphanedCrawlLatestArtifacts();
      } catch (error) {
        console.error(
          "Crawler artifact cleanup failed",
          safeErrorMetadata(error),
        );
      }
    });
    return jsonResponse(result, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof CrawlLatestResortNotFoundError) {
      return errorResponse(404, "RESORT_NOT_FOUND", "Ski resort was not found");
    }
    if (error instanceof CrawlLatestIdempotencyConflictError) {
      return errorResponse(
        409,
        "IDEMPOTENCY_CONFLICT",
        "Idempotency-Key was already used for another request",
      );
    }
    console.error(
      "Failed to persist crawl_latest run",
      safeErrorMetadata(error),
    );
    return errorResponse(500, "INTERNAL_ERROR", "Unable to persist crawl run");
  }
}

const parseIncludes = (raw: string | null) => {
  const values = raw
    ? raw
        .split(",")
        .map(value => value.trim())
        .filter(Boolean)
    : [];
  const invalid = values.filter(value => !RUN_INCLUDES.has(value));
  if (invalid.length > 0) return null;
  const included = new Set(values);
  return {
    rawPayload: included.has("rawPayload"),
    categoryData: included.has("categoryData"),
    issues: included.has("issues"),
    artifacts: included.has("artifacts"),
  };
};

const hasUnknownQuery = (searchParams: URLSearchParams) =>
  [...searchParams.keys()].some(key => !GET_QUERY_KEYS.has(key));

export async function GET(request: Request) {
  const authorizationError = authorize(request, "diagnostics-read");
  if (authorizationError) return authorizationError;

  const searchParams = new URL(request.url).searchParams;
  if (hasUnknownQuery(searchParams)) {
    return errorResponse(400, "INVALID_QUERY", "Unknown query parameter");
  }

  const runId = searchParams.get("runId");
  const artifactId = searchParams.get("artifactId");
  const resortId = searchParams.get("resortId");
  const selectorCount = [runId, artifactId, resortId].filter(Boolean).length;
  if (selectorCount !== 1) {
    return errorResponse(
      400,
      "INVALID_QUERY",
      "Specify exactly one of runId, artifactId, or resortId",
    );
  }

  try {
    if (artifactId) {
      if (
        !crawlLatestRunIdSchema.safeParse(artifactId).success ||
        searchParams.has("include") ||
        searchParams.has("sourceMode") ||
        searchParams.has("limit")
      ) {
        return errorResponse(400, "INVALID_QUERY", "Invalid artifact query");
      }
      const artifact = await getCrawlLatestArtifact(artifactId);
      return artifact
        ? jsonResponse({ artifact }, 200)
        : errorResponse(404, "ARTIFACT_NOT_FOUND", "Artifact was not found");
    }

    if (runId) {
      const includes = parseIncludes(searchParams.get("include"));
      if (
        !crawlLatestRunIdSchema.safeParse(runId).success ||
        includes === null ||
        searchParams.has("sourceMode") ||
        searchParams.has("limit")
      ) {
        return errorResponse(400, "INVALID_QUERY", "Invalid run query");
      }
      const run = await getCrawlLatestRun(runId, includes);
      return run
        ? jsonResponse({ run }, 200)
        : errorResponse(404, "RUN_NOT_FOUND", "Crawl run was not found");
    }

    const parsedResortId = crawlLatestResortIdSchema.safeParse(resortId);
    const parsedSourceMode = searchParams.has("sourceMode")
      ? sourceModeSchema.safeParse(searchParams.get("sourceMode"))
      : null;
    const parsedLimit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .safeParse(searchParams.get("limit") ?? 20);
    if (
      !parsedResortId.success ||
      (parsedSourceMode && !parsedSourceMode.success) ||
      !parsedLimit.success ||
      searchParams.has("include")
    ) {
      return errorResponse(400, "INVALID_QUERY", "Invalid resort run query");
    }
    const runs = await listCrawlLatestRuns({
      resortId: parsedResortId.data,
      sourceMode: parsedSourceMode?.data,
      limit: parsedLimit.data,
    });
    return jsonResponse({ runs }, 200);
  } catch (error) {
    console.error("Failed to read crawl_latest data", safeErrorMetadata(error));
    return errorResponse(500, "INTERNAL_ERROR", "Unable to read crawl data");
  }
}
