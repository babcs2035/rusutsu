import sharp from "sharp";
import { getCommunityPhoto } from "@/server/community/remoteClient";

// 一覧の小さな写真に元の大きな画像（最大2048px）を読ませると、端末での展開が重く
// スクロールがカクつく。?size=thumb では表示用に縮めて返す。
const THUMB_PX = 320;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(photoId))
    return new Response(null, { status: 404 });
  const response = await getCommunityPhoto(photoId);
  if (new URL(request.url).searchParams.get("size") !== "thumb" || !response.ok)
    return response;
  try {
    const thumb = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize({
        width: THUMB_PX,
        height: THUMB_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 72 })
      .toBuffer();
    return new Response(new Uint8Array(thumb), { headers: response.headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}
