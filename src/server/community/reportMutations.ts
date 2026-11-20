/** 写真付きの投稿・編集を，既存の認可と direct/remote への振り分けで実行する． */
import "server-only";
import { executeCommunityOperation as execute } from "@/server/community/dispatch";
import * as direct from "@/server/community/operations";

/** 入力を検証して既存の冪等キーと写真を保存処理へ渡す． */
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
/** version と写真の削除対象を含めて編集を確定する． */
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
