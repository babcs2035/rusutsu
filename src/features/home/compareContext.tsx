"use client";

import { createContext, useContext } from "react";
import type {
  CompareListSummary,
  CompareSource,
} from "@/features/compare-lists/types";

type HomeCompareContextValue = {
  /** 比較画面を何から開いたか */
  source: CompareSource;
  /** 比較中のスキー場（読み込み前から確定している件数の元） */
  ids: string[];
  /** 保存した比較リストを開く */
  openList: (list: CompareListSummary) => void;
  /** 比較をリストへ保存したあと、そのリストを開いている状態にする */
  onListSaved: (list: CompareListSummary) => void;
};

export const HomeCompareContext = createContext<HomeCompareContextValue | null>(
  null,
);
export const useHomeCompare = () => useContext(HomeCompareContext);
