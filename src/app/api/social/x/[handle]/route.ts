import {
  fetchXProfile,
  isXHandle,
} from "@/features/resort-detail/server/xProfile";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  if (!isXHandle(handle))
    return Response.json({ profile: null }, { status: 400 });
  const profile = await fetchXProfile(handle);
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
