"use server";

import { z } from "zod";
import { auth, signIn, signOut } from "@/auth";
import type { AnonymousProof } from "@/features/corrections/anonymousCheck";
import { executeCommunityOperation as execute } from "@/server/community/dispatch";
import * as direct from "@/server/community/operations";
import { normalizePhoto } from "@/server/community/photos";
import type { ActionResult } from "./contract";

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

export async function setPostReaction(
  postId: string,
  kind: string,
  active: boolean,
  proof?: AnonymousProof,
) {
  const { commandSchema } = await import("@/server/community/remoteContract");
  const command = commandSchema.safeParse({
    operation: "react",
    postId,
    kind,
    active,
    proof,
  });
  if (!command.success)
    return {
      ok: false as const,
      error: command.error.issues[0]?.message ?? "入力を確認してください。",
    };
  if (command.data.operation !== "react") throw new Error("Invalid operation");
  return execute(command.data, () =>
    direct.setPostReaction(postId, kind, active, proof),
  );
}

export async function reportCommunityContent(
  targetId: string,
  reason: string,
  body: string,
  proof?: AnonymousProof,
) {
  const { commandSchema } = await import("@/server/community/remoteContract");
  const command = commandSchema.safeParse({
    operation: "report",
    targetKind: "POST",
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
    direct.reportCommunityContent(targetId, reason, body, proof),
  );
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
