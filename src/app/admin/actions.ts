"use server";

import { mutateAdminUser } from "@/server/admin-users/service";

/** 管理画面からユーザーのロールを更新する． */
export async function updateUserRole(
  userId: string,
  role: string,
): Promise<void> {
  await mutateAdminUser(userId, { operation: "update", role });
}

/** 管理画面からユーザーを削除する． */
export async function deleteUser(userId: string): Promise<void> {
  await mutateAdminUser(userId, { operation: "delete" });
}
