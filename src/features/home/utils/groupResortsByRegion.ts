import { REGION_PREFECTURES } from "@/features/filters/constants";

export type ResortRegion<T> = {
  name: string;
  count: number;
  prefectures: { name: string; resorts: T[] }[];
};

/** 検索結果だけを集計し、地方・都道府県は既存の地域順、県内は入力順。 */
export function groupResortsByRegion<T extends { prefecture: string }>(
  resorts: T[],
): ResortRegion<T>[] {
  const byPrefecture = new Map<string, T[]>();
  for (const resort of resorts) {
    const name = resort.prefecture.trim() || "所在地不明";
    const group = byPrefecture.get(name) ?? [];
    group.push(resort);
    byPrefecture.set(name, group);
  }

  const regions: ResortRegion<T>[] = [];
  for (const [name, names] of Object.entries(REGION_PREFECTURES)) {
    const prefectures = names.flatMap(prefecture => {
      const group = byPrefecture.get(prefecture);
      if (!group) return [];
      byPrefecture.delete(prefecture);
      return [{ name: prefecture, resorts: group }];
    });
    if (prefectures.length > 0) {
      regions.push({
        name,
        count: prefectures.reduce(
          (total, item) => total + item.resorts.length,
          0,
        ),
        prefectures,
      });
    }
  }

  if (byPrefecture.size > 0) {
    const prefectures = [...byPrefecture].map(([name, group]) => ({
      name,
      resorts: group,
    }));
    regions.push({
      name: "その他",
      count: prefectures.reduce(
        (total, item) => total + item.resorts.length,
        0,
      ),
      prefectures,
    });
  }
  return regions;
}

/** これ以下の件数なら、スキー場名まで全部開く */
export const EXPAND_ALL_MAX_RESORTS = 20;
/** 地方＋都道府県の見出しがこの行数以下なら、地方だけ開く（スマホで引き出せば全部見える目安） */
export const EXPAND_REGIONS_MAX_HEADINGS = 14;

export type ResortGroupExpansion = {
  regions: string[];
  prefectures: string[];
};

/**
 * 検索結果の最初の開き方。
 * 20件以下か1つの都道府県に収まるなら全部、見出しが14行以下なら地方だけ、それ以外は全部閉じる。
 */
export function initialRegionExpansion<T>(
  regions: ResortRegion<T>[],
): ResortGroupExpansion {
  const prefectures = regions.flatMap(region =>
    region.prefectures.map(prefecture => prefecture.name),
  );
  const total = regions.reduce((sum, region) => sum + region.count, 0);
  const regionNames = regions.map(region => region.name);
  if (total <= EXPAND_ALL_MAX_RESORTS || prefectures.length === 1) {
    return { regions: regionNames, prefectures };
  }
  if (regionNames.length + prefectures.length <= EXPAND_REGIONS_MAX_HEADINGS) {
    return { regions: regionNames, prefectures: [] };
  }
  return { regions: [], prefectures: [] };
}
