import "server-only";

import {
  fetchInternalDataApi,
  InternalDataApiError,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import {
  type ResortLinkRecord,
  type ResortLinkSummary,
  resortLinkListResponseSchema,
  resortLinkSummaryResponseSchema,
} from "./contract";
import {
  findResortLinksBySourceDirect,
  findResortLinksDirect,
  summarizeResortLinksDirect,
} from "./repository";

export const RESORT_LINKS_API_PATH = "/api/internal/v1/resort-links";

const parseRemote = async <T>(
  response: Response,
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
  },
): Promise<T> => {
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success)
    throw new InternalDataApiError(
      "リンクAPIの応答形式が不正です。",
      response.status,
    );
  return parsed.data;
};

/**
 * 画面が使う窓口。DATA_API_BASE_URL を設定したローカルサーバーは本番APIを、
 * 本番サーバーは同じDBを直接読む。
 */
export const findResortLinks = async (
  resortIds: readonly string[],
): Promise<ResortLinkRecord[]> => {
  if (resortIds.length === 0) return [];
  if (!usesRemoteDataApi()) return findResortLinksDirect(resortIds);
  const query = new URLSearchParams({ resortIds: resortIds.join(",") });
  const response = await fetchInternalDataApi(
    `${RESORT_LINKS_API_PATH}?${query}`,
  );
  return (await parseRemote(response, resortLinkListResponseSchema)).links;
};

export const findResortLinksBySource = async (
  source: string,
): Promise<ResortLinkRecord[]> => {
  if (!usesRemoteDataApi()) return findResortLinksBySourceDirect(source);
  const query = new URLSearchParams({ source });
  const response = await fetchInternalDataApi(
    `${RESORT_LINKS_API_PATH}?${query}`,
  );
  return (await parseRemote(response, resortLinkListResponseSchema)).links;
};

export const summarizeResortLinks = async (): Promise<ResortLinkSummary[]> => {
  if (!usesRemoteDataApi()) return summarizeResortLinksDirect();
  const response = await fetchInternalDataApi(RESORT_LINKS_API_PATH);
  return (await parseRemote(response, resortLinkSummaryResponseSchema)).summary;
};
