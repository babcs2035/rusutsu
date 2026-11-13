import "server-only";
import { z } from "zod";
import { auth } from "@/auth";
import type { ActionResult } from "@/features/community/contract";
import { reportHttpError } from "@/features/community/submitReport";
import {
  fetchInternalDataApi,
  InternalDataApiError,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import { communityPhotoResponse } from "./photoResponse";
import type { PhotoPreviewSize } from "./photos";
import { anonymousSubmissionKey, reactionIdentity } from "./rateLimit";
import {
  COMMUNITY_API_PATH,
  type CommunityCommand,
  type CommunitySuccessPayloads,
  commandSchema,
  MAX_COMMAND_JSON_BYTES,
  successPayloadSchemas,
} from "./remoteContract";

async function remoteRequest(command: CommunityCommand, photos?: FormData) {
  // Do not accept a user ID, email, role or Google identity from the browser.
  const session = command.operation === "correction" ? null : await auth();
  const id = session?.user?.id;
  const account = id
    ? await prisma.account.findFirst({
        where: { userId: id, provider: "google" },
        select: { providerAccountId: true },
      })
    : null;
  if (id && !account)
    throw new Error(
      "Googleアカウントの本人確認ができません。再ログインしてください。",
    );
  // 写真はCookieを読めない経路からも取得するので、リアクションの識別子を付けない
  const reaction =
    id || command.operation === "photo" || command.operation === "correction"
      ? null
      : await reactionIdentity(command.operation === "react");
  const payload = JSON.stringify({
    command: commandSchema.parse(command),
    googleAccountId: account?.providerAccountId ?? null,
    ...(command.operation === "report" ||
    command.operation === "correction" ||
    (command.operation === "react" && !id)
      ? { anonymousIdentity: await anonymousSubmissionKey("rate-limit") }
      : {}),
    ...(command.operation === "correction"
      ? {
          submissionKey: await anonymousSubmissionKey(
            command.input.operationKey,
          ),
        }
      : {}),
    ...(reaction ? { reactionIdentity: reaction } : {}),
  });
  if (Buffer.byteLength(payload) > MAX_COMMAND_JSON_BYTES)
    throw new Error("投稿の入力が大きすぎます。");
  let body: BodyInit = payload;
  if (photos) {
    const form = new FormData();
    form.set("command", payload);
    const files = [...photos.entries()];
    if (
      files.length > (command.operation === "correction" ? 3 : 1) ||
      files.some(
        ([key, file]) =>
          !(command.operation === "correction"
            ? key === "photos"
            : /^photos:[a-f0-9-]{36}$/i.test(key)) ||
          !(file instanceof File) ||
          !file.size ||
          file.size > 8 * 1024 * 1024,
      )
    )
      throw new Error(
        command.operation === "correction"
          ? "写真は1枚8MB以内、3枚までです。"
          : "写真は1枚8MB以内、投稿ごとに1枚までです。",
      );
    for (const [key, file] of files) form.append(key, file);
    body = form;
  }
  const response = await fetchInternalDataApi(
    COMMUNITY_API_PATH,
    {
      method: "POST",
      ...(photos ? {} : { headers: { "Content-Type": "application/json" } }),
      body,
    },
    {
      acceptedErrorStatuses: [
        400, 401, 403, 404, 405, 408, 409, 413, 415, 422, 500, 503,
      ],
    },
  );
  if (!response.ok) {
    // A missing/hidden photo is deliberately indistinguishable from no photo.
    if (command.operation === "photo" && response.status === 404)
      return response;
    if (!response.headers.get("content-type")?.includes("application/json")) {
      void response.body?.cancel().catch(() => {});
      throw new InternalDataApiError(
        reportHttpError(response.status),
        response.status,
      );
    }
    const error = await response.json().catch(() => null);
    const message =
      (response.status === 404 || response.status === 405) &&
      error?.error?.code !== "NOT_FOUND"
        ? "接続先が投稿APIに未対応です。今回の変更を本番サーバーにも反映してください。"
        : command.operation === "correction" &&
            error?.error?.code === "INVALID_COMMAND"
          ? "接続先が情報修正APIに未対応です。今回の変更を本番サーバーにも反映してください。"
          : typeof error?.error?.message === "string"
            ? error.error.message
            : "投稿APIからデータを取得できませんでした。";
    throw new InternalDataApiError(message, response.status);
  }
  return response;
}

export async function remoteCommunity<K extends keyof CommunitySuccessPayloads>(
  command: Extract<CommunityCommand, { operation: K }> & { operation: K },
  photos?: FormData,
): Promise<ActionResult<CommunitySuccessPayloads[K]>> {
  const startedAt = Date.now();
  try {
    const response = await remoteRequest(command, photos);
    const operation = (command as { operation: K }).operation;
    const schema = z.strictObject({
      result: z.discriminatedUnion("ok", [
        z.strictObject({
          ok: z.literal(true),
          data: successPayloadSchemas[operation],
        }),
        z.strictObject({
          ok: z.literal(false),
          error: z.string(),
          challenge: z
            .strictObject({ token: z.string(), difficulty: z.number().int() })
            .optional(),
        }),
      ]),
    });
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success)
      throw new InternalDataApiError("投稿APIの応答形式が不正です。", 502);
    return parsed.data.result as ActionResult<CommunitySuccessPayloads[K]>;
  } catch (error) {
    if (error instanceof InternalDataApiError)
      console.warn("Community API request failed", {
        operation: (command as { operation: K }).operation,
        elapsedMs: Date.now() - startedAt,
        status: error.status,
      });
    return {
      ok: false,
      error:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "入力を確認してください。")
          : error instanceof Error && !("code" in error)
            ? error.message
            : "投稿APIへ接続できませんでした。",
    };
  }
}

export async function getCommunityPhoto(
  photoId: string,
  size?: PhotoPreviewSize,
): Promise<Response> {
  if (!usesRemoteDataApi()) return communityPhotoResponse(photoId, size);
  try {
    const response = await remoteRequest({
      operation: "photo",
      photoId,
      ...(size ? { size } : {}),
    });
    if (response.status === 404) return new Response(null, { status: 404 });
    if (response.headers.get("content-type") !== "image/webp")
      return new Response(null, { status: 502 });
    return new Response(response.body, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": 'inline; filename="photo.webp"',
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
