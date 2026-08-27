import resortNameAliases from "@/private/data/SkiResortNameAliases.json";

const shortNameById = new Map(
  resortNameAliases.resorts.map(resort => [resort.id, resort.shortName.trim()]),
);

// 検索ワードには、地図表示用の省略名があればそれを優先して使う。
export const getResortSearchName = (
  resortId: string,
  fallbackName: string,
): string => shortNameById.get(resortId) || fallbackName.trim() || resortId;

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
): string => {
  const baseName = getResortSearchName(resortId, fallbackName);
  const labelName = removeSkiResortWord(baseName);
  return labelName.length > 0 ? labelName : baseName;
};
