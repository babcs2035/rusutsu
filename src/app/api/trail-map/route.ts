import { readResortLinksMap } from "@/features/lift/server/liftFiles";
import { boundResponseBody } from "@/server/boundedResponse";
import { fetchTrailMap } from "@/server/trailMapUpstream";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_BYTES = 40 * 1024 * 1024;

const isAllowedType = (contentType: string): boolean =>
  /^(application\/pdf|image\/[a-z0-9.+-]+)$/iu.test(contentType);

/**
 * 公式のゲレンデマップ（主にPDF）を同一オリジンで返す。
 * 公式サイトが X-Frame-Options で埋め込みを拒否していたり、拡張子のないURLだったりしても
 * 画面内の iframe / img で見せられるようにするための中継。
 * SSRF を避けるため、SkiResortLinks に登録済みの mapUrls だけを許可する。
 */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return new Response("url is required", { status: 400 });
  const url = URL.parse(target);
  if (
    !url ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return new Response("not allowed", { status: 403 });

  const links = await readResortLinksMap();
  const registered = Object.values(links).some(entry =>
    entry.mapUrls?.some(link => link.url === target),
  );
  if (!registered) return new Response("not allowed", { status: 403 });

  let upstream: Awaited<ReturnType<typeof fetchTrailMap>>;
  try {
    upstream = await fetchTrailMap(
      url,
      AbortSignal.any([request.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
    );
  } catch {
    return new Response("upstream unavailable", { status: 502 });
  }

  const { contentType, length, status, body } = upstream;
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (status < 200 || status >= 300 || !isAllowedType(mediaType)) {
    await body.cancel();
    return new Response("unsupported upstream", { status: 502 });
  }
  if (length > MAX_BYTES) {
    await body.cancel();
    return new Response("too large", { status: 413 });
  }

  return new Response(boundResponseBody(body, MAX_BYTES), {
    headers: {
      "Content-Type": mediaType,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        mediaType === "image/svg+xml"
          ? "sandbox; default-src 'none'"
          : "script-src 'none'; object-src 'none'; base-uri 'none'",
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
