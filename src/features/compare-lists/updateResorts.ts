import type { Prisma } from "@prisma/client";

export const MAX_COMPARE_LIST_RESORTS = 100;

/** 画面にそのまま出せる比較リストの失敗。 */
export class CompareListError extends Error {}

/** 既存リストの項目だけを追加・解除する。トランザクション内で呼び出す。 */
export async function updateResorts(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
  requested: string[],
  operation: "add" | "remove",
) {
  // 同じリストの編集を直列化し、所有者も確認する。
  const updated = await tx.compareList.updateMany({
    where: { id, userId },
    data: { updatedAt: new Date() },
  });
  if (!updated.count) throw new CompareListError("リストが見つかりません。");
  if (operation === "remove") {
    await tx.compareListItem.deleteMany({
      where: { listId: id, skiResortId: { in: requested } },
    });
    return;
  }
  const current = await tx.compareListItem.findMany({
    where: { listId: id },
    select: { skiResortId: true, position: true },
  });
  const existing = new Set(current.map(item => item.skiResortId));
  const valid = new Set(
    (
      await tx.skiResort.findMany({
        where: { id: { in: requested }, isActive: true },
        select: { id: true },
      })
    ).map(resort => resort.id),
  );
  const added = requested.filter(
    resortId => valid.has(resortId) && !existing.has(resortId),
  );
  if (current.length + added.length > MAX_COMPARE_LIST_RESORTS)
    throw new CompareListError(
      `1つのリストには${MAX_COMPARE_LIST_RESORTS}件まで追加できます。`,
    );
  const position = Math.max(-1, ...current.map(item => item.position)) + 1;
  if (added.length)
    await tx.compareListItem.createMany({
      data: added.map((skiResortId, index) => ({
        listId: id,
        skiResortId,
        position: position + index,
      })),
    });
}
