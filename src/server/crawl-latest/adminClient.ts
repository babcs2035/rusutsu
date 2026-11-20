import "server-only";

import {
  fetchInternalDataApi,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import {
  type CrawlMonitorCurrent,
  type CrawlMonitorIssueListQuery,
  type CrawlMonitorIssuePage,
  type CrawlMonitorMapping,
  type CrawlMonitorOverview,
  type CrawlMonitorRunDetail,
  type CrawlMonitorRunListQuery,
  type CrawlMonitorRunPage,
  type CrawlMonitorSourceMode,
  crawlMonitorCurrentsSchema,
  crawlMonitorIssuePageSchema,
  crawlMonitorMappingSchema,
  crawlMonitorOverviewSchema,
  crawlMonitorRunDetailSchema,
  crawlMonitorRunPageSchema,
} from "./adminContract";
import {
  fetchCrawlMonitorCurrentsDirect,
  fetchCrawlMonitorIssuesDirect,
  fetchCrawlMonitorMappingDirect,
  fetchCrawlMonitorOverviewDirect,
  fetchCrawlMonitorRunDetailDirect,
  fetchCrawlMonitorRunsDirect,
} from "./adminRepository";

/**
 * 監視画面のデータ入口。
 *
 * `API_BASE_URL` があるローカルappは本番の内部APIから読み、本番appはDBを直接読む。
 * 集計は常にDBのある側で行うので、ローカルへ生データを大量に転送しない。
 */

const RESOURCE_PATH = "/api/admin/crawl/monitor";

const readRemote = async <T>(
  query: URLSearchParams,
  schema: { parse(value: unknown): T },
): Promise<T> => {
  const response = await fetchInternalDataApi(
    `${RESOURCE_PATH}?${query.toString()}`,
    {},
    {},
  );
  return schema.parse(await response.json());
};

export async function fetchCrawlMonitorOverview(
  sourceModes: readonly CrawlMonitorSourceMode[],
): Promise<CrawlMonitorOverview> {
  if (!usesRemoteDataApi()) {
    return fetchCrawlMonitorOverviewDirect(sourceModes);
  }
  return readRemote(
    new URLSearchParams({
      view: "overview",
      sourceModes: sourceModes.join(","),
    }),
    crawlMonitorOverviewSchema,
  );
}

export async function fetchCrawlMonitorRuns(
  query: CrawlMonitorRunListQuery,
): Promise<CrawlMonitorRunPage> {
  if (!usesRemoteDataApi()) {
    return fetchCrawlMonitorRunsDirect(query);
  }
  const params = new URLSearchParams({
    view: "runs",
    resortId: query.resortId,
    origin: query.origin,
    sourceModes: query.sourceModes.join(","),
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  return readRemote(params, crawlMonitorRunPageSchema);
}

export async function fetchCrawlMonitorCurrents(
  resortId: string,
): Promise<CrawlMonitorCurrent[]> {
  if (!usesRemoteDataApi()) {
    return (await fetchCrawlMonitorCurrentsDirect(resortId)).currents;
  }
  const result = await readRemote(
    new URLSearchParams({ view: "currents", resortId }),
    crawlMonitorCurrentsSchema,
  );
  return result.currents;
}

export async function fetchCrawlMonitorRunDetail(
  resortId: string,
  runId: string,
): Promise<CrawlMonitorRunDetail | null> {
  if (!usesRemoteDataApi()) {
    return fetchCrawlMonitorRunDetailDirect(resortId, runId);
  }
  const response = await fetchInternalDataApi(
    `${RESOURCE_PATH}?${new URLSearchParams({ view: "run", resortId, runId })}`,
    {},
    { acceptedErrorStatuses: [404] },
  );
  if (response.status === 404) return null;
  const detail = crawlMonitorRunDetailSchema.parse(await response.json());
  // 別のスキー場のrunを、このスキー場のURLで開かせない。
  return detail.run.resortId === resortId ? detail : null;
}

/** 直近の実行とコース・リフトの対応表を照合する． */
export async function fetchCrawlMonitorMapping(
  resortId: string,
): Promise<CrawlMonitorMapping> {
  if (!usesRemoteDataApi()) {
    return fetchCrawlMonitorMappingDirect(resortId);
  }
  return readRemote(
    new URLSearchParams({ view: "mapping", resortId }),
    crawlMonitorMappingSchema,
  );
}

export async function fetchCrawlMonitorIssues(
  query: CrawlMonitorIssueListQuery,
): Promise<CrawlMonitorIssuePage> {
  if (!usesRemoteDataApi()) return fetchCrawlMonitorIssuesDirect(query);
  const params = new URLSearchParams({
    view: "issues",
    sourceModes: query.sourceModes.join(","),
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.severity) params.set("severity", query.severity);
  if (query.code) params.set("code", query.code);
  if (query.resortId) params.set("resortId", query.resortId);
  if (query.categoryKind) params.set("categoryKind", query.categoryKind);
  if (query.blockingOnly) params.set("blockingOnly", "1");
  if (query.since) params.set("since", query.since);
  return readRemote(params, crawlMonitorIssuePageSchema);
}
