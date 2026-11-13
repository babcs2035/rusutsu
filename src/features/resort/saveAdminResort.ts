import "server-only";

import { revalidatePath } from "next/cache";
import { InternalDataApiError } from "@/lib/internalDataApiClient";
import { updateAdminSkiResort } from "@/lib/skiResortData";
import { runEdit } from "@/server/edit-requests/workflow";
import type { AdminSkiResortUpdateRequest } from "@/server/ski-resorts/adminContract";
import type { ResortAdminActionState } from "./actions";

/**
 * スキー場マスターの保存。スキー場編集とEV充電の画面が同じ流れ（編集申請・データAPI）で保存する。
 * 呼び出し側で requireEditor と入力の検証を済ませておく。
 */
export async function saveAdminResortRequest(
  id: string,
  request: AdminSkiResortUpdateRequest,
): Promise<ResortAdminActionState & { submission?: { requestId: string } }> {
  return runEdit("resort", id, { id: id, request: request }, async () => {
    try {
      const result = await updateAdminSkiResort(id, request);
      if (result.status === "conflict") {
        return {
          status: "error",
          reason: "conflict",
          message:
            "別の管理者が先にこのスキー場を更新しました。ページを再読み込みし、最新の内容を確認してから編集し直してください。",
        };
      }
      if (result.status === "not_found") {
        return {
          status: "error",
          reason: "not_found",
          message: "このスキー場はデータベースに存在しません。",
        };
      }

      revalidatePath("/");
      revalidatePath("/admin/resort");
      return {
        status: "saved",
        message: "スキー場情報を保存しました。",
        resort: result.resort,
      };
    } catch (error) {
      console.error("Failed to update ski resort from admin", {
        name: error instanceof Error ? error.name : "UnknownError",
        status: error instanceof InternalDataApiError ? error.status : null,
      });
      if (error instanceof InternalDataApiError && error.status === 422) {
        return {
          status: "error",
          reason: "validation",
          message:
            "保存先サーバーが現在の入力形式に対応していません。サーバーの更新とDBマイグレーションを適用してから保存してください。入力内容はこの画面に残っています。",
        };
      }
      return {
        status: "error",
        reason: "unexpected",
        message:
          "サーバーとの通信または保存に失敗しました。時間を置いてもう一度お試しください。",
      };
    }
  });
}
