import { Buffer } from "node:buffer";
import { after } from "next/server";
import { z } from "zod";
import { maybeCollectOrphanedCrawlLatestArtifacts } from "@/server/crawl-latest/artifactGarbageCollector";
import {
  ArtifactContentConflictError,
  ArtifactContentInvalidError,
  ArtifactStorageUnavailableError,
  MAX_ARTIFACT_REQUEST_BYTES,
  saveRenderedDomArtifact,
} from "@/server/crawl-latest/artifactStorage";
import {
  crawlLatestResortIdSchema,
  idempotencyKeySchema,
} from "@/server/crawl-latest/contract";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { RequestBodyError, readRequestText } from "@/server/readRequestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadSchema = z.strictObject({
  schemaVersion: z.literal(1),
  producerId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u),
  idempotencyKey: idempotencyKeySchema,
  resortId: crawlLatestResortIdSchema,
  manifestId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u),
  pageKey: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u),
  contentEncoding: z.literal("gzip"),
  contentBase64: z.string().min(1),
  htmlSha256: z.string().regex(/^[0-9a-f]{64}$/u),
});

const requestTooLarge = (request: Request) => {
  const header = request.headers.get("content-length");
  if (!header) return false;
  const value = Number(header);
  return Number.isFinite(value) && value > MAX_ARTIFACT_REQUEST_BYTES;
};

export async function POST(request: Request) {
  const authorizationError = requireInternalApiRequest(
    request,
    "crawler-ingest",
  );
  if (authorizationError) return authorizationError;
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
    "application/json"
  ) {
    return internalApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json",
    );
  }
  if (requestTooLarge(request)) {
    return internalApiError(413, "PAYLOAD_TOO_LARGE", "Request is too large");
  }

  let bodyText: string;
  try {
    bodyText = await readRequestText(request, MAX_ARTIFACT_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    return internalApiError(400, "INVALID_BODY", "Unable to read body");
  }
  if (Buffer.byteLength(bodyText, "utf8") > MAX_ARTIFACT_REQUEST_BYTES) {
    return internalApiError(413, "PAYLOAD_TOO_LARGE", "Request is too large");
  }

  let input: unknown;
  try {
    input = JSON.parse(bodyText) as unknown;
  } catch {
    return internalApiError(400, "INVALID_JSON", "Body is not valid JSON");
  }
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) {
    return internalApiError(422, "INVALID_PAYLOAD", "Payload is invalid");
  }

  const compressedHtml = Buffer.from(parsed.data.contentBase64, "base64");
  if (
    compressedHtml.length === 0 ||
    compressedHtml.toString("base64").replace(/=+$/u, "") !==
      parsed.data.contentBase64.replace(/=+$/u, "")
  ) {
    return internalApiError(422, "INVALID_PAYLOAD", "Base64 is invalid");
  }

  try {
    const artifact = await saveRenderedDomArtifact({
      producerId: parsed.data.producerId,
      idempotencyKey: parsed.data.idempotencyKey,
      resortId: parsed.data.resortId,
      manifestId: parsed.data.manifestId,
      pageKey: parsed.data.pageKey,
      compressedHtml,
      expectedHtmlSha256: parsed.data.htmlSha256,
    });
    after(async () => {
      try {
        const result = await maybeCollectOrphanedCrawlLatestArtifacts();
        if (result.status === "completed" && result.deletedCount > 0) {
          console.info(
            `Crawler artifact GC deleted ${result.deletedCount} orphaned file(s)`,
          );
        }
      } catch (error) {
        // Cleanup must never turn an accepted artifact upload into a failure.
        logInternalApiFailure("Crawler artifact GC failed", error);
      }
    });
    return internalApiJson({ artifact }, artifact.created ? 201 : 200);
  } catch (error) {
    if (error instanceof ArtifactContentInvalidError) {
      return internalApiError(422, "INVALID_ARTIFACT", error.message);
    }
    if (error instanceof ArtifactContentConflictError) {
      return internalApiError(
        409,
        "ARTIFACT_CONFLICT",
        "Artifact key contains different content",
      );
    }
    if (error instanceof ArtifactStorageUnavailableError) {
      return internalApiError(
        503,
        "ARTIFACT_STORAGE_UNAVAILABLE",
        "Artifact storage is unavailable",
      );
    }
    logInternalApiFailure("Failed to save crawler artifact", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to save artifact");
  }
}
