import "server-only";

import type { Weather, YukiMagi } from "@prisma/client";
import { z } from "zod";
import {
  fetchInternalDataApi,
  InternalDataApiError,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import { currentEditCapture } from "@/server/edit-requests/capture";
import {
  type AdminSkiResortRecord,
  type AdminSkiResortUpdateRequest,
  type AdminSkiResortUpdateResult,
  adminSkiResortRecordSchema,
  adminSkiResortUpdateRequestSchema,
  skiResortIdSchema,
} from "@/server/ski-resorts/adminContract";
import {
  type ResortMergeRequest,
  type ResortMergeResult,
  type ResortUnlinkRequest,
  type ResortUnlinkResult,
  resortMergeRequestSchema,
  resortMergeResultSchema,
  resortUnlinkRequestSchema,
  resortUnlinkResultSchema,
  type TicketGroupRequest,
  type TicketGroupResult,
  ticketGroupRequestSchema,
  ticketGroupResultSchema,
} from "@/server/ski-resorts/mergeContract";
import { publicSkiResortSchema } from "@/server/ski-resorts/publicProjection";
import {
  type FullSkiResortRecord,
  findAdminSkiResortsDirect,
  findExistingSkiResortIdsDirect,
  findLinkedAreasDirect,
  findSkiResortByIdDirect,
  findSkiResortNamesDirect,
  findSkiResortsDirect,
  findSkiResortsForEditorDirect,
  findSkiResortsForMapDirect,
  findSkiResortWeatherDirect,
  findYukiMagiListDirect,
  mergeAdminSkiResortsDirect,
  type SkiResortDetailRecord,
  type SkiResortMapRecord,
  unlinkAdminSkiResortsDirect,
  updateAdminSkiResortDirect,
  updateTicketGroupDirect,
} from "@/server/ski-resorts/repository";

type ResortName = { id: string; nameJa: string; shortName: string | null };

export async function mergeAdminSkiResorts(
  rawRequest: ResortMergeRequest,
): Promise<ResortMergeResult> {
  const request = resortMergeRequestSchema.parse(rawRequest);
  if (!usesRemoteDataApi()) return mergeAdminSkiResortsDirect(request);
  const response = await fetchInternalDataApi(
    "/api/internal/v1/ski-resorts/merge",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  return resortMergeResultSchema.parse(await response.json());
}

export async function unlinkAdminSkiResorts(
  rawRequest: ResortUnlinkRequest,
): Promise<ResortUnlinkResult> {
  const request = resortUnlinkRequestSchema.parse(rawRequest);
  if (!usesRemoteDataApi()) return unlinkAdminSkiResortsDirect(request);
  const response = await fetchInternalDataApi(
    "/api/internal/v1/ski-resorts/unlink",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  return resortUnlinkResultSchema.parse(await response.json());
}

export async function updateTicketGroup(
  rawRequest: TicketGroupRequest,
): Promise<TicketGroupResult> {
  const request = ticketGroupRequestSchema.parse(rawRequest);
  if (!usesRemoteDataApi()) return updateTicketGroupDirect(request);
  const response = await fetchInternalDataApi(
    "/api/internal/v1/ski-resorts/ticket-group",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  return ticketGroupResultSchema.parse(await response.json());
}

const parseEnvelope = async <T>(
  response: Response,
  key: string,
): Promise<T> => {
  const untrustedValue = (await response.json()) as unknown;
  if (
    untrustedValue === null ||
    typeof untrustedValue !== "object" ||
    Array.isArray(untrustedValue)
  ) {
    throw new Error("正本データAPIの応答形式が不正です。");
  }
  const value = untrustedValue as Record<string, unknown>;
  if (!(key in value)) {
    throw new Error(`正本データAPIの応答に ${key} がありません。`);
  }
  return value[key] as T;
};

const asDate = (value: unknown): Date => {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error("正本データAPIから不正な日時を受信しました。");
  }
  return date;
};

const reviveWeather = (weather: Weather): Weather => ({
  ...weather,
  date: asDate(weather.date),
  createdAt: asDate(weather.createdAt),
});

export async function readSkiResorts(): Promise<FullSkiResortRecord[]> {
  if (!usesRemoteDataApi()) return findSkiResortsDirect();
  const response = await fetchInternalDataApi(
    "/api/internal/v1/ski-resorts?view=full",
  );
  const resorts = await parseEnvelope<FullSkiResortRecord[]>(
    response,
    "resorts",
  );
  return z.array(publicSkiResortSchema).parse(resorts);
}

export async function readSkiResortsForMap(): Promise<SkiResortMapRecord[]> {
  if (!usesRemoteDataApi()) return findSkiResortsForMapDirect();
  const response = await fetchInternalDataApi(
    "/api/internal/v1/ski-resorts?view=map",
  );
  return parseEnvelope<SkiResortMapRecord[]>(response, "resorts");
}

/** コース・リフト編集用。連携エリアは子ではなく親を1件として返す。 */
export async function readSkiResortsForEditor(): Promise<SkiResortMapRecord[]> {
  if (!usesRemoteDataApi()) return findSkiResortsForEditorDirect();
  try {
    const response = await fetchInternalDataApi(
      "/api/internal/v1/ski-resorts?view=editor",
    );
    return parseEnvelope<SkiResortMapRecord[]>(response, "resorts");
  } catch (error) {
    // 連携エリアに未対応のデータAPIでは、連携エリアがないので地図用の一覧と同じ。
    if (!isUnsupportedViewError(error)) throw error;
    return readSkiResortsForMap();
  }
}

export type LinkedAreaSummary = Awaited<
  ReturnType<typeof findLinkedAreasDirect>
>[number];

const linkedAreaSummarySchema = z.array(
  z.object({
    id: skiResortIdSchema,
    nameJa: z.string(),
    isActive: z.boolean(),
    memberIds: z.array(skiResortIdSchema),
  }),
);

/** Webとデータ APIを別々にデプロイしたとき、旧APIは新しい view を 400 で返す。 */
const isUnsupportedViewError = (error: unknown) =>
  error instanceof InternalDataApiError && error.status === 400;

export async function readLinkedAreas(): Promise<LinkedAreaSummary[]> {
  if (!usesRemoteDataApi()) return findLinkedAreasDirect();
  try {
    const response = await fetchInternalDataApi(
      "/api/internal/v1/ski-resorts?view=linkedAreas",
    );
    return linkedAreaSummarySchema.parse(
      await parseEnvelope<unknown>(response, "areas"),
    );
  } catch (error) {
    // 連携エリアに未対応のデータAPIには、連携エリアもない。
    if (!isUnsupportedViewError(error)) throw error;
    return [];
  }
}

export async function readSkiResortById(
  id: string,
): Promise<SkiResortDetailRecord | null> {
  if (!usesRemoteDataApi()) return findSkiResortByIdDirect(id);
  const response = await fetchInternalDataApi(
    `/api/internal/v1/ski-resorts/${encodeURIComponent(id)}?view=detail`,
  );
  const resort = await parseEnvelope<SkiResortDetailRecord | null>(
    response,
    "resort",
  );
  return publicSkiResortSchema.nullable().parse(resort);
}

export async function readSkiResortWeather(id: string): Promise<Weather[]> {
  if (!usesRemoteDataApi()) return findSkiResortWeatherDirect(id);
  const response = await fetchInternalDataApi(
    `/api/internal/v1/ski-resorts/${encodeURIComponent(id)}?view=weather`,
  );
  const weather = await parseEnvelope<Weather[]>(response, "weather");
  return weather.map(reviveWeather);
}

export async function readYukiMagiList(): Promise<YukiMagi[]> {
  if (!usesRemoteDataApi()) return findYukiMagiListDirect();
  const response = await fetchInternalDataApi("/api/internal/v1/yuki-magi");
  const entries = await parseEnvelope<YukiMagi[]>(response, "entries");
  return entries.map(entry => ({
    ...entry,
    updatedAt: asDate(entry.updatedAt),
  }));
}

export async function readSkiResortNames(
  ids?: string[],
): Promise<ResortName[]> {
  if (!usesRemoteDataApi()) return findSkiResortNamesDirect(ids);
  const search = new URLSearchParams({ view: "names" });
  if (ids) search.set("ids", ids.join(","));
  const response = await fetchInternalDataApi(
    `/api/internal/v1/ski-resorts?${search.toString()}`,
  );
  return parseEnvelope<ResortName[]>(response, "resorts");
}

export async function readExistingSkiResortIds(
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  if (!usesRemoteDataApi()) return findExistingSkiResortIdsDirect(ids);
  const search = new URLSearchParams({ view: "ids", ids: ids.join(",") });
  const response = await fetchInternalDataApi(
    `/api/internal/v1/ski-resorts?${search.toString()}`,
  );
  return parseEnvelope<string[]>(response, "ids");
}

/** 管理画面用。公開停止中のスキー場も含めて返す。 */
export async function readAdminSkiResorts(): Promise<AdminSkiResortRecord[]> {
  if (!usesRemoteDataApi()) return findAdminSkiResortsDirect();
  const response = await fetchInternalDataApi(
    "/api/internal/v1/ski-resorts?view=admin",
  );
  const resorts = await parseEnvelope<unknown>(response, "resorts");
  return z.array(adminSkiResortRecordSchema).parse(resorts);
}

export async function updateAdminSkiResort(
  rawId: string,
  rawRequest: AdminSkiResortUpdateRequest,
): Promise<AdminSkiResortUpdateResult> {
  const id = skiResortIdSchema.parse(rawId);
  const request = adminSkiResortUpdateRequestSchema.parse(rawRequest);
  const capture = currentEditCapture();
  if (capture) {
    const before =
      capture.referencePlan?.resort?.before ??
      (await readAdminSkiResorts()).find(resort => resort.id === id);
    if (!before) return { status: "not_found" };
    if (before.updatedAt !== request.expectedUpdatedAt)
      return { status: "conflict", currentUpdatedAt: before.updatedAt };
    capture.plan.resort = { id, request, before };
    return { status: "updated", resort: { ...before, ...request.data } };
  }
  if (!usesRemoteDataApi()) {
    return updateAdminSkiResortDirect(
      id,
      request.expectedUpdatedAt,
      request.data,
    );
  }

  const response = await fetchInternalDataApi(
    `/api/internal/v1/ski-resorts/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    { acceptedErrorStatuses: [404, 409] },
  );

  if (response.status === 404) return { status: "not_found" };
  if (response.status === 409) {
    const body = z
      .object({
        error: z.object({
          currentUpdatedAt: z.iso.datetime({ offset: true }),
        }),
      })
      .parse(await response.json());
    return {
      status: "conflict",
      currentUpdatedAt: body.error.currentUpdatedAt,
    };
  }

  const resort = await parseEnvelope<unknown>(response, "resort");
  return {
    status: "updated",
    resort: adminSkiResortRecordSchema.parse(resort),
  };
}
