"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { mergeAdminSkiResorts } from "@/lib/skiResortData";
import {
  type ResortMergeRequest,
  type ResortMergeResult,
  resortMergeRequestSchema,
} from "@/server/ski-resorts/mergeContract";

export async function mergeSkiResortsFromAdmin(
  request: ResortMergeRequest,
): Promise<
  | Extract<ResortMergeResult, { status: "created" }>
  | { status: "error"; message: string }
> {
  await requireAdmin();
  const parsed = resortMergeRequestSchema.safeParse(request);
  if (!parsed.success)
    return {
      status: "error",
      message:
        "ID・名称・結合対象・引き継ぎ元を確認してください。IDには半角英小文字・数字・ハイフンを使ってください。",
    };
  try {
    const result = await mergeAdminSkiResorts(parsed.data);
    if (result.status !== "created")
      return {
        status: "error",
        message: {
          id_exists: "このIDはすでに使われています。別のIDを指定してください。",
          invalid_sources:
            "結合対象が削除済み、またはすでに結合されています。再読み込みして選び直してください。",
          conflict:
            "結合対象が別の操作で更新されました。再読み込みして内容を確認してください。",
        }[result.status],
      };
    revalidatePath("/", "layout");
    return result;
  } catch {
    return {
      status: "error",
      message:
        "結合を保存できませんでした。入力内容は保持されています。サーバーの接続状態とDBマイグレーションの適用を確認してください。",
    };
  }
}
