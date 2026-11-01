import {
  fetchFacebookProfile,
  isFacebookPageUrl,
} from "@/features/resort-detail/server/facebookProfile";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  if (!isFacebookPageUrl(url))
    return Response.json({ profile: null }, { status: 400 });
  const profile = await fetchFacebookProfile(url);
  return Response.json(
    { profile },
    {
      headers: {
        "Cache-Control": profile
          ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400"
          : "public, max-age=60, s-maxage=60",
      },
    },
  );
}
