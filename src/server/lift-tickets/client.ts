import "server-only";

import {
  fetchInternalDataApi,
  InternalDataApiError,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import { currentEditCapture } from "@/server/edit-requests/capture";
import {
  LiftTicketConflictError,
  type LiftTicketSeason,
  type LiftTicketSeasonSummary,
  type LiftTicketSeasonWrite,
  liftTicketConflictResponseSchema,
  liftTicketSeasonDataResponseSchema,
  liftTicketSeasonGetResponseSchema,
  liftTicketSeasonListResponseSchema,
  liftTicketSeasonWriteResponseSchema,
  liftTicketSeasonWriteSchema,
  statusOfLiftTicket,
} from "./contract";
import {
  findLiftTicketSeasonsDirect,
  getLiftTicketSeasonDirect,
  listLiftTicketSeasonsDirect,
  writeLiftTicketSeasonDirect,
} from "./repository";

export const LIFT_TICKETS_API_PATH = "/api/internal/v1/lift-tickets";
// URLの長さを抑えるため、公開画面の一括取得はこの件数ずつ分けて問い合わせる。
const REMOTE_RESORT_ID_CHUNK = 50;

const parseRemote = async <T>(
  response: Response,
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
  },
): Promise<T> => {
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success)
    throw new InternalDataApiError(
      "リフト券APIの応答形式が不正です。",
      response.status,
    );
  return parsed.data;
};

export const listLiftTicketSeasons = async (): Promise<
  LiftTicketSeasonSummary[]
> => {
  if (!usesRemoteDataApi()) return listLiftTicketSeasonsDirect();
  const response = await fetchInternalDataApi(LIFT_TICKETS_API_PATH);
  return (await parseRemote(response, liftTicketSeasonListResponseSchema))
    .seasons;
};

export const getLiftTicketSeason = async (
  resortId: string,
  seasonId: string,
): Promise<LiftTicketSeason | null> => {
  if (!usesRemoteDataApi())
    return getLiftTicketSeasonDirect(resortId, seasonId);
  const query = new URLSearchParams({ resortId, seasonId });
  const response = await fetchInternalDataApi(
    `${LIFT_TICKETS_API_PATH}?${query}`,
  );
  return (await parseRemote(response, liftTicketSeasonGetResponseSchema))
    .season;
};

export const findLiftTicketSeasons = async (
  resortIds: readonly string[],
): Promise<LiftTicketSeason[]> => {
  if (!usesRemoteDataApi()) return findLiftTicketSeasonsDirect(resortIds);
  const chunks: string[][] = [];
  for (let i = 0; i < resortIds.length; i += REMOTE_RESORT_ID_CHUNK)
    chunks.push(resortIds.slice(i, i + REMOTE_RESORT_ID_CHUNK));
  const results = await Promise.all(
    chunks.map(async chunk => {
      const query = new URLSearchParams({ resortIds: chunk.join(",") });
      const response = await fetchInternalDataApi(
        `${LIFT_TICKETS_API_PATH}?${query}`,
      );
      return (await parseRemote(response, liftTicketSeasonDataResponseSchema))
        .seasons;
    }),
  );
  return results.flat();
};

export const writeLiftTicketSeason = async (
  write: LiftTicketSeasonWrite,
): Promise<LiftTicketSeason> => {
  const capture = currentEditCapture();
  if (capture) {
    const parsed = liftTicketSeasonWriteSchema.parse(write);
    const before =
      capture.referencePlan?.ticket?.before ??
      (await getLiftTicketSeason(parsed.resortId, parsed.seasonId));
    if ((before?.version ?? null) !== parsed.expectedVersion)
      throw new LiftTicketConflictError(before?.version ?? null);
    capture.plan.ticket = { write: parsed, before };
    return {
      resortId: parsed.resortId,
      seasonId: parsed.seasonId,
      data: parsed.data,
      version: (before?.version ?? 0) + 1,
      status: statusOfLiftTicket(parsed.data),
      updatedAt: new Date().toISOString(),
    };
  }
  if (!usesRemoteDataApi()) return writeLiftTicketSeasonDirect(write);
  const response = await fetchInternalDataApi(
    LIFT_TICKETS_API_PATH,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(liftTicketSeasonWriteSchema.parse(write)),
    },
    { acceptedErrorStatuses: [409] },
  );
  if (response.status === 409) {
    const conflict = await parseRemote(
      response,
      liftTicketConflictResponseSchema,
    );
    throw new LiftTicketConflictError(conflict.error.details.actualVersion);
  }
  return (await parseRemote(response, liftTicketSeasonWriteResponseSchema))
    .season;
};
