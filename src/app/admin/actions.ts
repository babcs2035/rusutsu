"use server";

import { prisma } from "@/lib/prisma";

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
  if (role !== "admin" && role !== "viewer") {
    throw new Error("無効なロールです");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (isEnvAdmin(user?.email ?? null)) {
    throw new Error("環境変数で定義された管理者アカウントは変更できません");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });
}

export async function deleteUser(userId: string) {
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
