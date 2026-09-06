import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type AdminActor = {
  id: string;
  email: string | null;
};

/**
 * Server Actions やサーバー内の書き込み処理で、毎回管理者権限を確認する。
 * 管理画面のproxyはUIへの導線を守るものであり、各変更処理の認可の代わりにはならない。
 */
export async function requireAdmin(): Promise<AdminActor> {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;

  if (!user?.id) {
    throw new Error("管理者権限が必要です。");
  }

  // JWT 内の role は権限変更・ユーザー削除後も有効期限まで残り得るため、
  // 操作のたびにDB上の現在のユーザーとroleを確認する。
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  if (currentUser?.role !== "admin") {
    throw new Error("管理者権限が必要です。");
  }

  return {
    id: currentUser.id,
    email: currentUser.email,
  };
}
