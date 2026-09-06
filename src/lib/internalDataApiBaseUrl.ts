const LOOPBACK_HTTP_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const INVALID_BASE_URL_MESSAGE =
  "DATA_API_BASE_URL must use HTTPS (HTTP is allowed only for localhost, 127.0.0.1, or [::1]) and must not include credentials, query, or fragment";

/**
 * Bearer tokens may travel over plain HTTP only when the connection stays on
 * the local machine. All remote canonical-data API traffic must use TLS.
 */
export function normalizeInternalDataApiBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/u, "");

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(INVALID_BASE_URL_MESSAGE);
  }

  const hasSafeProtocol =
    parsed.protocol === "https:" ||
    (parsed.protocol === "http:" &&
      LOOPBACK_HTTP_HOSTNAMES.has(parsed.hostname));
  if (
    !hasSafeProtocol ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(INVALID_BASE_URL_MESSAGE);
  }

  return normalized;
}
