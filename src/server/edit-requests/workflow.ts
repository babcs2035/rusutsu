import "server-only";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/requireEditor";
import { readMapOrDataDocument } from "@/server/course-lift/canonicalDocuments";
import { writeDataDocumentsInTransaction } from "@/server/data-documents/repository";
import { hashDataDocumentContent } from "@/server/data-documents/repositoryCore";
import { liftTicketSeasonSchema } from "@/server/lift-tickets/contract";
import { writeLiftTicketSeasonInTransaction } from "@/server/lift-tickets/repository";
import { adminSkiResortUpdateRequestSchema } from "@/server/ski-resorts/adminContract";
import {
  readAdminSkiResortInTransaction,
  updateAdminSkiResortInTransaction,
} from "@/server/ski-resorts/repository";
import { collectEdit, currentEditCapture } from "./capture";
import {
  assertBoundedPayload,
  type EditKind,
  type EditPlan,
  type Submission,
} from "./contract";
import { mergeDocumentContent, mergeValues } from "./mergeContent";
import { withAdminOverwrite } from "./overwriteContext";
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
    const row = await readMapOrDataDocument(tx, key);
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
  if (actor.role === "admin") {
    const overwrite =
      kind === "slope" &&
      typeof payload === "object" &&
      payload !== null &&
      "forceOverwrite" in payload &&
      payload.forceOverwrite === true;
    return overwrite ? withAdminOverwrite(operation) : operation();
  }
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

const resortFieldLabel = (key: string) => `スキー場情報 › ${key}`;

/**
 * 申請内容を、今の公開内容の上に項目ごとに重ね直す。
 *
 * 申請後に別の保存があっても、違うスキー場や違う項目なら競合にしない。
 * 同じ項目を両方が別の値に変えたときだけ conflicts に入れる（値は申請内容）。
 * 標高を付け直す派生データは、反映後に元データから作り直すので競合を数えない。
 */
export async function rebasePlan(
  tx: Prisma.TransactionClient,
  input: EditPlan,
): Promise<{ plan: EditPlan; conflicts: string[] }> {
  const conflicts: string[] = [];
  const derivedKeys = new Set(input.elevations.map(task => task.key));
  const beforeDocuments: EditPlan["beforeDocuments"] = [];
  const documents: EditPlan["documents"] = [];
  for (const write of input.documents) {
    const current = await readMapOrDataDocument(tx, write.key);
    beforeDocuments.push({
      key: write.key,
      document: current ? { ...current, source: "database" as const } : null,
    });
    const merged = mergeDocumentContent(
      input.beforeDocuments.find(item => item.key === write.key)?.document
        ?.content ?? null,
      current?.content ?? null,
      write.content,
      write.key,
    );
    if (!derivedKeys.has(write.key)) conflicts.push(...merged.conflicts);
    documents.push({
      ...write,
      content: merged.value,
      expectedHash: current?.hash ?? null,
    });
  }
  const plan: EditPlan = { ...input, beforeDocuments, documents };
  if (input.resort) {
    const current = await readAdminSkiResortInTransaction(tx, input.resort.id);
    if (!current) throw new Error("対象のスキー場が見つかりません。");
    const data = { ...input.resort.request.data };
    const before = input.resort.before as Record<string, unknown>;
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      const merged = mergeValues(
        before[key],
        current[key],
        data[key],
        resortFieldLabel(key),
      );
      conflicts.push(...merged.conflicts);
      Object.assign(data, { [key]: merged.value });
    }
    const request = adminSkiResortUpdateRequestSchema.safeParse({
      expectedUpdatedAt: current.updatedAt,
      data,
    });
    if (!request.success) {
      // 名称とふりがなを別々の人が直したなど、重ねると成り立たない組み合わせ
      conflicts.push(resortFieldLabel("nameRuby"));
    }
    plan.resort = {
      ...input.resort,
      before: current,
      request: request.success
        ? request.data
        : {
            ...input.resort.request,
            expectedUpdatedAt: current.updatedAt,
          },
    };
  }
  if (input.ticket) {
    const { resortId, seasonId } = input.ticket.write;
    const row = await tx.liftTicketSeason.findUnique({
      where: { skiResortId_seasonId: { skiResortId: resortId, seasonId } },
    });
    const current = row
      ? liftTicketSeasonSchema.parse({
          resortId,
          seasonId,
          data: row.data,
          version: row.version,
          status: row.status,
          updatedAt: row.updatedAt.toISOString(),
        })
      : null;
    const merged = mergeValues(
      input.ticket.before?.data,
      current?.data,
      input.ticket.write.data,
      `リフト券 ${seasonId}`,
    );
    conflicts.push(...merged.conflicts);
    plan.ticket = {
      before: current,
      write: {
        ...input.ticket.write,
        data: merged.value,
        expectedVersion: current?.version ?? null,
      },
    };
  }
  return { plan, conflicts: [...new Set(conflicts)] };
}

/**
 * 申請を公開データへ反映する。
 * 項目が競合しているときは、管理者が採用を選んだ（overwrite）場合だけ反映する。
 */
export async function applyPlan(
  tx: Prisma.TransactionClient,
  input: EditPlan,
  { overwrite = false }: { overwrite?: boolean } = {},
) {
  const { plan, conflicts } = await rebasePlan(tx, input);
  if (conflicts.length && !overwrite) throw new CanonicalEditConflictError();
  const written = plan.documents.length
    ? await writeDataDocumentsInTransaction(
        tx,
        plan.documents.map(write => ({
          ...write,
          hash: hashDataDocumentContent(write.content),
          fallbackHash: null,
        })),
      )
    : [];
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
  return {
    ...plan,
    elevations: plan.elevations.map(task => {
      const document = written.find(item => item.key === task.key);
      if (!document) return task;
      const sourceKey = task.key
        .replace("slope_10m_osm/", "slope_before_osm/")
        .replace("slope_10m/", "slope_before/")
        .replace("lift_20m/", "lift_before/");
      const source = written.find(item => item.key === sourceKey);
      return {
        ...task,
        content: document.content,
        hash: document.hash,
        source: source ? JSON.parse(source.content) : task.source,
      };
    }),
  };
}
