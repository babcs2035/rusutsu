"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, signIn, signOut } from "@/auth";
import type { AnonymousProof } from "@/features/corrections/anonymousCheck";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import * as direct from "@/server/community/operations";
import { normalizePhoto } from "@/server/community/photos";
import { remoteCommunity } from "@/server/community/remoteClient";
import type {
  CommunityCommand,
  CommunitySuccessPayloads,
} from "@/server/community/remoteContract";
import type { ActionResult, FeedInput, MapEntriesInput } from "./contract";

// Local image preparation only. No database writes and no third-party upload.
export async function prepareCommunityPhoto(form: FormData): Promise<
  ActionResult<{
    base64: string;
    mimeType: "image/webp";
    width: number;
    height: number;
  }>
> {
  try {
    if (process.env.NODE_ENV !== "development" && !(await auth())?.user?.id)
      throw new Error("Googleでログインしてから写真を追加してください。");
    if (
      !(form instanceof FormData) ||
      [...form.keys()].some(key => key !== "photo") ||
      form.getAll("photo").length !== 1
    )
      throw new Error("写真を1枚選択してください。");
    const file = form.get("photo");
    if (!(file instanceof File)) throw new Error("写真を選択してください。");
    const normalized = await normalizePhoto(file);
    return {
      ok: true,
      data: {
        base64: normalized.bytes.toString("base64"),
        mimeType: "image/webp",
        width: normalized.width,
        height: normalized.height,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "写真を読み込めませんでした。",
    };
  }
}

async function execute<K extends keyof CommunitySuccessPayloads>(
  command: Extract<CommunityCommand, { operation: K }> & { operation: K },
  local: () => Promise<ActionResult<CommunitySuccessPayloads[K]>>,
  photos?: FormData,
): Promise<ActionResult<CommunitySuccessPayloads[K]>> {
  if (!usesRemoteDataApi()) return local();
  const result = await remoteCommunity<K>(command, photos);
  const operation = (command as { operation: K }).operation;
  if (
    result.ok &&
    ![
      "courses",
      "feed",
      "mapEntries",
      "mapSummary",
      "account",
      "detail",
      "publicProfile",
      "notifications",
    ].includes(operation)
  )
    revalidatePath("/", "layout");
  return result;
}

export async function startCommunityLogin(returnTo: string) {
  const destination = new URL(
    z.string().max(1500).parse(returnTo),
    "https://return.invalid",
  );
  if (
    destination.origin !== "https://return.invalid" ||
    // サイト内の画面（スキー場の詳細など）にだけ戻す
    !/^\/rusutsu(\/|$)/.test(destination.pathname)
  )
    throw new Error("ログイン先を確認してください。");
  await signIn("google", {
    redirectTo: `${destination.pathname}${destination.search}`,
  });
}

export async function getCommunityFeed(input: FeedInput) {
  return execute({ operation: "feed", input }, () =>
    direct.getCommunityFeed(input),
  );
}
export async function getCommunityMapEntries(input: MapEntriesInput) {
  return execute({ operation: "mapEntries", input }, () =>
    direct.getCommunityMapEntries(input),
  );
}
export async function getCommunityMapSummary(resortId: string) {
  return execute({ operation: "mapSummary", resortId }, () =>
    direct.getCommunityMapSummary(resortId),
  );
}
export async function getCommunityAccount() {
  return execute({ operation: "account" }, direct.getCommunityAccount);
}
export async function saveCommunityProfile(
  mode: "GOOGLE" | "NICKNAME" | "ANONYMOUS",
  nickname: string,
) {
  return execute({ operation: "profile", mode, nickname }, () =>
    direct.saveCommunityProfile(mode, nickname),
  );
}
export async function publishReport(input: unknown, photos: FormData) {
  // Runtime validation stays on both sides of the network boundary.
  const { commandSchema } = await import("@/server/community/remoteContract");
  const command = commandSchema.safeParse({ operation: "publish", input });
  if (!command.success)
    return {
      ok: false as const,
      error: command.error.issues[0]?.message ?? "入力を確認してください。",
    };
  if (command.data.operation !== "publish")
    throw new Error("Invalid operation");
  return execute(
    command.data,
    () => direct.publishReport(input, photos),
    photos,
  );
}
export async function updateReport(
  postId: string,
  version: number,
  input: unknown,
  photos: FormData,
  removePhotoIds: string[],
) {
  const { commandSchema } = await import("@/server/community/remoteContract");
  const command = commandSchema.safeParse({
    operation: "update",
    input: { postId, version, report: input, removePhotoIds },
  });
  if (!command.success)
    return {
      ok: false as const,
      error: command.error.issues[0]?.message ?? "入力を確認してください。",
    };
  if (command.data.operation !== "update") throw new Error("Invalid operation");
  return execute(
    command.data,
    () => direct.updateReport(postId, version, input, photos, removePhotoIds),
    photos,
  );
}
export async function deletePost(postId: string, version: number) {
  return execute({ operation: "deletePost", postId, version }, () =>
    direct.deletePost(postId, version),
  );
}
export async function getPostDetail(postId: string) {
  return execute({ operation: "detail", postId }, () =>
    direct.getPostDetail(postId),
  );
}
export async function setPostLike(postId: string, liked: boolean) {
  return execute({ operation: "like", postId, liked }, () =>
    direct.setPostLike(postId, liked),
  );
}
export async function saveComment(
  postId: string,
  body: string,
  operationKey: string,
  commentId?: string,
  version?: number,
) {
  return execute(
    { operation: "comment", postId, body, operationKey, commentId, version },
    () => direct.saveComment(postId, body, operationKey, commentId, version),
  );
}
export async function deleteComment(commentId: string, version: number) {
  return execute({ operation: "deleteComment", commentId, version }, () =>
    direct.deleteComment(commentId, version),
  );
}
export async function reportCommunityContent(
  targetKind: "POST" | "COMMENT",
  targetId: string,
  reason: string,
  body: string,
  proof?: AnonymousProof,
) {
  const { commandSchema } = await import("@/server/community/remoteContract");
  const command = commandSchema.safeParse({
    operation: "report",
    targetKind,
    targetId,
    reason,
    body,
    proof,
  });
  if (!command.success)
    return {
      ok: false as const,
      error: command.error.issues[0]?.message ?? "入力を確認してください。",
    };
  if (command.data.operation !== "report") throw new Error("Invalid operation");
  return execute(command.data, () =>
    direct.reportCommunityContent(targetKind, targetId, reason, body, proof),
  );
}
export async function getPublicProfile(userId: string) {
  return execute({ operation: "publicProfile", userId }, () =>
    direct.getPublicProfile(userId),
  );
}
export async function getNotifications() {
  return execute({ operation: "notifications" }, direct.getNotifications);
}
export async function markNotificationsRead() {
  return execute(
    { operation: "readNotifications" },
    direct.markNotificationsRead,
  );
}
export async function deleteCommunityAccount(confirm: "削除") {
  const result = await execute({ operation: "deleteAccount", confirm }, () =>
    direct.deleteCommunityAccount(confirm),
  );
  if (result.ok) await signOut({ redirect: false });
  return result;
}
