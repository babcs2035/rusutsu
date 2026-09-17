import "server-only";

import {
  fetchInternalDataApi,
  InternalDataApiError,
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
  type CrawlMonitorRunResult,
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
 * `DATA_API_BASE_URL` があるローカルappは本番の内部APIから読み、本番appはDBを直接読む。
 * 集計は常にDBのある側で行うので、ローカルへ生データを大量に転送しない。
 */

const RESOURCE_PATH = "/api/internal/v1/crawl-latest-monitor";

/**
 * 接続先のAPIがこの画面より古く、`origin` を知らないときの応答。
 *
 * ファイルの記録はサーバー側のファイルを読む処理なので、接続先を更新するまでは
 * 提供できない。エラーで落とさず「読めない」と分かる形にするためだけに使う。
 */
const rejectsUnknownQuery = (body: unknown): boolean =>
  typeof body === "object" &&
  body !== null &&
  "error" in body &&
  typeof (body as { error: unknown }).error === "object" &&
  (body as { error: { code?: unknown; message?: unknown } }).error?.code ===
    "INVALID_QUERY" &&
  (body as { error: { message?: unknown } }).error?.message ===
    "Unknown query parameter";

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
): Promise<CrawlMonitorRunResult> {
  if (!usesRemoteDataApi()) {
    return { ...(await fetchCrawlMonitorRunsDirect(query)), legacyApi: false };
  }
  const params = new URLSearchParams({
    view: "runs",
    resortId: query.resortId,
    sourceModes: query.sourceModes.join(","),
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  // DATABASEはAPIの既定なので送らない。送る必要があるのはファイルを見るときだけ。
  if (query.origin === "DATABASE") {
    return {
      ...(await readRemote(params, crawlMonitorRunPageSchema)),
      legacyApi: false,
    };
  }

  params.set("origin", "FILE");
  const response = await fetchInternalDataApi(
    `${RESOURCE_PATH}?${params.toString()}`,
    {},
    { scope: "diagnostics-read", acceptedErrorStatuses: [400] },
  );
  const body = (await response.json()) as unknown;
  if (response.status !== 400) {
    return { ...crawlMonitorRunPageSchema.parse(body), legacyApi: false };
  }
  if (!rejectsUnknownQuery(body)) {
    throw new InternalDataApiError(
      "正本データAPIが要求を受け付けませんでした。",
      400,
    );
  }
  return { total: 0, runs: [], legacyApi: true };
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
    { scope: "diagnostics-read", acceptedErrorStatuses: [404] },
  );
  if (response.status === 404) return null;
  const detail = crawlMonitorRunDetailSchema.parse(await response.json());
  // 別のスキー場のrunを、このスキー場のURLで開かせない。
  return detail.run.resortId === resortId ? detail : null;
}

/**
 * 対応表との照合。接続先が古くこのviewを知らない場合は、照合なしとして扱う
 * （画面ではその旨を出す）。
 */
export async function fetchCrawlMonitorMapping(
  resortId: string,
): Promise<CrawlMonitorMapping & { legacyApi: boolean }> {
  if (!usesRemoteDataApi()) {
    return {
      ...(await fetchCrawlMonitorMappingDirect(resortId)),
      legacyApi: false,
    };
  }
  const response = await fetchInternalDataApi(
    `${RESOURCE_PATH}?${new URLSearchParams({ view: "mapping", resortId })}`,
    {},
    { scope: "diagnostics-read", acceptedErrorStatuses: [400] },
  );
  const body = (await response.json()) as unknown;
  if (response.status !== 400) {
    return { ...crawlMonitorMappingSchema.parse(body), legacyApi: false };
  }
  return { gaps: [], observedAt: null, legacyApi: true };
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
