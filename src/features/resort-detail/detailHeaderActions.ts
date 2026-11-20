"use client";

import { createContext, useContext } from "react";

/**
 * 詳細ヘッダーに出す操作。比較リスト・お気に入りの比較から開いた詳細では、
 * 一覧の中身を変える操作をそこでは出さない（編集は比較画面の「編集」で行う）。
 */
export type DetailHeaderActions = {
  compare: boolean;
  favorite: boolean;
};

export const DEFAULT_DETAIL_HEADER_ACTIONS: DetailHeaderActions = {
  compare: true,
  favorite: true,
};

export const DetailHeaderActionsContext = createContext<DetailHeaderActions>(
  DEFAULT_DETAIL_HEADER_ACTIONS,
);

export const useDetailHeaderActions = () =>
  useContext(DetailHeaderActionsContext);
