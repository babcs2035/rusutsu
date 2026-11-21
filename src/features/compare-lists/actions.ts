"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createCompareListForUser,
  readCompareListsForUser as readLists,
} from "@/server/compare-lists/repository";
import { COMPARE_LIST_NAME_MAX } from "./types";
import {
  CompareListError,
  MAX_COMPARE_LIST_RESORTS,
  updateResorts,
} from "./updateResorts";

const MAX_RESORTS = MAX_COMPARE_LIST_RESORTS;

const nameSchema = z.string().trim().min(1).max(COMPARE_LIST_NAME_MAX);
const resortIdsSchema = z
  .array(z.string().min(1).max(200))
  .min(1)
  .max(MAX_RESORTS);

async function requireUser(expectedUserId: string) {
  const session = await auth();
  if (!session?.user?.id || session.user.id !== expectedUserId)
    throw new Error("ログイン状態が変わりました。");
  return session.user.id;
}

/** 新しい比較リストを作成する． */
export async function saveCompareList(input: {
  expectedUserId: string;
  name: string;
  resortIds: string[];
}) {
  const userId = await requireUser(input.expectedUserId);
  const name = nameSchema.parse(input.name);
  const requested = [...new Set(resortIdsSchema.parse(input.resortIds))];
  let savedId: string;
  try {
    savedId = await createCompareListForUser(userId, name, requested);
  } catch (error) {
    if (error instanceof CompareListError)
      return { ok: false as const, error: error.message };
    throw error;
  }
  return { ok: true as const, id: savedId, lists: await readLists(userId) };
}

export async function deleteCompareList(id: string, expectedUserId: string) {
  const userId = await requireUser(expectedUserId);
  z.string().min(1).max(64).parse(id);
  await prisma.compareList.deleteMany({ where: { id, userId } });
  return readLists(userId);
}

/** 項目だけを追加・解除する。端末上の古い一覧でリスト全体を上書きしない。 */
export async function updateCompareListResorts(input: {
  expectedUserId: string;
  id: string;
  resortIds: string[];
  operation: "add" | "remove";
}) {
  const userId = await requireUser(input.expectedUserId);
  const id = z.string().min(1).max(64).parse(input.id);
  const requested = [...new Set(resortIdsSchema.parse(input.resortIds))];
  const operation = z.enum(["add", "remove"]).parse(input.operation);
  try {
    await prisma.$transaction(tx =>
      updateResorts(tx, userId, id, requested, operation),
    );
  } catch (error) {
    if (error instanceof CompareListError)
      return { ok: false as const, error: error.message };
    throw error;
  }
  return { ok: true as const, id, lists: await readLists(userId) };
}

/** 名前だけを変える。項目は触らないので、端末上の古い一覧で中身を上書きしない。 */
export async function renameCompareList(input: {
  expectedUserId: string;
  id: string;
  name: string;
}) {
  const userId = await requireUser(input.expectedUserId);
  const id = z.string().min(1).max(64).parse(input.id);
  const parsed = nameSchema.safeParse(input.name);
  if (!parsed.success)
    return { ok: false as const, error: "リスト名を入力してください。" };
  const updated = await prisma.compareList.updateMany({
    where: { id, userId },
    data: { name: parsed.data },
  });
  if (!updated.count)
    return { ok: false as const, error: "リストが見つかりません。" };
  return { ok: true as const, id, lists: await readLists(userId) };
}
