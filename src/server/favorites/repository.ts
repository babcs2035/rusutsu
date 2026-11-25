// 認証済み利用者のお気に入りを同期し，本人の行だけを更新する．
import "server-only";
import { prisma } from "@/lib/prisma";

/** 端末の候補とログイン時の追加を既存のお気に入りへ取り込む． */
export async function syncFavoritesForUser(
  userId: string,
  ids: string[],
  pendingId: string | null,
): Promise<{ ids: string[]; addedPending: boolean }> {
  const requested = [...new Set([...ids, ...(pendingId ? [pendingId] : [])])];
  return prisma.$transaction(async tx => {
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
      addedPending:
        !!pendingId && valid.some(resort => resort.id === pendingId),
    };
  });
}

/** 指定された施設だけを，本人のお気に入りに追加または削除する． */
export async function updateFavoriteForUser(
  userId: string,
  id: string,
  added: boolean,
): Promise<void> {
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
}
