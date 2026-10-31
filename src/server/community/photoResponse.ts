import "server-only";
import { prisma } from "@/lib/prisma";
import { createPhotoPreview, type PhotoPreviewSize } from "./photos";
import { viewerId } from "./repository";

export async function communityPhotoResponse(
  photoId: string,
  size?: PhotoPreviewSize,
) {
  if (!/^[a-z0-9]{20,40}$/.test(photoId))
    return new Response(null, { status: 404 });
  const photo = await prisma.contributionPhoto.findUnique({
    where: { id: photoId },
    select: {
      requestId: true,
      post: { select: { status: true } },
      mimeType: true,
      bytes: !size,
      thumbBytes: size === "thumb",
      mapBytes: size === "map",
    },
  });
  if (!photo) return new Response(null, { status: 404 });
  if (photo.requestId || photo.post?.status !== "VISIBLE") {
    const id = await viewerId();
    const user = id
      ? await prisma.user.findUnique({ where: { id }, select: { role: true } })
      : null;
    if (user?.role !== "admin") return new Response(null, { status: 404 });
  }
  let bytes =
    size === "map"
      ? photo.mapBytes
      : size === "thumb"
        ? photo.thumbBytes
        : photo.bytes;
  // 既存写真は初回だけ生成し、以後は小さい画像だけをDBから読み出す。
  if (!bytes && size) {
    const original = await prisma.contributionPhoto.findUnique({
      where: { id: photoId },
      select: { bytes: true },
    });
    if (!original) return new Response(null, { status: 404 });
    bytes = await createPhotoPreview(original.bytes, size);
    await prisma.contributionPhoto.updateMany({
      where: { id: photoId },
      data: size === "map" ? { mapBytes: bytes } : { thumbBytes: bytes },
    });
  }
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'inline; filename="photo.webp"',
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
