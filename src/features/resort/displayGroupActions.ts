"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  deleteDisplayGroup,
  readDisplayGroups,
  saveDisplayGroup,
} from "@/lib/resortDisplayGroups";
import {
  type DisplayGroup,
  type DisplayGroupDeleteRequest,
  type DisplayGroupSaveRequest,
  displayGroupDeleteRequestSchema,
  displayGroupSaveRequestSchema,
} from "@/server/ski-resorts/displayGroupContract";

type ActionError = { status: "error"; message: string };

const CONFLICT_MESSAGE =
  "別の操作で更新されました。再読み込みして内容を確認してください。";

export async function listDisplayGroupsFromAdmin(): Promise<
  { status: "ok"; groups: DisplayGroup[] } | ActionError
> {
  await requireAdmin();
  try {
    return { status: "ok", groups: await readDisplayGroups() };
  } catch {
    return { status: "error", message: "同時表示の組を読み込めませんでした。" };
  }
}

export async function saveDisplayGroupFromAdmin(
  request: DisplayGroupSaveRequest,
): Promise<{ status: "saved"; group: DisplayGroup } | ActionError> {
  await requireAdmin();
  const parsed = displayGroupSaveRequestSchema.safeParse(request);
  if (!parsed.success)
    return {
      status: "error",
      message:
        parsed.error.issues.find(issue => issue.path[0] === "label")?.message ??
        "対象のスキー場を2件以上、重複なく選んでください。",
    };
  try {
    const result = await saveDisplayGroup(parsed.data);
    if (result.status !== "saved")
      return {
        status: "error",
        message: {
          conflict: CONFLICT_MESSAGE,
          not_found: "この組は削除されています。再読み込みしてください。",
          invalid_resorts:
            "公開中でないスキー場が含まれています。選び直してください。",
        }[result.status],
      };
    revalidatePath("/", "layout");
    return result;
  } catch {
    return { status: "error", message: "保存できませんでした。" };
  }
}

export async function deleteDisplayGroupFromAdmin(
  request: DisplayGroupDeleteRequest,
): Promise<{ status: "deleted" } | ActionError> {
  await requireAdmin();
  const parsed = displayGroupDeleteRequestSchema.safeParse(request);
  if (!parsed.success) return { status: "error", message: "入力が不正です。" };
  try {
    const result = await deleteDisplayGroup(parsed.data);
    if (result.status === "deleted") {
      revalidatePath("/", "layout");
      return { status: "deleted" };
    }
    return {
      status: "error",
      message:
        result.status === "conflict"
          ? CONFLICT_MESSAGE
          : "この組はすでに削除されています。",
    };
  } catch {
    return { status: "error", message: "削除できませんでした。" };
  }
}
