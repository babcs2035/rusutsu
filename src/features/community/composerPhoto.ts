/** 写真の端末内メタデータ取得と，表示用の HEIC 変換を投稿フォームから分ける． */
import { prepareCommunityPhoto } from "./actions";
import { readPhotoMetadata } from "./photoGps";

type PreparedPhoto = {
  file: File;
  takenAt: { observedOn: string; observedTime: string | null } | null;
  gps: [number, number] | null;
};

/** EXIF は変換前に端末内で取得し，フォームが採用を判断するまで URL を生成しない． */
export async function prepareComposerPhoto(
  original: File,
): Promise<PreparedPhoto> {
  const metadata = await readPhotoMetadata(original);
  const takenAt = metadata.observedOn
    ? { observedOn: metadata.observedOn, observedTime: metadata.observedTime }
    : null;
  const gps: [number, number] | null = metadata.gps
    ? [metadata.gps.longitude, metadata.gps.latitude]
    : null;
  if (
    !/^image\/hei[cf]/i.test(original.type) &&
    !/\.(?:heic|heif)$/i.test(original.name)
  )
    return { file: original, takenAt, gps };

  const form = new FormData();
  form.append("photo", original);
  const result = await prepareCommunityPhoto(form);
  if (!result.ok) throw new Error(result.error);
  const bytes = Uint8Array.from(atob(result.data.base64), character =>
    character.charCodeAt(0),
  );
  const name = original.name.replace(/\.(?:heic|heif)$/i, "") || "photo";
  return {
    file: new File([bytes], `${name}.webp`, { type: "image/webp" }),
    takenAt,
    gps,
  };
}
