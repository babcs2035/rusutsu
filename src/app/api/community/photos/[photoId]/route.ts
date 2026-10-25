import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(photoId))
    return new Response(null, { status: 404 });
  const photo = await prisma.contributionPhoto.findUnique({
    where: { id: photoId },
    include: { post: { select: { status: true } } },
  });
  if (!photo) return new Response(null, { status: 404 });
  if (photo.requestId || photo.post?.status !== "VISIBLE") {
    const session = await auth();
    const user = session?.user?.id
      ? await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { role: true },
        })
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
