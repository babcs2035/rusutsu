// 投稿下書きの写真ファイルと端末内プレビュー URL の寿命を管理する．
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PhotoPreview = { file: File; url: string };

/** 写真の採用が確定した時点で URL を生成し，差し替え・削除・終了時に解放する． */
export function useComposerPhotoPreviews() {
  const [newPhotos, setNewPhotos] = useState<PhotoPreview[]>([]);
  const newPhotosRef = useRef<PhotoPreview[]>([]);

  const replaceNewPhotos = useCallback((files: readonly File[]): void => {
    const previews: PhotoPreview[] = [];
    try {
      for (const file of files)
        previews.push({ file, url: URL.createObjectURL(file) });
    } catch (error) {
      for (const preview of previews) URL.revokeObjectURL(preview.url);
      throw error;
    }
    for (const photo of newPhotosRef.current) URL.revokeObjectURL(photo.url);
    newPhotosRef.current = previews;
    setNewPhotos(previews);
  }, []);

  const removeNewPhoto = useCallback((url: string): void => {
    URL.revokeObjectURL(url);
    const previews = newPhotosRef.current.filter(photo => photo.url !== url);
    newPhotosRef.current = previews;
    setNewPhotos(previews);
  }, []);

  const readNewPhotoFiles = useCallback(
    (): File[] => newPhotosRef.current.map(photo => photo.file),
    [],
  );

  useEffect(
    () => () => {
      for (const photo of newPhotosRef.current) URL.revokeObjectURL(photo.url);
    },
    [],
  );

  return { newPhotos, readNewPhotoFiles, replaceNewPhotos, removeNewPhoto };
}
