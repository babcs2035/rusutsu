"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  mergeAdminSkiResorts,
  unlinkAdminSkiResorts,
  updateTicketGroup,
} from "@/lib/skiResortData";
import {
  type ResortMergeRequest,
  type ResortMergeResult,
  type ResortUnlinkRequest,
  type ResortUnlinkResult,
  resortMergeRequestSchema,
  resortUnlinkRequestSchema,
  type TicketGroupRequest,
  type TicketGroupResult,
  ticketGroupRequestSchema,
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

export async function unlinkSkiResortsFromAdmin(
  request: ResortUnlinkRequest,
): Promise<
  | Extract<ResortUnlinkResult, { status: "unlinked" }>
  | { status: "error"; message: string }
> {
  await requireAdmin();
  const parsed = resortUnlinkRequestSchema.safeParse(request);
  if (!parsed.success)
    return { status: "error", message: "解除するエリアを確認してください。" };
  try {
    const result = await unlinkAdminSkiResorts(parsed.data);
    if (result.status !== "unlinked")
      return {
        status: "error",
        message: {
          not_linked:
            "このスキー場は連携エリアではありません。再読み込みして確認してください。",
          conflict:
            "連携エリアが別の操作で更新されました。再読み込みして内容を確認してください。",
        }[result.status],
      };
    revalidatePath("/", "layout");
    return result;
  } catch {
    return {
      status: "error",
      message:
        "連携を解除できませんでした。サーバーの接続状態とDBマイグレーションの適用を確認してください。",
    };
  }
}

export async function updateTicketGroupFromAdmin(
  request: TicketGroupRequest,
): Promise<
  | Extract<TicketGroupResult, { status: "updated" }>
  | { status: "error"; message: string }
> {
  await requireAdmin();
  const parsed = ticketGroupRequestSchema.safeParse(request);
  if (!parsed.success)
    return {
      status: "error",
      message: "共通券の対象を2件以上、重複なく選んでください。",
    };
  try {
    const result = await updateTicketGroup(parsed.data);
    if (result.status !== "updated")
      return {
        status: "error",
        message: {
          invalid_resorts:
            "対象が削除済みか、別々の共通券グループに入っています。再読み込みして選び直してください。",
          conflict:
            "対象が別の操作で更新されました。再読み込みして内容を確認してください。",
        }[result.status],
      };
    revalidatePath("/", "layout");
    return result;
  } catch {
    return {
      status: "error",
      message:
        "共通券の関係を保存できませんでした。サーバーの接続状態とDBマイグレーションの適用を確認してください。",
    };
  }
}
