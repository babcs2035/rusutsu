"use client";

// 公開プロフィールモーダルの開閉をアプリ全体で共有するコンテキスト。
// PostCard などから useProfileModal() で「開く関数」を取得する。
// このファイルはモーダル本体（ProfileModal.tsx）を import しないため、
// CommunityFeed → ここ の一方向依存に留まり循環 import を避ける。
import { createContext, useContext } from "react";

type OpenProfile = (authorId: string) => void;

const ProfileModalContext = createContext<OpenProfile>(() => {});

/** 著者の公開プロフィールをモーダルで開く関数を取得する。 */
export const useProfileModal = () => useContext(ProfileModalContext);

export { ProfileModalContext };
