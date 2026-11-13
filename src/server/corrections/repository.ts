import "server-only";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { remoteEditRequestResult } from "@/server/edit-requests/remoteClient";
import { correctionDetailSchema, correctionListSchema } from "./remoteContract";

export async function listCorrections() {
  await requireAdmin();
  if (usesRemoteDataApi())
    return remoteEditRequestResult(
      { operation: "correction-list" },
      correctionListSchema,
    );

  const [requests, pendingCount] = await Promise.all([
    prisma.editRequest.findMany({
      where: { kind: "public-correction" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        resortId: true,
        status: true,
        authorName: true,
        createdAt: true,
      },
    }),
    prisma.editRequest.count({
      where: { kind: "public-correction", status: "PENDING" },
    }),
  ]);
  return { requests, pendingCount };
}

export async function getCorrection(id: string) {
  await requireAdmin();
  if (usesRemoteDataApi()) {
    const result = await remoteEditRequestResult(
      { operation: "correction-get", id },
      correctionDetailSchema,
    );
    return result;
  }

  const request = await prisma.editRequest.findUnique({
    where: { id },
    include: {
      photos: {
        select: { id: true, mimeType: true, width: true, height: true },
      },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (request?.kind !== "public-correction")
    return { request: null, pending: [] };
  const pending = await prisma.editRequest.findMany({
    where: {
      resortId: request.resortId,
      kind: "public-correction",
      status: "PENDING",
      id: { not: request.id },
    },
    select: { id: true, candidatePayload: true },
  });
  return { request, pending };
}
