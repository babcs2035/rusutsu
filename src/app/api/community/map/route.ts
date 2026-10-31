import {
  getCommunityMapEntries,
  getCommunityMapSummary,
  getPostDetail,
} from "@/features/community/actions";

/** 地図の読み取りはGETで行い、写真・ほかの操作と並行して取得できるようにする。 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const postId = query.get("postId");
  if (postId)
    return Response.json(await getPostDetail(postId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  const resortId = query.get("resortId") ?? "";
  const result =
    query.get("summary") === "1"
      ? await getCommunityMapSummary(resortId)
      : await getCommunityMapEntries({
          resortId,
          ...Object.fromEntries(
            ["from", "to", "cursor", "kind"].flatMap(key => {
              const value = query.get(key);
              return value ? [[key, value]] : [];
            }),
          ),
        });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
