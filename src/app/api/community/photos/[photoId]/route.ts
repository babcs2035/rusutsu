import { getCommunityPhoto } from "@/server/community/remoteClient";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(photoId))
    return new Response(null, { status: 404 });
  return getCommunityPhoto(photoId);
}
