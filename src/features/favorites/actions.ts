"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { auth, signIn, signOut } from "@/auth";
import {
  syncFavoritesForUser,
  updateFavoriteForUser,
} from "@/server/favorites/repository";
import { isPublicMapPathname } from "@/shared/utils/resortPath";
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
    !isPublicMapPathname(destination.pathname)
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
  const result = await syncFavoritesForUser(userId, ids, pendingId);
  // 同期するたびにCookieを書くと、Next.jsがページ全体を更新してしまう。
  if (jar.get(INTENT_COOKIE))
    jar.set(INTENT_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  if (jar.get(HISTORY_COOKIE)?.value !== "1")
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
  await updateFavoriteForUser(userId, id, added);
  return { userId };
}

export async function readLoginHistory() {
  const jar = await cookies();
  const session = await auth();
  if (session?.user?.id) {
    if (jar.get(HISTORY_COOKIE)?.value !== "1")
      jar.set(HISTORY_COOKIE, "1", {
        ...cookieOptions,
        maxAge: 365 * 24 * 60 * 60,
      });
    return false;
  }
  // An unfinished/cancelled OAuth flow must not become a future addition.
  if (jar.get(INTENT_COOKIE))
    jar.set(INTENT_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return jar.get(HISTORY_COOKIE)?.value === "1";
}

export async function publicLogout() {
  const jar = await cookies();
  jar.set(HISTORY_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  jar.set(INTENT_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  await signOut({ redirect: false });
}
