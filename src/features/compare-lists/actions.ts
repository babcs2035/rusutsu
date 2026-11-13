"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { COMPARE_LIST_NAME_MAX, type CompareListSummary } from "./types";

const MAX_LISTS = 50;
const MAX_RESORTS = 100;

const nameSchema = z.string().trim().min(1).max(COMPARE_LIST_NAME_MAX);
const resortIdsSchema = z
  .array(z.string().min(1).max(200))
  .min(1)
  .max(MAX_RESORTS);

/** 画面にそのまま出せる失敗。本番では例外のメッセージがクライアントへ届かないので戻り値で返す */
class CompareListError extends Error {}

async function requireUser(expectedUserId: string) {
  const session = await auth();
  if (!session?.user?.id || session.user.id !== expectedUserId)
    throw new Error("ログイン状態が変わりました。");
  return session.user.id;
}

async function readLists(userId: string): Promise<CompareListSummary[]> {
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

export async function listCompareLists(expectedUserId: string) {
  return readLists(await requireUser(expectedUserId));
}

/** id を渡すとそのリストを上書きし、無ければ新しいリストを作る。 */
export async function saveCompareList(input: {
  expectedUserId: string;
  id?: string | null;
  name: string;
  resortIds: string[];
}) {
  const userId = await requireUser(input.expectedUserId);
  const name = nameSchema.parse(input.name);
  const requested = [...new Set(resortIdsSchema.parse(input.resortIds))];
  const listId = input.id ? z.string().min(1).max(64).parse(input.id) : null;
  let savedId: string;
  try {
    savedId = await saveInTransaction(userId, listId, name, requested);
  } catch (error) {
    if (error instanceof CompareListError)
      return { ok: false as const, error: error.message };
    throw error;
  }
  return { ok: true as const, id: savedId, lists: await readLists(userId) };
}

function saveInTransaction(
  userId: string,
  listId: string | null,
  name: string,
  requested: string[],
) {
  return prisma.$transaction(async tx => {
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
    let id = listId;
    if (id) {
      const updated = await tx.compareList.updateMany({
        where: { id, userId },
        data: { name },
      });
      if (updated.count === 0)
        throw new CompareListError("リストが見つかりません。");
      await tx.compareListItem.deleteMany({ where: { listId: id } });
    } else {
      const count = await tx.compareList.count({ where: { userId } });
      if (count >= MAX_LISTS)
        throw new CompareListError(
          `比較リストは${MAX_LISTS}件まで保存できます。`,
        );
      id = (await tx.compareList.create({ data: { userId, name } })).id;
    }
    await tx.compareListItem.createMany({
      data: ids.map((skiResortId, position) => ({
        listId: id,
        skiResortId,
        position,
      })),
    });
    return id;
  });
}

export async function deleteCompareList(id: string, expectedUserId: string) {
  const userId = await requireUser(expectedUserId);
  z.string().min(1).max(64).parse(id);
  await prisma.compareList.deleteMany({ where: { id, userId } });
  return readLists(userId);
}
