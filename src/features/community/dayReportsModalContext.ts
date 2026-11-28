"use client";

// 滑走日レポートモーダルの開閉をアプリ全体で共有するコンテキスト。
// 投稿詳細の「地図で見る」などから useDayReportsModal() で開く。
// このファイルはモーダル本体を import しないため循環 import を避ける。
import { createContext, useContext } from "react";

/** 開く対象：著者・滑走日・（任意）最初から開く投稿 */
export type DayReportsTarget = {
  authorId: string;
  observedOn: string;
  postId?: string;
};

type OpenDayReports = (target: DayReportsTarget) => void;

const DayReportsModalContext = createContext<OpenDayReports>(() => {});

/** 滑走日レポートをモーダルで開く関数を取得する。 */
export const useDayReportsModal = () => useContext(DayReportsModalContext);

export { DayReportsModalContext };
