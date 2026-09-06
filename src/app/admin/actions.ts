"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function isEnvAdmin(email: string | null): boolean {
  if (!email) return false;
  const admins = process.env.ADMIN_EMAILS ?? "";
  return admins
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  image: string | null;
  isEnvAdmin: boolean;
}

export async function getAdminDashboardData() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  return {
    users: users.map(u => ({
      ...u,
      isEnvAdmin: isEnvAdmin(u.email),
    })) as AdminUser[],
  };
}

export async function updateUserRole(userId: string, role: string) {
  const actor = await requireAdmin();
  if (role !== "admin" && role !== "viewer") {
    throw new Error("無効なロールです");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (actor.id === userId) {
    throw new Error("自分自身の管理者権限は変更できません");
  }
  if (isEnvAdmin(user?.email ?? null)) {
    throw new Error("環境変数で定義された管理者アカウントは変更できません");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });
}

export async function deleteUser(userId: string) {
  const actor = await requireAdmin();
  if (actor.id === userId) {
    throw new Error("自分自身のアカウントは削除できません");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (isEnvAdmin(user?.email ?? null)) {
    throw new Error("環境変数で定義された管理者アカウントは削除できません");
  }
  await prisma.user.delete({
    where: { id: userId },
  });
}
