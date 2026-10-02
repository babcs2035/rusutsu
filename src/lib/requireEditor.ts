import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEdit, isUserRole, type UserRole } from "@/lib/roles";
import { internalEditActorId } from "@/server/edit-requests/actorContext";

export type EditorActor = {
  id: string;
  role: UserRole;
  name: string | null;
  email: string | null;
  image: string | null;
};

// JWTは本人の識別だけに使う。権限の正本は毎回DBで確認する。
export async function getCurrentActor(): Promise<EditorActor | null> {
  const internalId = internalEditActorId();
  const session = internalId ? null : await auth();
  const id = internalId ?? (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, name: true, email: true, image: true },
  });
  if (!user || !isUserRole(user.role)) return null;
  return { ...user, role: user.role };
}

export async function requireEditor(): Promise<EditorActor> {
  const actor = await getCurrentActor();
  if (!actor || !canEdit(actor.role))
    throw new Error("編集者または管理者権限が必要です。");
  return actor;
}
