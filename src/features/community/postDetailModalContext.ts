"use client";

// 投稿詳細モーダルの開閉をアプリ全体で共有するコンテキスト。
// 地図プレビューの「詳細を開く」などから usePostDetailModal() で開く。
// このファイルはモーダル本体を import しないため循環 import を避ける。
import { createContext, useContext } from "react";

type OpenPostDetail = (postId: string) => void;

const PostDetailModalContext = createContext<OpenPostDetail>(() => {});

/** 投稿詳細をモーダルで開く関数を取得する。 */
export const usePostDetailModal = () => useContext(PostDetailModalContext);

export { PostDetailModalContext };
