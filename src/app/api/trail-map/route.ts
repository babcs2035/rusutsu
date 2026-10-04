import { readResortLinksMap } from "@/features/lift/server/liftFiles";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_BYTES = 40 * 1024 * 1024;

const isAllowedType = (contentType: string) =>
  /^(application\/pdf|image\/)/i.test(contentType);

/**
 * 公式のゲレンデマップ（主にPDF）を同一オリジンで返す。
 * 公式サイトが X-Frame-Options で埋め込みを拒否していたり、拡張子のないURLだったりしても
 * 画面内の iframe / img で見せられるようにするための中継。
 * SSRF を避けるため、SkiResortLinks に登録済みの mapUrls だけを許可する。
 */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return new Response("url is required", { status: 400 });

  const links = await readResortLinksMap();
  const registered = Object.values(links).some(entry =>
    entry.mapUrls?.some(link => link.url === target),
  );
  if (!registered) return new Response("not allowed", { status: 403 });

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
  } catch {
    return new Response("upstream unavailable", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (!upstream.ok || !upstream.body || !isAllowedType(contentType))
    return new Response("unsupported upstream", { status: 502 });
  if (length > MAX_BYTES) return new Response("too large", { status: 413 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType.split(";")[0],
      "Content-Disposition": "inline",
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
