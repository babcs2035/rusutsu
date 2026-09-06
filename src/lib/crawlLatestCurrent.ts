import "server-only";

import {
  fetchInternalDataApi,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import type {
  LatestStatusKind,
  LatestSuccessfulStatus,
} from "@/lib/latestStatusFiles";
import {
  findCurrentCrawlLatestStatusDirect,
  listCurrentCrawlLatestResortIdsDirect,
} from "@/server/crawl-latest/current";

const parseObjectEnvelope = async <T>(
  response: Response,
  key: string,
): Promise<T> => {
  const value = (await response.json()) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("正本データAPIの応答形式が不正です。");
  }
  const record = value as Record<string, unknown>;
  if (!(key in record)) {
    throw new Error(`正本データAPIの応答に ${key} がありません。`);
  }
  return record[key] as T;
};

export async function readCurrentCrawlLatestStatus(
  resortId: string,
  kind: LatestStatusKind,
): Promise<LatestSuccessfulStatus | null> {
  if (!usesRemoteDataApi()) {
    return findCurrentCrawlLatestStatusDirect(resortId, kind);
  }
  const search = new URLSearchParams({ resortId, kind, view: "status" });
  const response = await fetchInternalDataApi(
    `/api/internal/v1/crawl-latest-current?${search.toString()}`,
  );
  return parseObjectEnvelope<LatestSuccessfulStatus | null>(response, "status");
}

export async function listCurrentCrawlLatestResortIds(
  kind: LatestStatusKind,
): Promise<string[]> {
  if (!usesRemoteDataApi()) {
    return listCurrentCrawlLatestResortIdsDirect(kind);
  }
  const search = new URLSearchParams({ kind, view: "resortIds" });
  const response = await fetchInternalDataApi(
    `/api/internal/v1/crawl-latest-current?${search.toString()}`,
  );
  return parseObjectEnvelope<string[]>(response, "resortIds");
}
