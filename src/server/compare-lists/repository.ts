/** 比較リストの永続化を担当し，認証済み利用者の ID で操作を絞る． */
import "server-only";
import type { CompareListSummary } from "@/features/compare-lists/types";
import { CompareListError } from "@/features/compare-lists/updateResorts";
import { prisma } from "@/lib/prisma";

const MAX_LISTS = 50;

/** 所有者ごとに新規作成を直列化し，上限と最初の表示順を保つ． */
export async function createCompareListForUser(
  userId: string,
  name: string,
  requested: string[],
): Promise<string> {
  return prisma.$transaction(async tx => {
    const [owner] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${userId} FOR UPDATE
    `;
    if (!owner) throw new CompareListError("ログイン状態が変わりました。");
    const valid = new Set(
      (
        await tx.skiResort.findMany({
          where: { id: { in: requested }, isActive: true },
          select: { id: true },
        })
      ).map(resort => resort.id),
    );
    const ids = requested.filter(id => valid.has(id));
    if (ids.length === 0)
      throw new CompareListError("スキー場が見つかりません。");
    const count = await tx.compareList.count({ where: { userId } });
    if (count >= MAX_LISTS)
      throw new CompareListError(
        `比較リストは${MAX_LISTS}件まで保存できます。`,
      );
    const { id } = await tx.compareList.create({
      data: {
        userId,
        name,
        items: {
          createMany: {
            data: ids.map((skiResortId, position) => ({
              skiResortId,
              position,
            })),
          },
        },
      },
    });
    return id;
  });
}

/** 画面表示に必要な項目だけを読み，削除・統合済みの施設を除く． */
export async function readCompareListsForUser(
  userId: string,
): Promise<CompareListSummary[]> {
  const lists = await prisma.compareList.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      items: {
        where: { skiResort: { isActive: true } },
        orderBy: { position: "asc" },
        select: { skiResortId: true },
      },
    },
  });
  return lists.map(list => ({
    id: list.id,
    name: list.name,
    resortIds: list.items.map(item => item.skiResortId),
  }));
}
