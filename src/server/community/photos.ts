import "server-only";
import decodeHeic from "heic-decode";
import sharp, { type Sharp } from "sharp";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export type PhotoPreviewSize = "thumb" | "map";

export async function createPhotoPreview(
  bytes: Uint8Array,
  size: PhotoPreviewSize,
) {
  return sharp(Buffer.from(bytes))
    .resize({
      width: size === "map" ? 160 : 320,
      height: size === "map" ? 160 : 320,
      fit: size === "map" ? "cover" : "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: size === "map" ? 68 : 72 })
    .toBuffer();
}
export async function normalizePhoto(file: File) {
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_PHOTO_BYTES)
    throw new Error("写真は1枚8MB以内で選んでください。");
  const input = Buffer.from(await file.arrayBuffer());
  try {
    const heic =
      input.length >= 12 &&
      input.toString("ascii", 4, 8) === "ftyp" &&
      ["heic", "heix", "mif1"].includes(input.toString("ascii", 8, 12));
    let image: Sharp;
    if (heic) {
      const images = await decodeHeic.all({ buffer: input });
      try {
        const primary = images[0];
        if (
          !primary ||
          !Number.isSafeInteger(primary.width) ||
          !Number.isSafeInteger(primary.height) ||
          primary.width < 1 ||
          primary.height < 1 ||
          primary.width * primary.height > 40_000_000
        )
          throw new Error("dimensions");
        const decoded = await primary.decode();
        image = sharp(Buffer.from(decoded.data), {
          raw: { width: decoded.width, height: decoded.height, channels: 4 },
          limitInputPixels: 40_000_000,
        });
      } finally {
        images.dispose();
      }
    } else
      image = sharp(input, {
        limitInputPixels: 40_000_000,
        animated: false,
        failOn: "warning",
      });
    const metadata = await image.metadata();
    if (
      !metadata.format ||
      ![
        "jpeg",
        "png",
        "webp",
        "heif",
        "avif",
        ...(heic ? ["raw"] : []),
      ].includes(metadata.format) ||
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
    const [thumbBytes, mapBytes] = await Promise.all([
      createPhotoPreview(data, "thumb"),
      createPhotoPreview(data, "map"),
    ]);
    return {
      bytes: data,
      thumbBytes,
      mapBytes,
      mimeType: "image/webp",
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new Error(
      "写真を読み込めません。HEIC・JPEG・PNG・WebPの画像を選び直してください。",
    );
  }
}

export async function readReportPhotos(form: FormData, entryKey: string) {
  if (!(form instanceof FormData))
    throw new Error("写真の形式を確認してください。");
  const files = [...form.entries()];
  if (files.length > 1) throw new Error("写真は1件の投稿で1枚までです。");
  const results = [];
  for (const [key, file] of files) {
    // 写真は必ず投稿する項目に付ける。項目に紐づかない写真は受け付けない。
    if (key !== `photos:${entryKey}`)
      throw new Error("写真の対象を確認してください。");
    if (!(file instanceof File))
      throw new Error("写真の形式を確認してください。");
    results.push(await normalizePhoto(file));
  }
  return results;
}
