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
import { requireInternalApiRequest } from "@/server/internalApiHttp";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const GET_QUERY_KEYS = new Set(["key", "prefix"]);

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

const safeErrorMetadata = (error: unknown) => {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  return { name: error.name, ...(code ? { code } : {}) };
};

const validationDetails = (error: z.ZodError) =>
  error.issues.slice(0, 25).map(issue => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

export async function GET(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
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
    console.error("Failed to read DataDocument", safeErrorMetadata(error));
    return errorResponse(500, "INTERNAL_ERROR", "Unable to read DataDocument");
  }
}

export async function PUT(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
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
    console.error("Failed to write DataDocument", safeErrorMetadata(error));
    return errorResponse(500, "INTERNAL_ERROR", "Unable to write DataDocument");
  }
}
