export const COMPARE_LIST_NAME_MAX = 40;

export type CompareListSummary = {
  id: string;
  name: string;
  resortIds: string[];
};

/** 比較画面を何から開いたか。お気に入り・保存したリストは表示を切り替える */
export type CompareSource =
  | { kind: "selection" }
  | { kind: "favorites" }
  | { kind: "list"; id: string; name: string };
