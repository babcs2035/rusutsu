import "server-only";

import { normalizeInternalDataApiBaseUrl } from "@/lib/internalDataApiBaseUrl";
import { fetchBoundedResponse } from "@/server/boundedResponse";

const INTERNAL_PATH_PREFIX = "/api/admin/";
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [250, 500] as const;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

const waitForRetry = (delayMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

const configuredBaseUrl = (): string | null => {
  const value = process.env.API_BASE_URL?.trim();
  return value ? normalizeInternalDataApiBaseUrl(value) : null;
};

export const usesRemoteDataApi = (): boolean => configuredBaseUrl() !== null;

export class InternalDataApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "InternalDataApiError";
  }
}

export type InternalDataApiFetchOptions = {
  /** 呼び出し側が本文を検証して専用エラーへ変換するHTTPステータス。 */
  acceptedErrorStatuses?: readonly number[];
};

/**
 * ローカルNext.jsサーバーから正本データAPIを呼ぶための共通関数。
 * Authorizationトークンはブラウザーへ渡されない。
 */
export async function fetchInternalDataApi(
  path: string,
  init: RequestInit = {},
  options: InternalDataApiFetchOptions = {},
): Promise<Response> {
  const parsedPath = new URL(path, "https://internal.invalid");
  if (
    !path.startsWith(INTERNAL_PATH_PREFIX) ||
    !parsedPath.pathname.startsWith(INTERNAL_PATH_PREFIX) ||
    parsedPath.origin !== "https://internal.invalid" ||
    /(?:%2e|%2f|%5c|\\)/iu.test(path.split("?", 1)[0])
  ) {
    throw new Error("内部APIのパスが不正です。");
  }

  const baseUrl = configuredBaseUrl();
  if (!baseUrl) {
    throw new Error("API_BASE_URL is not configured");
  }

  const token = process.env.API_BEARER_TOKEN?.trim();
  if (!token) {
    throw new Error("API_BEARER_TOKEN is not configured");
  }

  // fetch の本文読み込みも期限内に完了させるため，ヘッダー受信で解除しない．
  const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");

    const method = (init.method ?? "GET").toUpperCase();
    const retryableMethod = method === "GET" || method === "HEAD";
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetchBoundedResponse(`${baseUrl}${path}`, {
        ...init,
        headers,
        signal,
      });
      if (
        retryableMethod &&
        RETRYABLE_STATUSES.has(response.status) &&
        !options.acceptedErrorStatuses?.includes(response.status) &&
        attempt < RETRY_DELAYS_MS.length
      ) {
        await response.body?.cancel();
        await waitForRetry(RETRY_DELAYS_MS[attempt], signal);
        continue;
      }
      if (
        !response.ok &&
        !options.acceptedErrorStatuses?.includes(response.status)
      ) {
        await response.body?.cancel();
        throw new InternalDataApiError(
          `正本データAPIがHTTP ${response.status}を返しました。`,
          response.status,
        );
      }
      return response;
    }
  } catch (error) {
    if (error instanceof InternalDataApiError) throw error;
    if (
      error instanceof Error &&
      ["AbortError", "TimeoutError"].includes(error.name)
    ) {
      throw new InternalDataApiError(
        "正本データAPIへの接続がタイムアウトしました。",
        null,
        { cause: error },
      );
    }
    throw new InternalDataApiError(
      "正本データAPIへ接続できませんでした。",
      null,
      { cause: error },
    );
  }
}
