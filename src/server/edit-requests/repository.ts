import "server-only";
import { buildLiftReview } from "@/features/edit-requests/liftReview";
import { courseLinesFromDocuments } from "@/features/edit-requests/mapContext";
import { buildSlopeReview } from "@/features/edit-requests/slopeReview";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/requireEditor";
import { readSkiResortById } from "@/lib/skiResortData";
import { getDataDocument } from "@/server/data-documents/client";
import { getDataDocumentDirect } from "@/server/data-documents/repository";
import { type EditKind, type EditPlan, requestIdSchema } from "./contract";
import { assertCanReadRequest } from "./policy";
import { remoteEditRequestResult } from "./remoteClient";
import {
  remoteRequestDetailSchema,
  remoteRequestListSchema,
} from "./remoteContract";
import { ensureLocalWorkflow } from "./workflow";

const COURSE_FOLDERS = [
  ["slope_before", "slope_10m"],
  ["slope_before_osm", "slope_10m_osm"],
];
const LIFT_FOLDERS = [["lift_before", "lift_20m"]];

/** 申請の地図で背景に出す、もう一方の種類（リフトならコース）の線。 */
async function readContextLines(
  resortId: string,
  folderGroups: string[][],
  readDocument: (key: string) => Promise<{ content: string } | null>,
) {
  const documents = await Promise.all(
    folderGroups.map(async folders => {
      for (const folder of folders) {
        const document = await readDocument(
          `resorts-temporary/${folder}/${resortId}.geojson`,
        );
        if (document) return document;
      }
      return null;
    }),
  );
  return courseLinesFromDocuments(
    documents.flatMap(document => (document ? [document] : [])),
  );
}

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
  const resorts = await prisma.skiResort.findMany({
    where: {
      id: { in: [...new Set(requests.map(request => request.resortId))] },
    },
    select: { id: true, nameJa: true },
  });
  const resortNames = new Map(
    resorts.map(resort => [resort.id, resort.nameJa]),
  );
  return {
    isAdmin: actor.role === "admin",
    requests: requests.map(request => ({
      ...request,
      resortName: resortNames.get(request.resortId) ?? null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    })),
  };
}
export async function getEditRequest(id: string) {
  const actor = await requireEditor();
  requestIdSchema.parse(id);
  if (usesRemoteDataApi()) {
    const request = await remoteEditRequestResult(
      { operation: "get", id },
      remoteRequestDetailSchema,
    );
    const [courseLines, liftLines, resort] = await Promise.all([
      request.kind === "lift" && !request.courseLines
        ? readContextLines(request.resortId, COURSE_FOLDERS, getDataDocument)
        : Promise.resolve(request.courseLines ?? []),
      request.kind === "slope" && !request.liftLines
        ? readContextLines(request.resortId, LIFT_FOLDERS, getDataDocument)
        : Promise.resolve(request.liftLines ?? []),
      request.resortName
        ? Promise.resolve(null)
        : readSkiResortById(request.resortId),
    ]);
    return {
      ...request,
      resortName: request.resortName ?? resort?.nameJa ?? null,
      slopeReview:
        request.slopeReview ??
        (request.kind === "slope" && request.submittedPlan
          ? buildSlopeReview(request.submittedPlan)
          : null),
      courseLines,
      liftLines,
    };
  }
  ensureLocalWorkflow();
  const request = await prisma.editRequest.findFirst({
    where: { id, ...(actor.role === "admin" ? {} : { authorId: actor.id }) },
  });
  if (!request)
    throw new Error("申請が見つからないか、アクセス権限がありません。");
  assertCanReadRequest(actor, request);
  const resort = await prisma.skiResort.findUnique({
    where: { id: request.resortId },
    select: { nameJa: true },
  });
  const [courseLines, liftLines] = await Promise.all([
    request.kind === "lift"
      ? readContextLines(
          request.resortId,
          COURSE_FOLDERS,
          getDataDocumentDirect,
        )
      : [],
    request.kind === "slope"
      ? readContextLines(request.resortId, LIFT_FOLDERS, getDataDocumentDirect)
      : [],
  ]);
  return {
    id: request.id,
    kind: request.kind as EditKind,
    resortId: request.resortId,
    resortName: resort?.nameJa ?? null,
    status: request.status,
    version: request.version,
    authorName: request.authorName,
    isAdmin: actor.role === "admin",
    comment: request.reviewComment,
    createdAt: request.createdAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
    submittedPayload: request.submittedPayload,
    liftReview:
      request.kind === "lift"
        ? buildLiftReview(request.submittedPlan as unknown as EditPlan)
        : null,
    slopeReview:
      request.kind === "slope"
        ? buildSlopeReview(request.submittedPlan as unknown as EditPlan)
        : null,
    courseLines,
    liftLines,
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

/** 通常の編集画面で申請を直すための内容。管理者が確認待ちの申請を開くときだけ返す。 */
export async function getRequestEditContext(
  id: string,
  kind: "slope" | "lift",
) {
  const request = await getEditRequest(id);
  if (!request.isAdmin || request.status !== "PENDING" || request.kind !== kind)
    return null;
  return {
    id: request.id,
    version: request.version,
    comment: request.comment ?? "",
    resortId: request.resortId,
    authorName: request.authorName,
    payload: request.candidatePayload ?? request.submittedPayload,
  };
}
