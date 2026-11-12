import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  RESORT_LINK_HUMAN_EDITOR_KINDS,
  type ResortLinkRecord,
  type ResortLinkReplace,
  type ResortLinkReplaceResult,
  type ResortLinkSummary,
  resortLinkKey,
  resortLinkReplaceSchema,
  resortLinkSchema,
  UnknownResortLinkResortError,
} from "./contract";

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

type Row = Prisma.ResortLinkGetPayload<object>;

const toLink = (row: Row): ResortLinkRecord =>
  resortLinkSchema.parse({
    id: row.id,
    resortId: row.skiResortId,
    type: row.type,
    source: row.source,
    category: row.category,
    label: row.label,
    url: row.url,
    note: row.note,
    sortOrder: row.sortOrder,
    editorKind: row.editorKind,
    editorId: row.editorId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

const listOrder = [
  { skiResortId: "asc" },
  { sortOrder: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.ResortLinkOrderByWithRelationInput[];

/** 詳細画面用。指定スキー場のリンクだけを読む */
export async function findResortLinksDirect(
  resortIds: readonly string[],
): Promise<ResortLinkRecord[]> {
  if (resortIds.length === 0) return [];
  const rows = await prisma.resortLink.findMany({
    where: { skiResortId: { in: [...resortIds] } },
    orderBy: listOrder,
  });
  return rows.map(toLink);
}

/** 逆引き用。「オリオン対応のスキー場」のように、出どころから全スキー場分を読む */
export async function findResortLinksBySourceDirect(
  source: string,
): Promise<ResortLinkRecord[]> {
  const rows = await prisma.resortLink.findMany({
    where: { source },
    orderBy: listOrder,
  });
  return rows.map(toLink);
}

/** 出どころ×種類ごとの件数。入れ替え前の件数確認と管理用 */
export async function summarizeResortLinksDirect(): Promise<
  ResortLinkSummary[]
> {
  return prisma.$queryRaw<ResortLinkSummary[]>`
    SELECT "source", "type",
           COUNT(*)::int AS "links",
           COUNT(DISTINCT "skiResortId")::int AS "resorts"
    FROM "resort_links"
    GROUP BY "source", "type"
    ORDER BY "source", "type"`;
}

const isHumanEdit = (row: Row) =>
  (RESORT_LINK_HUMAN_EDITOR_KINDS as readonly string[]).includes(
    row.editorKind,
  );

/** 人が直した行と同じ「項目」かどうか。URLが違っても、種類とラベルが同じなら同じ項目 */
const itemKey = (link: {
  resortId: string;
  type: string;
  label: string | null;
}) => JSON.stringify([link.resortId, link.type, link.label]);

async function replaceInTransaction(
  transaction: Prisma.TransactionClient,
  write: ResortLinkReplace,
): Promise<ResortLinkReplaceResult> {
  const { scope, editor } = write;
  const current = await transaction.resortLink.findMany({
    where:
      scope.kind === "resort"
        ? { skiResortId: scope.resortId, source: scope.source }
        : { source: scope.source },
  });

  const humanItems = new Set(
    current
      .filter(isHumanEdit)
      .map(row => itemKey({ ...row, resortId: row.skiResortId })),
  );
  // 自動で入れた行だけが入れ替えの対象。同じキーの行が重なっていたら余分は消す
  const automaticByKey = new Map<string, Row>();
  const deleteIds: string[] = [];
  for (const row of current) {
    if (isHumanEdit(row)) continue;
    const key = resortLinkKey({ ...row, resortId: row.skiResortId });
    if (automaticByKey.has(key)) deleteIds.push(row.id);
    else automaticByKey.set(key, row);
  }

  const result: ResortLinkReplaceResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    keptHumanEdits: 0,
  };
  const creates: Prisma.ResortLinkCreateManyInput[] = [];
  for (const link of write.links) {
    if (humanItems.has(itemKey(link))) {
      result.keptHumanEdits++;
      continue;
    }
    const key = resortLinkKey(link);
    const existing = automaticByKey.get(key);
    if (!existing) {
      creates.push({
        skiResortId: link.resortId,
        type: link.type,
        source: scope.source,
        category: link.category,
        label: link.label,
        url: link.url,
        note: link.note,
        sortOrder: link.sortOrder,
        editorKind: editor.kind,
        editorId: editor.id,
      });
      continue;
    }
    automaticByKey.delete(key);
    // 中身が同じ行は触らない。更新日時は「実際に変わった日」を表す
    if (existing.note === link.note) {
      // 並び順だけの変化は、更新日時を動かさずに直す
      if (existing.sortOrder !== link.sortOrder)
        await transaction.$executeRaw`
          UPDATE "resort_links" SET "sortOrder" = ${link.sortOrder}
          WHERE "id" = ${existing.id}`;
      result.unchanged++;
      continue;
    }
    await transaction.resortLink.update({
      where: { id: existing.id },
      data: {
        note: link.note,
        sortOrder: link.sortOrder,
        editorKind: editor.kind,
        editorId: editor.id,
      },
    });
    result.updated++;
  }

  deleteIds.push(...[...automaticByKey.values()].map(row => row.id));
  if (deleteIds.length > 0)
    await transaction.resortLink.deleteMany({
      where: { id: { in: deleteIds } },
    });
  if (creates.length > 0)
    await transaction.resortLink.createMany({ data: creates });
  result.deleted = deleteIds.length;
  result.created = creates.length;
  return result;
}

/**
 * 範囲（1スキー場の出どころ、または出どころ全体）の自動の行を、渡された一覧に入れ替える。
 * 同じリンクは残し、無くなったものだけ消し、増えたものだけ足す。
 */
export async function replaceResortLinksDirect(
  input: ResortLinkReplace,
): Promise<ResortLinkReplaceResult> {
  const write = resortLinkReplaceSchema.parse(input);
  const resortIds = [
    ...new Set([
      ...(write.scope.kind === "resort" ? [write.scope.resortId] : []),
      ...write.links.map(link => link.resortId),
    ]),
  ];
  const known = new Set(
    (
      await prisma.skiResort.findMany({
        where: { id: { in: resortIds } },
        select: { id: true },
      })
    ).map(resort => resort.id),
  );
  const unknown = resortIds.filter(id => !known.has(id));
  if (unknown.length > 0) throw new UnknownResortLinkResortError(unknown);

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt++
  ) {
    try {
      return await prisma.$transaction(
        transaction => replaceInTransaction(transaction, write),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 60_000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS
      )
        continue;
      throw error;
    }
  }
  throw new Error("Serializable resort link transaction retry limit exceeded");
}
