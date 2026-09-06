// 検索ワードには、地図表示用の省略名があればそれを優先して使う。
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
