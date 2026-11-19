/**
 * コース・リフトの動画検索ワードに付けるスキー場名。
 * 省略名は動画の題名と合わないことがあるので、正式名（「スキー場」込み）を使う。
 */
export const getResortSearchWordName = (
  resortId: string,
  nameJa: string,
): string => nameJa.trim() || resortId;

// 管理画面の絞り込みや地図ラベルの元になる名前。省略名があれば優先する。
export const getResortSearchName = (
  resortId: string,
  fallbackName: string,
  shortName?: string | null,
): string => shortName?.trim() || fallbackName.trim() || resortId;

/** 地図のラベルでは「スキー場」は落とす。どこも付いていて区別に使えないため */
export const removeSkiResortWord = (name: string): string =>
  name.replaceAll("スキー場", "").trim();

/**
 * 地図のラベルに出しているのと同じ表示名。
 * 比較表など、狭いところに名前を並べる場所はこれを使う。
 */
export const getResortLabelName = (
  resortId: string,
  fallbackName: string,
  shortName?: string | null,
): string => {
  const baseName = getResortSearchName(resortId, fallbackName, shortName);
  const labelName = removeSkiResortWord(baseName);
  return labelName.length > 0 ? labelName : baseName;
};
