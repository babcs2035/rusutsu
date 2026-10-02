import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  approveEditRequest,
  rejectEditRequest,
  saveRequestCandidate,
  withdrawEditRequest,
} from "@/features/edit-requests/actions";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/requireEditor";
import { withInternalEditActor } from "@/server/edit-requests/actorContext";
import { assertBoundedPayload } from "@/server/edit-requests/contract";
import { validateEditPayload } from "@/server/edit-requests/payloadSchema";
import { dispatchEdit } from "@/server/edit-requests/prepare";
import {
  EDIT_REQUEST_API_MAX_BYTES,
  editRequestApiCommandSchema,
} from "@/server/edit-requests/remoteContract";
import {
  getEditRequest,
  listEditRequests,
} from "@/server/edit-requests/repository";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = requireInternalApiRequest(request, "admin-data");
  if (denied) return denied;
  // This endpoint must operate at the server owning the canonical database.
  if (usesRemoteDataApi())
    return internalApiError(
      503,
      "WRONG_SERVER",
      "公開データを保持するサーバーへ接続してください。",
    );
  try {
    const command = editRequestApiCommandSchema.parse(
      await readRequestJson(request, EDIT_REQUEST_API_MAX_BYTES),
    );
    const account = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: command.googleAccountId,
        },
      },
      select: { userId: true },
    });
    if (!account)
      return internalApiError(
        403,
        "UNKNOWN_ACTOR",
        "このGoogleアカウントは接続先サーバーに登録されていません。サーバー側でログインして権限を設定してください。",
      );
    const result = await withInternalEditActor(account.userId, async () => {
      await requireEditor();
      switch (command.operation) {
        case "list":
          return listEditRequests();
        case "get":
          return getEditRequest(command.id);
        case "edit":
          assertBoundedPayload(command.payload);
          validateEditPayload(command.kind, command.payload);
          {
            const result = await dispatchEdit(command.kind, command.payload);
            if (result.ok && !result.submission) revalidatePath("/", "layout");
            return result;
          }
        case "revise":
          return saveRequestCandidate(
            command.id,
            command.version,
            command.payload,
            command.comment,
          );
        case "approve":
          return approveEditRequest(command.id, command.version);
        case "reject":
          return rejectEditRequest(
            command.id,
            command.version,
            command.comment,
          );
        case "withdraw":
          return withdrawEditRequest(command.id, command.version);
      }
    });
    return internalApiJson({ result });
  } catch (error) {
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    if (error instanceof z.ZodError)
      return internalApiError(
        422,
        "INVALID_COMMAND",
        "申請操作の入力形式が不正です。",
      );
    logInternalApiFailure("Edit request API failed", error);
    return internalApiError(
      403,
      "REQUEST_DENIED",
      "申請操作を実行できません。権限と対象の状態を確認してください。",
    );
  }
}
