import { readResortLinksMap } from "@/features/lift/server/liftFiles";
import { readPublicResortAccess } from "@/server/ski-resorts/publicAccess";

/**
 * スキー場ごとの Google マップの施設リンク（googleMapsUrls の先頭）を
 * { [resortId]: url } で返す。一覧を「近い順」にしたときだけ読む。
 * 初回表示のデータに含めると全員の読み込みが増えるので分けている。
 */
export async function GET() {
  const [links, { linkSourceIds }] = await Promise.all([
    readResortLinksMap(),
    readPublicResortAccess(),
  ]);
  const result: Record<string, string> = {};
  for (const [resortId, entry] of Object.entries(links)) {
    if (!linkSourceIds.has(resortId)) continue;
    const url = entry.googleMapsUrls?.find(link =>
      /^https:\/\//u.test(link.url),
    )?.url;
    if (url) result[resortId] = url;
  }
  return Response.json(result, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
