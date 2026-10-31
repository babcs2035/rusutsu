import { getCommunityPhoto } from "@/server/community/remoteClient";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(photoId))
    return new Response(null, { status: 404 });
  const size = new URL(request.url).searchParams.get("size");
  return getCommunityPhoto(
    photoId,
    size === "thumb" || size === "map" ? size : undefined,
  );
}
