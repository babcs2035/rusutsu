"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { favoriteIdsSchema } from "./storage";

const INTENT_COOKIE = "rusutsu-favorite-intent";
const HISTORY_COOKIE = "rusutsu-login-history";
const cookieOptions = {
  httpOnly: true,
  secure: process.env.AUTH_URL?.startsWith("https://") ?? false,
  sameSite: "lax" as const,
  path: "/rusutsu",
};

export async function startPublicLogin(returnTo: string, resortId?: string) {
  // Only public pages in this application may be an OAuth return destination.
  z.string().min(1).max(2000).parse(returnTo);
  const destination = new URL(returnTo, "https://return.invalid");
  if (
    destination.origin !== "https://return.invalid" ||
    (destination.pathname !== "/rusutsu" &&
      destination.pathname !== "/rusutsu/")
  )
    throw new Error("ログイン先が不正です。");
  const nonce = randomUUID();
  const id = resortId ? z.string().min(1).max(200).parse(resortId) : null;
  const jar = await cookies();
  destination.searchParams.set("favoriteLogin", nonce);
  jar.set(
    INTENT_COOKIE,
    JSON.stringify({
      nonce,
      resortId: id,
      returnTo: `${destination.pathname}${destination.search}${destination.hash}`,
    }),
    {
      ...cookieOptions,
      maxAge: 900,
    },
  );
  await signIn("google", {
    redirectTo: `${destination.pathname}${destination.search}${destination.hash}`,
  });
}

export async function syncFavorites(
  localIds: string[],
  expectedUserId: string,
) {
  const ids = [...new Set(favoriteIdsSchema.parse(localIds))];
  const session = await auth();
  if (!session?.user?.id || session.user.id !== expectedUserId)
    throw new Error("ログイン状態が変わりました。");
  const userId = session.user.id;
  const jar = await cookies();
  let pendingId: string | null = null;
  try {
    const intent = JSON.parse(jar.get(INTENT_COOKIE)?.value ?? "null");
    if (
      typeof intent?.nonce === "string" &&
      intent.nonce ===
        (session as { favoriteLoginNonce?: string }).favoriteLoginNonce
    )
      pendingId = typeof intent.resortId === "string" ? intent.resortId : null;
  } catch {
    /* Expired or malformed intent never adds a resort. */
  }
  const requested = [...new Set([...ids, ...(pendingId ? [pendingId] : [])])];
  const result = await prisma.$transaction(async tx => {
    const valid = await tx.skiResort.findMany({
      where: { id: { in: requested }, isActive: true },
      select: { id: true },
    });
    await tx.favorite.createMany({
      data: valid.map(resort => ({ userId, skiResortId: resort.id })),
      skipDuplicates: true,
    });
    const rows = await tx.favorite.findMany({
      where: { userId, skiResort: { isActive: true } },
      select: { skiResortId: true },
      orderBy: { skiResortId: "asc" },
    });
    return {
      ids: rows.map(row => row.skiResortId),
      addedPending: !!pendingId && valid.some(r => r.id === pendingId),
    };
  });
  jar.set(INTENT_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  jar.set(HISTORY_COOKIE, "1", {
    ...cookieOptions,
    maxAge: 365 * 24 * 60 * 60,
  });
  return { ...result, userId };
}

export async function updateFavorite(
  id: string,
  added: boolean,
  expectedUserId: string,
) {
  z.string().min(1).max(200).parse(id);
  z.boolean().parse(added);
  const session = await auth();
  if (!session?.user?.id || session.user.id !== expectedUserId)
    throw new Error("ログイン状態が変わりました。");
  const userId = session.user.id;
  if (added) {
    const resort = await prisma.skiResort.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
    if (!resort) throw new Error("スキー場が見つかりません。");
    await prisma.favorite.upsert({
      where: { userId_skiResortId: { userId, skiResortId: id } },
      create: { userId, skiResortId: id },
      update: {},
    });
  } else {
    await prisma.favorite.deleteMany({ where: { userId, skiResortId: id } });
  }
  return { userId };
}

export async function readLoginHistory() {
  const jar = await cookies();
  const session = await auth();
  if (session?.user?.id) {
    jar.set(HISTORY_COOKIE, "1", {
      ...cookieOptions,
      maxAge: 365 * 24 * 60 * 60,
    });
    return false;
  }
  // An unfinished/cancelled OAuth flow must not become a future addition.
  jar.set(INTENT_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return jar.get(HISTORY_COOKIE)?.value === "1";
}

export async function publicLogout() {
  const jar = await cookies();
  jar.set(HISTORY_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  jar.set(INTENT_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  await signOut({ redirect: false });
}
