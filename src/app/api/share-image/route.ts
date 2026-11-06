import { getShareMaps } from "@/server/share/data";
import { createShareImage } from "@/server/share/images";
import { parseCompareIds } from "@/shared/utils/comparePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function respond(request: Request, head: boolean) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("ids");
  const ids = parseCompareIds(raw);
  const total = Number(url.searchParams.get("count") ?? ids.length);
  if (
    !raw ||
    ids.length < 1 ||
    ids.length > 4 ||
    !Number.isInteger(total) ||
    total < ids.length ||
    total > 2000
  )
    return new Response("Invalid resort IDs", { status: 400 });
  try {
    const data = await getShareMaps(ids);
    if (data.some(item => item === null))
      return new Response("Not found", { status: 404 });
    const image = await createShareImage(
      data.filter(item => item !== null),
      total,
      url.searchParams.get("comparison") === "1",
    );
    return new Response(head ? null : new Uint8Array(image), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(image.length),
        "Cache-Control":
          "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("共有画像を生成できませんでした", error);
    // 失敗画像をSNSに長期間保存させない。次の取得で再生成できる状態を残す。
    return new Response("Share image temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    });
  }
}
export const GET = (request: Request) => respond(request, false);
export const HEAD = (request: Request) => respond(request, true);
