"use client";

// 投稿写真モーダルの開閉をアプリ全体で共有するコンテキスト。
// 「コースの写真」などから usePhotosModal() で開く。
// このファイルはモーダル本体を import しないため循環 import を避ける。
import { createContext, useContext } from "react";

/** 開く対象：スキー場・（任意）コース */
export type PhotosTarget = {
  resortId: string;
  courseId?: string;
};

type OpenPhotos = (target: PhotosTarget) => void;

const PhotosModalContext = createContext<OpenPhotos>(() => {});

/** 投稿写真一覧をモーダルで開く関数を取得する。 */
export const usePhotosModal = () => useContext(PhotosModalContext);

export { PhotosModalContext };
