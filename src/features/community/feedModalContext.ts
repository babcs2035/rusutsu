"use client";

// 全フィード（みんなの投稿）モーダルの開閉をアプリ全体で共有するコンテキスト。
// コンパクト一覧の「すべて見る」などから useFeedModal() で開く。
// このファイルはモーダル本体を import しないため循環 import を避ける。
import { createContext, useContext } from "react";

type OpenFeed = (resortId: string) => void;

const FeedModalContext = createContext<OpenFeed>(() => {});

/** 指定スキー場の全フィードをモーダルで開く関数を取得する。 */
export const useFeedModal = () => useContext(FeedModalContext);

export { FeedModalContext };
