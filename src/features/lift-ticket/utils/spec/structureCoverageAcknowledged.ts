/**
 * 架空ケースが無くても失敗にしない特徴と、その理由（仕様書 Y03）。
 * 理由が空なら失敗にする。架空ケースを足したら、ここから消す。
 */
export const ACKNOWLEDGED_FEATURES: Record<string, string> = {
  "ticket:mode:rides":
    "回数券は長さの指定に使わない（S13）。料金表の表示だけで、計算の分岐は無い",
  "ticket:mode:points":
    "ポイント券は長さの指定に使わない（S13）。料金表の表示だけで、計算の分岐は無い",
  "ticket:mode:unknown":
    "利用単位が公式に書かれていない券は計算に使わない（料金表の表示だけ）",
  "rental:item:unknown":
    "用具が分類できないレンタル（ウェア上だけ等）は画面で選べないので計算に使わない（RQ03・RQ04で対応予定）",
  "rental:mode:unknown":
    "期間が公式に書かれていないレンタルは計算に使わない（料金表の表示だけ）",
};
