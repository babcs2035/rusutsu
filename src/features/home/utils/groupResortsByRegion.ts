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
