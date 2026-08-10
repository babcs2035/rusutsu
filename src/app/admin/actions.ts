"use server";

import { prisma } from "@/lib/prisma";

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  image: string | null;
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
    userCount: users.length,
    adminCount: users.filter(u => u.role === "admin").length,
    users: users as AdminUser[],
  };
}

export async function updateUserRole(userId: string, role: string) {
  if (role !== "admin" && role !== "viewer") {
    throw new Error("無効なロールです");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });
}

export async function deleteUser(userId: string) {
  await prisma.user.delete({
    where: { id: userId },
  });
}
