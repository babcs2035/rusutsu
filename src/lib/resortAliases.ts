import resortNameAliases from "@/private/data/SkiResortNameAliases.json";

const shortNameById = new Map(
  resortNameAliases.resorts.map(resort => [resort.id, resort.shortName.trim()]),
);

// 検索ワードには、地図表示用の省略名があればそれを優先して使う。
export const getResortSearchName = (
  resortId: string,
  fallbackName: string,
): string => shortNameById.get(resortId) || fallbackName.trim() || resortId;
