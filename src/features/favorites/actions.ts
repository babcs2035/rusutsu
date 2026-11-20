"use server";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { z } from "zod";
import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
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
  const requested = [...new Set([...ids, ...(pendingId ? [pendingId] : [])])];
  const result = await prisma.$transaction(async tx => {
    const valid = await appendFavorites(tx, userId, requested);
    return {
      ids: await readFavoriteIds(tx, userId),
      addedPending: !!pendingId && valid.includes(pendingId),
    };
  });
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

type Tx = Prisma.TransactionClient;

/** 利用者が並べた順。並べ替える前の行は同じ番号なので、追加した順で並べる */
async function readFavoriteIds(tx: Tx, userId: string) {
  const rows = await tx.favorite.findMany({
    where: { userId, skiResort: { isActive: true } },
    select: { skiResortId: true },
    orderBy: [
      { position: "asc" },
      { createdAt: "asc" },
      { skiResortId: "asc" },
    ],
  });
  return rows.map(row => row.skiResortId);
}

/** まだ無いスキー場を、渡した順のまま末尾へ足す。足せる（有効な）idを返す */
async function appendFavorites(tx: Tx, userId: string, requested: string[]) {
  if (!requested.length) return [];
  const active = new Set(
    (
      await tx.skiResort.findMany({
        where: { id: { in: requested }, isActive: true },
        select: { id: true },
      })
    ).map(resort => resort.id),
  );
  const valid = requested.filter(id => active.has(id));
  const current = await tx.favorite.findMany({
    where: { userId },
    select: { skiResortId: true, position: true },
  });
  const existing = new Set(current.map(row => row.skiResortId));
  const start = Math.max(-1, ...current.map(row => row.position)) + 1;
  await tx.favorite.createMany({
    data: valid
      .filter(id => !existing.has(id))
      .map((skiResortId, index) => ({
        userId,
        skiResortId,
        position: start + index,
      })),
    skipDuplicates: true,
  });
  return valid;
}

async function requireFavoriteUser(expectedUserId: string) {
  const session = await auth();
  if (!session?.user?.id || session.user.id !== expectedUserId)
    throw new Error("ログイン状態が変わりました。");
  return session.user.id;
}

/** 編集画面から、選んだスキー場をまとめてお気に入りの末尾へ足す */
export async function addFavorites(
  resortIds: string[],
  expectedUserId: string,
) {
  const ids = [...new Set(favoriteIdsSchema.parse(resortIds))];
  const userId = await requireFavoriteUser(expectedUserId);
  return prisma.$transaction(async tx => {
    await appendFavorites(tx, userId, ids);
    return { ids: await readFavoriteIds(tx, userId) };
  });
}

/**
 * 並び順を保存する。端末上の一覧が古くても、ほかの端末で足した・外した
 * スキー場は消さない（渡されなかったものは今の順のまま後ろに付ける）。
 */
export async function reorderFavorites(
  resortIds: string[],
  expectedUserId: string,
) {
  const ids = [...new Set(favoriteIdsSchema.parse(resortIds))];
  const userId = await requireFavoriteUser(expectedUserId);
  return prisma.$transaction(async tx => {
    const current = await readFavoriteIds(tx, userId);
    const existing = new Set(current);
    const requested = new Set(ids);
    const ordered = [
      ...ids.filter(id => existing.has(id)),
      ...current.filter(id => !requested.has(id)),
    ];
    for (const [position, skiResortId] of ordered.entries())
      await tx.favorite.updateMany({
        where: { userId, skiResortId },
        data: { position },
      });
    return { ids: ordered };
  });
}

export async function updateFavorite(
  id: string,
  added: boolean,
  expectedUserId: string,
) {
  z.string().min(1).max(200).parse(id);
  z.boolean().parse(added);
  const userId = await requireFavoriteUser(expectedUserId);
  if (added) {
    const valid = await prisma.$transaction(tx =>
      appendFavorites(tx, userId, [id]),
    );
    if (!valid.length) throw new Error("スキー場が見つかりません。");
  } else {
    await prisma.favorite.deleteMany({ where: { userId, skiResortId: id } });
  }
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
