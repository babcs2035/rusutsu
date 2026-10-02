import "server-only";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/requireEditor";
import { writeDataDocumentsInTransaction } from "@/server/data-documents/repository";
import { hashDataDocumentContent } from "@/server/data-documents/repositoryCore";
import { writeLiftTicketSeasonInTransaction } from "@/server/lift-tickets/repository";
import { updateAdminSkiResortInTransaction } from "@/server/ski-resorts/repository";
import { collectEdit, currentEditCapture } from "./capture";
import {
  assertBoundedPayload,
  type EditKind,
  type EditPlan,
  type Submission,
} from "./contract";
import { validateEditPayload } from "./payloadSchema";
import { CanonicalEditConflictError, EditConflictError } from "./policy";
import { remoteEditRequestResult } from "./remoteClient";
import { remoteEditResultSchema } from "./remoteContract";

export function ensureLocalWorkflow() {
  if (usesRemoteDataApi())
    throw new Error(
      "申請のDB処理は、公開データを保持するサーバーで実行してください。",
    );
}
export const asJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
export async function serializable<T>(
  task: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(task, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code)
      ) {
        if (attempt < 2) continue;
        throw new EditConflictError();
      }
      throw error;
    }
  }
  throw new EditConflictError();
}
export async function assertPlanCurrent(
  tx: Prisma.TransactionClient,
  plan: EditPlan,
) {
  for (const { key, document } of plan.beforeDocuments) {
    const row = await tx.dataDocument.findUnique({
      where: { key },
      select: { hash: true, version: true },
    });
    if (
      (row?.hash ?? null) !== (document?.hash ?? null) ||
      (row?.version ?? null) !== (document?.version ?? null)
    )
      throw new CanonicalEditConflictError();
  }
  if (plan.resort) {
    const row = await tx.skiResort.findUnique({
      where: { id: plan.resort.id },
      select: { updatedAt: true },
    });
    if (row?.updatedAt.toISOString() !== plan.resort.request.expectedUpdatedAt)
      throw new CanonicalEditConflictError();
  }
  if (plan.ticket) {
    const write = plan.ticket.write;
    const row = await tx.liftTicketSeason.findUnique({
      where: {
        skiResortId_seasonId: {
          skiResortId: write.resortId,
          seasonId: write.seasonId,
        },
      },
      select: { version: true },
    });
    if ((row?.version ?? null) !== write.expectedVersion)
      throw new CanonicalEditConflictError();
  }
}
export function assertPreparedPlan(plan: EditPlan) {
  if (!plan.documents.length && !plan.resort && !plan.ticket)
    throw new Error("申請する変更がありません。");
  if (
    plan.documents.length > 100 ||
    Buffer.byteLength(JSON.stringify(plan)) > 32 * 1024 * 1024
  )
    throw new Error("変更範囲が大きすぎます。申請を分けてください。");
}
function successful(result: unknown) {
  if (!result || typeof result !== "object") return false;
  return (
    ("ok" in result && result.ok === true) ||
    ("status" in result && result.status === "saved")
  );
}

/** 管理者の直接編集と編集者の申請を、全編集ツールで共通の境界にする。 */
export async function runEdit<T extends object>(
  kind: EditKind,
  resortId: string,
  payload: unknown,
  operation: () => Promise<T>,
): Promise<T & { submission?: Submission }> {
  const actor = await requireEditor();
  if (currentEditCapture()) return operation();
  if (usesRemoteDataApi()) {
    assertBoundedPayload(payload);
    validateEditPayload(kind, payload);
    const result = await remoteEditRequestResult(
      { operation: "edit", kind, payload },
      remoteEditResultSchema,
    );
    if (successful(result) && !result.submission) revalidatePath("/", "layout");
    return result as T & { submission?: Submission };
  }
  if (actor.role === "admin") return operation();
  ensureLocalWorkflow();
  assertBoundedPayload(payload);
  validateEditPayload(kind, payload);
  const { result, plan } = await collectEdit(operation);
  if (!successful(result)) return result;
  assertPreparedPlan(plan);
  const request = await serializable(async tx => {
    const user = await tx.user.findUnique({
      where: { id: actor.id },
      select: { role: true, name: true },
    });
    if (user?.role !== "editor")
      throw new Error("編集者権限が変更されました。再読み込みしてください。");
    if (
      (await tx.editRequest.count({
        where: { authorId: actor.id, status: "PENDING" },
      })) >= 100
    )
      throw new Error(
        "承認待ちの申請が100件あります。審査または取り下げ後に申請してください。",
      );
    await assertPlanCurrent(tx, plan);
    return tx.editRequest.create({
      data: {
        authorId: actor.id,
        authorName: user.name ?? "編集者",
        kind,
        resortId,
        submittedPayload: asJson(payload),
        submittedPlan: asJson(plan),
        candidatePayload: asJson(payload),
        candidatePlan: asJson(plan),
        events: { create: { actorId: actor.id, action: "SUBMITTED" } },
      },
      select: { id: true },
    });
  });
  return Object.assign({}, result, { submission: { requestId: request.id } });
}

export async function applyPlan(tx: Prisma.TransactionClient, plan: EditPlan) {
  await assertPlanCurrent(tx, plan);
  if (plan.documents.length)
    await writeDataDocumentsInTransaction(
      tx,
      plan.documents.map(write => ({
        ...write,
        hash: hashDataDocumentContent(write.content),
        fallbackHash: null,
      })),
    );
  if (plan.resort) {
    const result = await updateAdminSkiResortInTransaction(
      tx,
      plan.resort.id,
      plan.resort.request.expectedUpdatedAt,
      plan.resort.request.data,
    );
    if (result.status !== "updated") throw new EditConflictError();
  }
  if (plan.ticket)
    await writeLiftTicketSeasonInTransaction(tx, plan.ticket.write);
}
