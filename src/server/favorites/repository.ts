// 認証済み利用者のお気に入りを同期し，本人の行だけを更新する．
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** 端末間で追加と並べ替えが重なっても，順序を読んだ時点から一件ずつ確定する． */
async function lockFavoriteOwner(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const [owner] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE
  `;
  if (!owner) throw new Error("ログイン状態が変わりました。");
}

/** 同じ位置の施設は，追加日時と ID で順序を確定する． */
async function readFavoriteIds(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string[]> {
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

/** 追加できる施設のうち，未登録のものを指定順で末尾に加える． */
async function appendFavorites(
  tx: Prisma.TransactionClient,
  userId: string,
  requested: string[],
): Promise<string[]> {
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
  const start =
    current.reduce((max, row) => Math.max(max, row.position), -1) + 1;
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

/** 端末の候補とログイン時の追加を既存のお気に入りへ取り込む． */
export async function syncFavoritesForUser(
  userId: string,
  ids: string[],
  pendingId: string | null,
): Promise<{ ids: string[]; addedPending: boolean }> {
  const requested = [...new Set([...ids, ...(pendingId ? [pendingId] : [])])];
  return prisma.$transaction(async tx => {
    if (requested.length) await lockFavoriteOwner(tx, userId);
    const valid = await appendFavorites(tx, userId, requested);
    return {
      ids: await readFavoriteIds(tx, userId),
      addedPending: !!pendingId && valid.includes(pendingId),
    };
  });
}

/** 本人のお気に入りに施設を追加し，保存後の順序を返す． */
export async function addFavoritesForUser(
  userId: string,
  ids: string[],
): Promise<string[]> {
  return prisma.$transaction(async tx => {
    await lockFavoriteOwner(tx, userId);
    await appendFavorites(tx, userId, ids);
    return readFavoriteIds(tx, userId);
  });
}

/** 古い端末が把握していない施設は，現在の順序のまま末尾に保つ． */
export async function reorderFavoritesForUser(
  userId: string,
  ids: string[],
): Promise<string[]> {
  return prisma.$transaction(async tx => {
    await lockFavoriteOwner(tx, userId);
    const current = await readFavoriteIds(tx, userId);
    const existing = new Set(current);
    const requested = new Set(ids);
    const ordered = [
      ...ids.filter(id => existing.has(id)),
      ...current.filter(id => !requested.has(id)),
    ];
    for (const [position, skiResortId] of ordered.entries()) {
      await tx.favorite.updateMany({
        where: { userId, skiResortId },
        data: { position },
      });
    }
    return ordered;
  });
}

/** 指定された施設だけを，本人のお気に入りに追加または削除する． */
export async function updateFavoriteForUser(
  userId: string,
  id: string,
  added: boolean,
): Promise<void> {
  await prisma.$transaction(async tx => {
    await lockFavoriteOwner(tx, userId);
    if (added) {
      const valid = await appendFavorites(tx, userId, [id]);
      if (!valid.length) throw new Error("スキー場が見つかりません。");
    } else {
      await tx.favorite.deleteMany({ where: { userId, skiResortId: id } });
    }
  });
}
