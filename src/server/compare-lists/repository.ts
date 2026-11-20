/** 比較リストを認証済み利用者の ID で絞り，保存順で返す． */
import "server-only";
import type { CompareListSummary } from "@/features/compare-lists/types";
import { prisma } from "@/lib/prisma";

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
