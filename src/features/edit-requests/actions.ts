"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { requireEditor } from "@/lib/requireEditor";
import {
  assertCorrectionScope,
  type EditKind,
  type EditPlan,
  requestIdSchema,
  requestVersionSchema,
  reviewCommentSchema,
} from "@/server/edit-requests/contract";
import { drainEditRequestJobs } from "@/server/edit-requests/jobs";
import {
  assertCanReadRequest,
  assertPendingVersion,
  assertReviewActors,
  CanonicalEditConflictError,
  EditConflictError,
} from "@/server/edit-requests/policy";
import { prepareCandidate } from "@/server/edit-requests/prepare";
import { remoteEditRequestResult } from "@/server/edit-requests/remoteClient";
import {
  remoteMutationSchema,
  remoteRevisionSchema,
} from "@/server/edit-requests/remoteContract";
import {
  applyPlan,
  asJson,
  assertPlanCurrent,
  ensureLocalWorkflow,
  serializable,
} from "@/server/edit-requests/workflow";

const refresh = (id: string) => {
  revalidatePath("/admin/requests");
  revalidatePath(`/admin/requests/${id}`);
};
const failure = (error: unknown) => ({
  ok: false as const,
  error:
    error instanceof Error && !("code" in error)
      ? error.message.slice(0, 2000)
      : "処理できませんでした。最新の状態を確認して再度お試しください。",
});

export async function saveRequestCandidate(
  id: string,
  expectedVersion: number,
  payload: unknown,
  comment: string,
) {
  try {
    const actor = await requireAdmin();
    if (usesRemoteDataApi()) {
      const result = await remoteEditRequestResult(
        { operation: "revise", id, version: expectedVersion, payload, comment },
        remoteRevisionSchema,
      );
      if (result.ok) refresh(id);
      return result;
    }
    ensureLocalWorkflow();
    requestIdSchema.parse(id);
    requestVersionSchema.parse(expectedVersion);
    const parsedComment = reviewCommentSchema.parse(comment);
    const request = await prisma.editRequest.findUnique({ where: { id } });
    assertPendingVersion(request, expectedVersion);
    if (!request) throw new EditConflictError();
    assertCorrectionScope(request.submittedPayload, payload);
    const plan = await prepareCandidate(
      request.kind as EditKind,
      payload,
      request.submittedPlan as unknown as EditPlan,
    );
    const version = await serializable(async tx => {
      const user = await tx.user.findUnique({
        where: { id: actor.id },
        select: { role: true },
      });
      if (user?.role !== "admin") throw new Error("管理者権限が必要です。");
      const updated = await tx.editRequest.updateMany({
        where: { id, status: "PENDING", version: expectedVersion },
        data: {
          candidatePayload: asJson(payload),
          candidatePlan: asJson(plan),
          reviewComment: parsedComment,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new EditConflictError();
      await tx.editRequestEvent.create({
        data: {
          requestId: id,
          actorId: actor.id,
          action: "REVISED",
          payload: asJson({ payload, plan, comment: parsedComment }),
        },
      });
      return expectedVersion + 1;
    });
    refresh(id);
    return { ok: true as const, version, plan };
  } catch (error) {
    return failure(error);
  }
}

export async function approveEditRequest(id: string, expectedVersion: number) {
  try {
    const actor = await requireAdmin();
    if (usesRemoteDataApi()) {
      const result = await remoteEditRequestResult(
        { operation: "approve", id, version: expectedVersion },
        remoteMutationSchema,
      );
      refresh(id);
      if (result.ok) revalidatePath("/", "layout");
      return result;
    }
    ensureLocalWorkflow();
    requestIdSchema.parse(id);
    requestVersionSchema.parse(expectedVersion);
    await serializable(async tx => {
      const request = await tx.editRequest.findUnique({ where: { id } });
      assertPendingVersion(request, expectedVersion);
      if (!request) throw new EditConflictError();
      const [admin, author] = await Promise.all([
        tx.user.findUnique({ where: { id: actor.id }, select: { role: true } }),
        tx.user.findUnique({
          where: { id: request.authorId },
          select: { role: true },
        }),
      ]);
      assertReviewActors(admin, author);
      const claimed = await tx.editRequest.updateMany({
        where: { id, status: "PENDING", version: expectedVersion },
        data: {
          status: "APPLIED",
          version: { increment: 1 },
          reviewedById: actor.id,
          resolvedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw new EditConflictError();
      const plan = request.candidatePlan as unknown as EditPlan;
      await applyPlan(tx, plan);
      await tx.editRequestEvent.create({
        data: {
          requestId: id,
          actorId: actor.id,
          action: "APPLIED",
          payload: asJson({
            payload: request.candidatePayload,
            plan,
            comment: request.reviewComment,
          }),
        },
      });
      if (plan.elevations.length)
        await tx.editRequestJob.createMany({
          data: plan.elevations.map(job => ({
            requestId: id,
            payload: asJson(job),
          })),
        });
    });
    refresh(id);
    revalidatePath("/", "layout");
    after(() => drainEditRequestJobs());
    return { ok: true as const };
  } catch (error) {
    // A genuine canonical-data conflict is terminal, but a stale review version
    // or racing withdrawal must not overwrite the winning transition.
    if (error instanceof CanonicalEditConflictError) {
      // Recheck after rollback and use the original version, so a racing
      // revision, withdrawal, approval or permission revocation wins safely.
      try {
        const actor = await requireAdmin();
        await serializable(async tx => {
          const admin = await tx.user.findUnique({
            where: { id: actor.id },
            select: { role: true },
          });
          if (admin?.role !== "admin") return;
          const request = await tx.editRequest.findUnique({ where: { id } });
          if (
            request?.status !== "PENDING" ||
            request.version !== expectedVersion
          )
            return;
          try {
            await assertPlanCurrent(
              tx,
              request.candidatePlan as unknown as EditPlan,
            );
            return;
          } catch (conflict) {
            if (!(conflict instanceof CanonicalEditConflictError))
              throw conflict;
          }
          const comment =
            "申請後に元データが更新されました。最新データから再申請してください。";
          const updated = await tx.editRequest.updateMany({
            where: { id, status: "PENDING", version: expectedVersion },
            data: {
              status: "CONFLICT",
              version: { increment: 1 },
              reviewComment: comment,
              reviewedById: actor.id,
              resolvedAt: new Date(),
            },
          });
          if (updated.count === 1)
            await tx.editRequestEvent.create({
              data: {
                requestId: id,
                actorId: actor.id,
                action: "CONFLICT",
                payload: { comment },
              },
            });
        });
      } catch {
        /* Original error is retained; no partial data was applied. */
      }
    }
    if (error instanceof EditConflictError) refresh(id);
    return failure(error);
  }
}

export async function rejectEditRequest(
  id: string,
  version: number,
  comment: string,
) {
  try {
    const actor = await requireAdmin();
    if (usesRemoteDataApi()) {
      const result = await remoteEditRequestResult(
        { operation: "reject", id, version, comment },
        remoteMutationSchema,
      );
      if (result.ok) refresh(id);
      return result;
    }
    ensureLocalWorkflow();
    requestIdSchema.parse(id);
    requestVersionSchema.parse(version);
    const reason = reviewCommentSchema
      .min(1, "却下理由を入力してください。")
      .parse(comment);
    await serializable(async tx => {
      const user = await tx.user.findUnique({
        where: { id: actor.id },
        select: { role: true },
      });
      if (user?.role !== "admin") throw new Error("管理者権限が必要です。");
      const updated = await tx.editRequest.updateMany({
        where: { id, status: "PENDING", version },
        data: {
          status: "REJECTED",
          version: { increment: 1 },
          reviewComment: reason,
          reviewedById: actor.id,
          resolvedAt: new Date(),
        },
      });
      if (updated.count !== 1) throw new EditConflictError();
      await tx.editRequestEvent.create({
        data: {
          requestId: id,
          actorId: actor.id,
          action: "REJECTED",
          payload: { comment: reason },
        },
      });
    });
    refresh(id);
    return { ok: true as const };
  } catch (error) {
    return failure(error);
  }
}
export async function withdrawEditRequest(id: string, version: number) {
  try {
    const actor = await requireEditor();
    if (usesRemoteDataApi()) {
      const result = await remoteEditRequestResult(
        { operation: "withdraw", id, version },
        remoteMutationSchema,
      );
      if (result.ok) refresh(id);
      return result;
    }
    ensureLocalWorkflow();
    requestIdSchema.parse(id);
    requestVersionSchema.parse(version);
    await serializable(async tx => {
      const user = await tx.user.findUnique({
        where: { id: actor.id },
        select: { role: true },
      });
      if (user?.role !== "editor" && user?.role !== "admin")
        throw new Error("編集権限が必要です。");
      const request = await tx.editRequest.findUnique({ where: { id } });
      if (!request) throw new Error("申請が見つかりません。");
      // Withdrawal always belongs to the author, including administrators.
      assertCanReadRequest({ id: actor.id, role: "editor" }, request);
      assertPendingVersion(request, version);
      const updated = await tx.editRequest.updateMany({
        where: { id, authorId: actor.id, status: "PENDING", version },
        data: {
          status: "WITHDRAWN",
          version: { increment: 1 },
          resolvedAt: new Date(),
        },
      });
      if (updated.count !== 1) throw new EditConflictError();
      await tx.editRequestEvent.create({
        data: { requestId: id, actorId: actor.id, action: "WITHDRAWN" },
      });
    });
    refresh(id);
    return { ok: true as const };
  } catch (error) {
    return failure(error);
  }
}
