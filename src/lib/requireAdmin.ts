import "server-only";

import { getCurrentActor } from "@/lib/requireEditor";

export type AdminActor = {
  id: string;
  email: string | null;
};

/**
 * Server Actions やサーバー内の書き込み処理で、毎回管理者権限を確認する。
 * 管理画面のproxyはUIへの導線を守るものであり、各変更処理の認可の代わりにはならない。
 */
export async function requireAdmin(): Promise<AdminActor> {
  const currentUser = await getCurrentActor();

  if (currentUser?.role !== "admin") {
    throw new Error("管理者権限が必要です。");
  }

  return {
    id: currentUser.id,
    email: currentUser.email,
  };
}
