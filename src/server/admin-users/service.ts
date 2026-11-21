// 管理ダッシュボードの読み取りとユーザー管理の権限を扱う．
import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { isUserRole } from "@/lib/roles";

export type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  image: string | null;
  isEnvAdmin: boolean;
};

/** 配備で指定された管理者のアカウントを保護する． */
function isEnvAdmin(email: string | null): boolean {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .some(value => value.trim().toLowerCase() === email.toLowerCase());
}

/** 現在の管理者のセッションでだけユーザー一覧を返す． */
export async function readAdminUsers(): Promise<AdminUser[]> {
  await requireAdmin();
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, image: true },
    orderBy: { id: "asc" },
  });
  return users.map(user => ({ ...user, isEnvAdmin: isEnvAdmin(user.email) }));
}

type UserMutation =
  | { operation: "update"; role: string }
  | { operation: "delete" };
const userIdSchema = z.string().min(1).max(200);

/** ロール変更と削除を直列化し，変更と同じ transaction で現在の権限を確認する． */
export async function mutateAdminUser(
  userId: string,
  mutation: UserMutation,
): Promise<void> {
  const actor = await requireAdmin();
  const id = userIdSchema.parse(userId);
  const role = mutation.operation === "update" ? mutation.role : null;
  if (mutation.operation === "update" && !isUserRole(mutation.role))
    throw new Error("無効なロールです");
  if (actor.id === id) throw new Error("自分自身は変更できません");

  await prisma.$transaction(async tx => {
    const users = await tx.$queryRaw<
      { id: string; role: string; email: string | null }[]
    >`SELECT id, role, email FROM users WHERE id IN (${actor.id}, ${id}) ORDER BY id FOR UPDATE`;
    if (users.find(user => user.id === actor.id)?.role !== "admin")
      throw new Error("管理者権限が必要です。");
    const target = users.find(user => user.id === id);
    if (!target) throw new Error("ユーザーが見つかりません。");
    if (isEnvAdmin(target.email))
      throw new Error("環境変数で定義された管理者アカウントは変更できません");
    if (role === null) await tx.user.delete({ where: { id } });
    else await tx.user.update({ where: { id }, data: { role } });
  });
}
