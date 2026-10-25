import "server-only";
import sharp from "sharp";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export async function normalizePhoto(file: File) {
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_PHOTO_BYTES)
    throw new Error("写真は1枚8MB以内で選んでください。");
  const input = Buffer.from(await file.arrayBuffer());
  try {
    const image = sharp(input, {
      limitInputPixels: 40_000_000,
      animated: false,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !metadata.format ||
      !["jpeg", "png", "webp", "heif", "avif"].includes(metadata.format) ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error("format");
    // Re-encoding without withMetadata strips EXIF/GPS, XMP and original names.
    const { data, info } = await image
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return {
      bytes: data,
      mimeType: "image/webp",
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new Error(
      "写真を読み込めません。JPEG・PNG・WebPで選び直してください。HEICは端末でJPEGに変換できます。",
    );
  }
}

export async function readEntryPhotos(form: FormData, index: number) {
  const files = form.getAll(`photo:${index}`);
  if (files.length > 6) throw new Error("写真は1投稿6枚までです。");
  const results = [];
  for (const file of files) {
    if (!(file instanceof File))
      throw new Error("写真の形式を確認してください。");
    results.push(await normalizePhoto(file));
  }
  return results;
}
