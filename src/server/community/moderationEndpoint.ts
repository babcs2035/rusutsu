import { isIP } from "node:net";
/** Images may only be processed by the site's own private-network service. */
export function privateModerationEndpoint(
  value: string | undefined,
): string | null {
  if (!value?.trim()) return null;
  const url = new URL(value);
  const host = url.hostname;
  const privateHost =
    host === "localhost" ||
    host === "[::1]" ||
    (isIP(host) === 4 &&
      (/^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host))) ||
    /^[a-z][a-z0-9-]*$/.test(host);
  if (
    !privateHost ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("写真のAI判定先はサイト内ネットワークに設定してください。");
  return url.href;
}
