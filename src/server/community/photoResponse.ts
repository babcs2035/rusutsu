import "server-only";
import { prisma } from "@/lib/prisma";
import { viewerId } from "./repository";

export async function communityPhotoResponse(photoId: string) {
  if (!/^[a-z0-9]{20,40}$/.test(photoId))
    return new Response(null, { status: 404 });
  const photo = await prisma.contributionPhoto.findUnique({
    where: { id: photoId },
    include: { post: { select: { status: true } } },
  });
  if (!photo) return new Response(null, { status: 404 });
  if (photo.requestId || photo.post?.status !== "VISIBLE") {
    const id = await viewerId();
    const user = id
      ? await prisma.user.findUnique({ where: { id }, select: { role: true } })
      : null;
    if (user?.role !== "admin") return new Response(null, { status: 404 });
  }
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'inline; filename="photo.webp"',
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
