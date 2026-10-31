import { z } from "zod";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import { withInternalCommunityActor } from "@/server/community/actorContext";
import * as operations from "@/server/community/operations";
import { communityPhotoResponse } from "@/server/community/photoResponse";
import {
  type CommunityCommand,
  MAX_COMMAND_JSON_BYTES,
  MAX_MULTIPART_BYTES,
  requestSchema,
} from "@/server/community/remoteContract";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import {
  RequestBodyError,
  readRequestBytes,
  readRequestJson,
} from "@/server/readRequestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publicOperations = new Set<CommunityCommand["operation"]>([
  "courses",
  "feed",
  "mapEntries",
  "mapSummary",
  "detail",
  "publicProfile",
  "report",
  "photo",
]);

async function readCommand(request: Request) {
  const photos = new FormData();
  if (request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
    const bytes = await readRequestBytes(request, MAX_MULTIPART_BYTES);
    let form: FormData;
    try {
      form = await new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": request.headers.get("content-type") as string,
        },
      }).formData();
    } catch {
      throw new RequestBodyError(
        400,
        "INVALID_BODY",
        "写真の送信形式が不正です。",
      );
    }
    if (
      [...form.keys()].some(
        key => key !== "command" && !/^photos:[a-f0-9-]{36}$/i.test(key),
      ) ||
      form.getAll("command").length !== 1
    )
      throw new RequestBodyError(
        422,
        "INVALID_COMMAND",
        "投稿の入力形式が不正です。",
      );
    const text = form.get("command");
    if (
      typeof text !== "string" ||
      Buffer.byteLength(text) > MAX_COMMAND_JSON_BYTES
    )
      throw new RequestBodyError(
        413,
        "PAYLOAD_TOO_LARGE",
        "投稿の入力が大きすぎます。",
      );
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new RequestBodyError(
        400,
        "INVALID_JSON",
        "投稿の入力形式が不正です。",
      );
    }
    const parsed = requestSchema.parse(payload);
    if (
      parsed.command.operation !== "publish" &&
      parsed.command.operation !== "update"
    )
      throw new RequestBodyError(
        422,
        "INVALID_COMMAND",
        "この操作には写真を送信できません。",
      );
    const files = [...form.entries()].filter(([key]) => key !== "command");
    if (
      files.length > 1 ||
      files.some(
        ([, file]) =>
          !(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024,
      )
    )
      throw new RequestBodyError(
        413,
        "PAYLOAD_TOO_LARGE",
        "写真は1枚8MB以内、投稿ごとに1枚までです。",
      );
    for (const [key, file] of files) photos.append(key, file);
    return { parsed, photos };
  }
  return {
    parsed: requestSchema.parse(
      await readRequestJson(request, MAX_COMMAND_JSON_BYTES),
    ),
    photos,
  };
}

async function dispatch(
  command: Exclude<CommunityCommand, { operation: "photo" }>,
  photos: FormData,
) {
  switch (command.operation) {
    case "courses":
      return operations.getCommunityCourses(command.resortId);
    case "feed":
      return operations.getCommunityFeed(command.input);
    case "mapEntries":
      return operations.getCommunityMapEntries(command.input);
    case "mapSummary":
      return operations.getCommunityMapSummary(command.resortId);
    case "account":
      return operations.getCommunityAccount();
    case "profile":
      return operations.saveCommunityProfile(command.mode, command.nickname);
    case "publish":
      return operations.publishReport(command.input, photos);
    case "update":
      return operations.updateReport(
        command.input.postId,
        command.input.version,
        command.input.report,
        photos,
        command.input.removePhotoIds,
      );
    case "deletePost":
      return operations.deletePost(command.postId, command.version);
    case "detail":
      return operations.getPostDetail(command.postId);
    case "like":
      return operations.setPostLike(command.postId, command.liked);
    case "comment":
      return operations.saveComment(
        command.postId,
        command.body,
        command.operationKey,
        command.commentId,
        command.version,
      );
    case "deleteComment":
      return operations.deleteComment(command.commentId, command.version);
    case "report":
      return operations.reportCommunityContent(
        command.targetKind,
        command.targetId,
        command.reason,
        command.body,
        command.proof,
      );
    case "publicProfile":
      return operations.getPublicProfile(command.userId);
    case "notifications":
      return operations.getNotifications();
    case "readNotifications":
      return operations.markNotificationsRead();
    case "deleteAccount":
      return operations.deleteCommunityAccount(command.confirm);
  }
}

export async function POST(request: Request) {
  const denied = requireInternalApiRequest(request, "admin-data");
  if (denied) return denied;
  if (usesRemoteDataApi())
    return internalApiError(
      503,
      "WRONG_SERVER",
      "公開データを保持するサーバーへ接続してください。",
    );
  try {
    const { parsed, photos } = await readCommand(request);
    const { command, googleAccountId, anonymousIdentity } = parsed;
    let userId: string | null = null;
    if (googleAccountId) {
      const account = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: googleAccountId,
          },
        },
        select: { userId: true },
      });
      userId = account?.userId ?? null;
      if (!userId && !publicOperations.has(command.operation))
        return internalApiError(
          403,
          "UNKNOWN_ACTOR",
          "このGoogleアカウントで本番サイトに一度ログインしてください。その後、ローカルから投稿できます。",
        );
    } else if (
      command.operation !== "account" &&
      !publicOperations.has(command.operation)
    ) {
      return internalApiError(
        401,
        "LOGIN_REQUIRED",
        "Googleでログインしてから投稿してください。",
      );
    }
    if (command.operation === "report" && !anonymousIdentity)
      return internalApiError(
        422,
        "MISSING_IDENTITY",
        "送信元の確認に失敗しました。",
      );
    return await withInternalCommunityActor(
      { userId, anonymousIdentity },
      async () => {
        if (command.operation === "photo")
          return communityPhotoResponse(command.photoId, command.size);
        return internalApiJson({ result: await dispatch(command, photos) });
      },
    );
  } catch (error) {
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    if (error instanceof z.ZodError)
      return internalApiError(
        422,
        "INVALID_COMMAND",
        "投稿操作の入力形式が不正です。",
      );
    logInternalApiFailure("Community API failed", error);
    return internalApiError(
      500,
      "INTERNAL_ERROR",
      "投稿データを処理できませんでした。接続先のDB更新状況を確認してください。",
    );
  }
}
