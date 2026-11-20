import type { z } from "zod";
import {
  DATA_DOCUMENT_MAX_REQUEST_BYTES,
  DataDocumentConflictError,
  dataDocumentBatchWriteSchema,
  dataDocumentKeySchema,
  dataDocumentPrefixSchema,
} from "@/server/data-documents/contract";
import {
  getDataDocumentDirect,
  listDataDocumentsDirect,
  writeDataDocumentsDirect,
} from "@/server/data-documents/repository";
import {
  internalApiError as errorResponse,
  internalApiJson as jsonResponse,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GET_QUERY_KEYS = new Set(["key", "prefix"]);

const validationDetails = (error: z.ZodError) =>
  error.issues.slice(0, 25).map(issue => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

export async function GET(request: Request) {
  const authorizationError = requireInternalApiRequest(request);
  if (authorizationError) return authorizationError;

  const searchParams = new URL(request.url).searchParams;
  if ([...searchParams.keys()].some(key => !GET_QUERY_KEYS.has(key))) {
    return errorResponse(400, "INVALID_QUERY", "Unknown query parameter");
  }

  const hasKey = searchParams.has("key");
  const hasPrefix = searchParams.has("prefix");
  if (hasKey === hasPrefix) {
    return errorResponse(
      400,
      "INVALID_QUERY",
      "Specify exactly one of key or prefix",
    );
  }

  try {
    if (hasKey) {
      const parsedKey = dataDocumentKeySchema.safeParse(
        searchParams.get("key"),
      );
      if (!parsedKey.success) {
        return errorResponse(
          400,
          "INVALID_QUERY",
          "Invalid DataDocument key",
          validationDetails(parsedKey.error),
        );
      }
      return jsonResponse(
        { document: await getDataDocumentDirect(parsedKey.data) },
        200,
      );
    }

    const parsedPrefix = dataDocumentPrefixSchema.safeParse(
      searchParams.get("prefix"),
    );
    if (!parsedPrefix.success) {
      return errorResponse(
        400,
        "INVALID_QUERY",
        "Invalid DataDocument prefix",
        validationDetails(parsedPrefix.error),
      );
    }
    return jsonResponse(
      { documents: await listDataDocumentsDirect(parsedPrefix.data) },
      200,
    );
  } catch (error) {
    logInternalApiFailure("Failed to read DataDocument", error);
    return errorResponse(500, "INTERNAL_ERROR", "Unable to read DataDocument");
  }
}

export async function PUT(request: Request) {
  const authorizationError = requireInternalApiRequest(request);
  if (authorizationError) return authorizationError;

  let body: unknown;
  try {
    body = await readRequestJson(request, DATA_DOCUMENT_MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError)
      return errorResponse(error.status, error.code, error.message);
    return errorResponse(400, "INVALID_BODY", "Unable to read request body");
  }
  const parsed = dataDocumentBatchWriteSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      422,
      "INVALID_PAYLOAD",
      "Request payload failed validation",
      validationDetails(parsed.error),
    );
  }

  try {
    const documents = await writeDataDocumentsDirect(parsed.data.documents);
    return jsonResponse({ documents }, 200);
  } catch (error) {
    if (error instanceof DataDocumentConflictError) {
      return errorResponse(
        409,
        "HASH_CONFLICT",
        "One or more DataDocuments changed after they were read",
        { conflicts: error.conflicts },
      );
    }
    logInternalApiFailure("Failed to write DataDocument", error);
    return errorResponse(500, "INTERNAL_ERROR", "Unable to write DataDocument");
  }
}
