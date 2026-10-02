import "server-only";
import { auth } from "@/auth";
import {
  fetchInternalDataApi,
  InternalDataApiError,
} from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import {
  EDIT_REQUESTS_API_PATH,
  type EditRequestApiOperation,
} from "./remoteContract";

// The browser cannot choose this identity. It comes from the signed-in local
// user and the Google account linked by Auth.js. IDs can differ between DBs.
export async function callRemoteEditRequests(command: EditRequestApiOperation) {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new Error("ログインが必要です。");
  const account = await prisma.account.findFirst({
    where: { userId: id, provider: "google" },
    select: { providerAccountId: true },
  });
  if (!account)
    throw new Error(
      "Googleアカウントの本人確認ができません。再ログインしてください。",
    );
  const response = await fetchInternalDataApi(
    EDIT_REQUESTS_API_PATH,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...command,
        googleAccountId: account.providerAccountId,
      }),
    },
    { acceptedErrorStatuses: [400, 403, 404, 405, 409, 413, 422, 503] },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (response.status === 404 || response.status === 405) &&
      body?.error?.code !== "NOT_FOUND"
        ? "接続先サーバーが申請APIに未対応です。今回の変更をサーバーにも反映してください。"
        : typeof body?.error?.message === "string"
          ? body.error.message
          : "サーバーの申請データを取得できませんでした。";
    throw new InternalDataApiError(message, response.status);
  }
  if (!body || typeof body !== "object" || !("result" in body))
    throw new InternalDataApiError(
      "申請APIの応答形式が不正です。",
      response.status,
    );
  return body.result as unknown;
}

export async function remoteEditRequestResult<T>(
  command: EditRequestApiOperation,
  schema: { parse(value: unknown): T },
) {
  const result = await callRemoteEditRequests(command);
  try {
    return schema.parse(result);
  } catch {
    throw new InternalDataApiError("申請APIの応答形式が不正です。", 502);
  }
}
