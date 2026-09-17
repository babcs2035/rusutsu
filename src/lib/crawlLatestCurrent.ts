import "server-only";

import {
  fetchInternalDataApi,
  InternalDataApiError,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import type {
  LatestStatusKind,
  LatestSuccessfulStatus,
} from "@/lib/latestStatusFiles";
import {
  findAvailableCrawlLatestStatusDirect,
  listAvailableCrawlLatestResortIdsDirect,
} from "@/server/crawl-latest/availableStatus";

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
    return findAvailableCrawlLatestStatusDirect(resortId, kind);
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
    return listAvailableCrawlLatestResortIdsDirect(kind);
  }
  const search = new URLSearchParams({ kind, view: "resortIds" });
  const response = await fetchInternalDataApi(
    `/api/internal/v1/crawl-latest-current?${search.toString()}`,
  );
  return parseObjectEnvelope<string[]>(response, "resortIds");
}

/** 名称対応付け専用。Wayback検証結果へのフォールバックを許可する。 */
export async function readMappingCrawlLatestStatus(
  resortId: string,
  kind: LatestStatusKind,
): Promise<LatestSuccessfulStatus | null> {
  if (!usesRemoteDataApi())
    return findAvailableCrawlLatestStatusDirect(
      resortId,
      kind,
      undefined,
      undefined,
      true,
    );
  const search = new URLSearchParams({ resortId, kind, view: "mappingStatus" });
  const response = await fetchInternalDataApi(
    `/api/internal/v1/crawl-latest-current?${search}`,
  );
  return parseObjectEnvelope(response, "status");
}

export async function listMappingCrawlLatestResortIds(
  kind: LatestStatusKind,
): Promise<string[]> {
  if (!usesRemoteDataApi())
    return listAvailableCrawlLatestResortIdsDirect(
      kind,
      undefined,
      undefined,
      true,
    );
  const search = new URLSearchParams({ kind, view: "mappingResortIds" });
  const response = await fetchInternalDataApi(
    `/api/internal/v1/crawl-latest-current?${search}`,
  );
  return parseObjectEnvelope(response, "resortIds");
}

export async function readCurrentResortConditions(
  resortId: string,
): Promise<
  import("@/features/resort-detail/utils/currentConditions").ResortConditions
> {
  if (!usesRemoteDataApi()) {
    const { readAvailableConditions } = await import(
      "@/server/crawl-latest/conditions"
    );
    return readAvailableConditions(resortId);
  }
  const search = new URLSearchParams({
    resortId,
    kind: "courses",
    view: "conditions",
  });
  try {
    const response = await fetchInternalDataApi(
      `/api/internal/v1/crawl-latest-current?${search}`,
    );
    return parseObjectEnvelope(response, "conditions");
  } catch (error) {
    // Allow the web app and data API to be deployed separately. Historical
    // captures retain their original source URLs, timestamp and archive label.
    if (
      !(error instanceof InternalDataApiError) ||
      ![400, 404].includes(error.status ?? 0)
    )
      throw error;
    const { readBundledResortConditions } = await import(
      "./bundledResortConditions"
    );
    return readBundledResortConditions(resortId);
  }
}
