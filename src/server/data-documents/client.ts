import "server-only";

import {
  fetchInternalDataApi,
  InternalDataApiError,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import {
  captureDocumentWrites,
  capturedDocument,
  recordDocument,
} from "@/server/edit-requests/capture";
import {
  DataDocumentConflictError,
  type DataDocumentWrite,
  dataDocumentBatchWriteSchema,
  dataDocumentConflictResponseSchema,
  dataDocumentGetResponseSchema,
  dataDocumentKeySchema,
  dataDocumentListResponseSchema,
  dataDocumentPrefixSchema,
  dataDocumentWriteResponseSchema,
} from "./contract";
import {
  getDataDocumentDirect,
  listDataDocumentsDirect,
  writeDataDocumentsDirect,
} from "./repository";

const RESOURCE_PATH = "/api/internal/v1/data-documents";

const parseRemoteResponse = async <T>(
  response: Response,
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
  },
): Promise<T> => {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new InternalDataApiError(
      "正本DataDocument APIの応答がJSONではありません。",
      response.status,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new InternalDataApiError(
      "正本DataDocument APIの応答形式が不正です。",
      response.status,
    );
  }
  return parsed.data;
};

const getRemote = async (key: string) => {
  const validatedKey = dataDocumentKeySchema.parse(key);
  const query = new URLSearchParams({ key: validatedKey });
  const response = await fetchInternalDataApi(`${RESOURCE_PATH}?${query}`);
  return (await parseRemoteResponse(response, dataDocumentGetResponseSchema))
    .document;
};

const listRemote = async (prefix: string) => {
  const validatedPrefix = dataDocumentPrefixSchema.parse(prefix);
  const query = new URLSearchParams({ prefix: validatedPrefix });
  const response = await fetchInternalDataApi(`${RESOURCE_PATH}?${query}`);
  return (await parseRemoteResponse(response, dataDocumentListResponseSchema))
    .documents;
};

const writeRemote = async (documents: readonly DataDocumentWrite[]) => {
  const payload = dataDocumentBatchWriteSchema.parse({ documents });
  const response = await fetchInternalDataApi(
    RESOURCE_PATH,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { acceptedErrorStatuses: [409] },
  );
  if (response.status === 409) {
    const conflict = await parseRemoteResponse(
      response,
      dataDocumentConflictResponseSchema,
    );
    throw new DataDocumentConflictError(conflict.error.details.conflicts);
  }
  return (await parseRemoteResponse(response, dataDocumentWriteResponseSchema))
    .documents;
};

/**
 * 管理画面のServer Action等が使う窓口。
 * DATA_API_BASE_URL が設定されたローカルサーバーだけremote APIを使い、
 * 未設定の本番サーバーは同じDBへ直接アクセスする。
 */
export const getDataDocument = async (key: string) => {
  const captured = capturedDocument(key);
  if (captured) return captured.document;
  const document = await (usesRemoteDataApi()
    ? getRemote(key)
    : getDataDocumentDirect(key));
  recordDocument(key, document);
  return document;
};

export const listDataDocuments = (prefix = "") =>
  usesRemoteDataApi() ? listRemote(prefix) : listDataDocumentsDirect(prefix);

export const writeDataDocuments = async (
  documents: readonly DataDocumentWrite[],
) => {
  const captured = await captureDocumentWrites(documents, getDataDocument);
  if (captured) return captured;
  return usesRemoteDataApi()
    ? writeRemote(documents)
    : writeDataDocumentsDirect(documents);
};
