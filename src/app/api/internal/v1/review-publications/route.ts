import { ZodError } from "zod";
import { publishReview } from "@/features/review/server/publication";
import { reviewPublicationSchema } from "@/features/review/server/publicationContract";
import { DataDocumentConflictError } from "@/server/data-documents/contract";
import {
  getDataDocumentDirect,
  listDataDocumentsDirect,
  writeDataDocumentsDirect,
} from "@/server/data-documents/repository";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";
import { findExistingSkiResortIdsDirect } from "@/server/ski-resorts/repository";

export const runtime = "nodejs";
export async function PUT(request: Request) {
  const denied = requireInternalApiRequest(request, "admin-data");
  if (denied) return denied;
  try {
    const publication = reviewPublicationSchema.parse(
      await readRequestJson(request, 6 * 1024 * 1024),
    );
    if (
      !(await findExistingSkiResortIdsDirect([publication.content.resortId]))
        .length
    )
      return internalApiError(404, "NOT_FOUND", "スキー場IDが存在しません。");
    const documents = await publishReview(
      {
        getDataDocument: getDataDocumentDirect,
        listDataDocuments: listDataDocumentsDirect,
        writeDataDocuments: writeDataDocumentsDirect,
      },
      publication,
    );
    return internalApiJson({ documents });
  } catch (error) {
    if (error instanceof ZodError)
      return internalApiError(
        422,
        "INVALID_REVIEW",
        error.issues
          .map(issue => `${issue.path.join(".")}: ${issue.message}`)
          .slice(0, 12)
          .join("\n"),
      );
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    if (error instanceof DataDocumentConflictError)
      return internalApiError(
        409,
        "HASH_CONFLICT",
        "本番データが変更されています。差分を確認し直してください。",
      );
    logInternalApiFailure("Review publication failed", error);
    return internalApiError(
      500,
      "INTERNAL_ERROR",
      "レビューを保存できませんでした。",
    );
  }
}
