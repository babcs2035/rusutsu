/**
 * スキー場名のルビ（ふりがな）セグメント。
 * text を順に連結すると正式名称（nameJa）と一致する。
 * 漢字を含むセグメントのみ ruby（ひらがな）を持つ。
 */
export type ResortRubySegment = {
  text: string;
  ruby?: string;
};

/** スキー場の旧名称（リブランド前の正式名称） */
export type ResortFormerName = {
  name: string;
  reading?: string;
};

/** src/private/data/SkiResortReadings.json の1エントリ */
export type ResortReadingEntry = {
  id: string;
  name: string;
  ruby: ResortRubySegment[];
  formerNames: ResortFormerName[];
  needsReview?: boolean;
};

/** 検索・表示用にスキー場へ付与する読み情報 */
export type ResortReadingInfo = {
  nameRuby: ResortRubySegment[] | null;
  reading: string | null;
  formerNames: ResortFormerName[];
};
