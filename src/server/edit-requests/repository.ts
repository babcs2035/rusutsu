import "server-only";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/requireEditor";
import { type EditKind, type EditPlan, requestIdSchema } from "./contract";
import { assertCanReadRequest } from "./policy";
import { remoteEditRequestResult } from "./remoteClient";
import {
  remoteRequestDetailSchema,
  remoteRequestListSchema,
} from "./remoteContract";
import { ensureLocalWorkflow } from "./workflow";

export async function listEditRequests() {
  const actor = await requireEditor();
  if (usesRemoteDataApi())
    return remoteEditRequestResult(
      { operation: "list" },
      remoteRequestListSchema,
    );
  ensureLocalWorkflow();
  const requests = await prisma.editRequest.findMany({
    where: actor.role === "admin" ? undefined : { authorId: actor.id },
    // Never join users/accounts or return email to clients.
    select: {
      id: true,
      kind: true,
      resortId: true,
      status: true,
      authorName: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return {
    isAdmin: actor.role === "admin",
    requests: requests.map(request => ({
      ...request,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    })),
  };
}
export async function getEditRequest(id: string) {
  const actor = await requireEditor();
  requestIdSchema.parse(id);
  if (usesRemoteDataApi())
    return remoteEditRequestResult(
      { operation: "get", id },
      remoteRequestDetailSchema,
    );
  ensureLocalWorkflow();
  const request = await prisma.editRequest.findFirst({
    where: { id, ...(actor.role === "admin" ? {} : { authorId: actor.id }) },
  });
  if (!request)
    throw new Error("申請が見つからないか、アクセス権限がありません。");
  assertCanReadRequest(actor, request);
  return {
    id: request.id,
    kind: request.kind as EditKind,
    resortId: request.resortId,
    status: request.status,
    version: request.version,
    authorName: request.authorName,
    isAdmin: actor.role === "admin",
    comment: request.reviewComment,
    createdAt: request.createdAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
    submittedPayload: request.submittedPayload,
    // Editors see their own submitted change, status, and comment only.
    candidatePayload: actor.role === "admin" ? request.candidatePayload : null,
    submittedPlan:
      actor.role === "admin"
        ? (request.submittedPlan as unknown as EditPlan)
        : null,
    candidatePlan:
      actor.role === "admin"
        ? (request.candidatePlan as unknown as EditPlan)
        : null,
  };
}
