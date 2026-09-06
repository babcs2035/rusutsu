import "server-only";

import { normalizeInternalDataApiBaseUrl } from "@/lib/internalDataApiBaseUrl";

const INTERNAL_PATH_PREFIX = "/api/internal/v1/";
const DEFAULT_TIMEOUT_MS = 30_000;

const configuredBaseUrl = (): string | null => {
  const value = process.env.DATA_API_BASE_URL?.trim();
  return value ? normalizeInternalDataApiBaseUrl(value) : null;
};

export const usesRemoteDataApi = (): boolean => configuredBaseUrl() !== null;

export class InternalDataApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
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
    throw new Error("DATA_API_BASE_URL is not configured");
  }

  const token = process.env.INTERNAL_DATA_API_ADMIN_TOKEN?.trim();
  if (!token) {
    throw new Error("INTERNAL_DATA_API_ADMIN_TOKEN is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      redirect: "error",
      signal: init.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal,
    });
    if (
      !response.ok &&
      !options.acceptedErrorStatuses?.includes(response.status)
    ) {
      throw new InternalDataApiError(
        `正本データAPIがHTTP ${response.status}を返しました。`,
        response.status,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof InternalDataApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new InternalDataApiError(
        "正本データAPIへの接続がタイムアウトしました。",
        null,
      );
    }
    throw new InternalDataApiError(
      "正本データAPIへ接続できませんでした。",
      null,
    );
  } finally {
    clearTimeout(timeout);
  }
}
