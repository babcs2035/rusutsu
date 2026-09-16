import "server-only";

import {
  fetchInternalDataApi,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import {
  type CrawlMonitorCurrent,
  type CrawlMonitorIssueListQuery,
  type CrawlMonitorIssuePage,
  type CrawlMonitorOverview,
  type CrawlMonitorRunDetail,
  type CrawlMonitorRunListQuery,
  type CrawlMonitorRunPage,
  type CrawlMonitorSourceMode,
  crawlMonitorCurrentsSchema,
  crawlMonitorIssuePageSchema,
  crawlMonitorOverviewSchema,
  crawlMonitorRunDetailSchema,
  crawlMonitorRunPageSchema,
} from "./adminContract";
import {
  fetchCrawlMonitorCurrentsDirect,
  fetchCrawlMonitorIssuesDirect,
  fetchCrawlMonitorOverviewDirect,
  fetchCrawlMonitorRunDetailDirect,
  fetchCrawlMonitorRunsDirect,
} from "./adminRepository";

/**
 * 監視画面のデータ入口。
 *
 * `DATA_API_BASE_URL` があるローカルappは本番の内部APIから読み、本番appはDBを直接読む。
 * 集計は常にDBのある側で行うので、ローカルへ生データを大量に転送しない。
 */

const RESOURCE_PATH = "/api/internal/v1/crawl-latest-monitor";

const readRemote = async <T>(
  query: URLSearchParams,
  schema: { parse(value: unknown): T },
): Promise<T> => {
  const response = await fetchInternalDataApi(
    `${RESOURCE_PATH}?${query.toString()}`,
    {},
    { scope: "diagnostics-read" },
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
  if (!usesRemoteDataApi()) return fetchCrawlMonitorRunsDirect(query);
  return readRemote(
    new URLSearchParams({
      view: "runs",
      resortId: query.resortId,
      sourceModes: query.sourceModes.join(","),
      page: String(query.page),
      pageSize: String(query.pageSize),
    }),
    crawlMonitorRunPageSchema,
  );
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
  runId: string,
): Promise<CrawlMonitorRunDetail | null> {
  if (!usesRemoteDataApi()) return fetchCrawlMonitorRunDetailDirect(runId);
  const response = await fetchInternalDataApi(
    `${RESOURCE_PATH}?${new URLSearchParams({ view: "run", runId })}`,
    {},
    { scope: "diagnostics-read", acceptedErrorStatuses: [404] },
  );
  if (response.status === 404) return null;
  return crawlMonitorRunDetailSchema.parse(await response.json());
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
