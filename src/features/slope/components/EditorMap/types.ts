import type { LngLat } from "../../types";

export type EditorMapMode =
  | "view"
  | "draw"
  | "edit"
  | "split"
  | "merge"
  | "midstation";

/** 地図編集に必要な最小の形。EditorCourse / EditorLift のどちらも満たす */
export type EditorMapLine = {
  id: string;
  name: string;
  coordinates: LngLat[];
};

/** 線上の一点。どの線のどこを指しているか */
export type EditorLinePick = {
  lineId: string;
  segmentIndex: number;
  t: number;
  lngLat: LngLat;
};

/** 結合の下ごしらえ。つなぎ目の印と、つないだ結果の下書き */
export type EditorMergePreview = {
  anchors: LngLat[];
  coordinates: LngLat[];
  /** 結合で切り落とされる側。参考として薄く出す */
  discarded: LngLat[][];
};
