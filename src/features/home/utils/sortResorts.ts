import { distanceKm } from "@/features/map/utils/distance";
import type { MapSkiResort } from "@/types/skiResorts";

export const RESORT_SORT_OPTIONS = [
  { value: "prefecture", label: "都道府県別", shortLabel: "都道府県別" },
  { value: "name", label: "名前順", shortLabel: "名前順" },
  {
    value: "distance",
    label: "現在地から近い順",
    shortLabel: "近い順",
  },
  {
    value: "totalDistance",
    label: "総滑走距離が長い順",
    shortLabel: "総滑走距離順",
  },
  {
    value: "openDistance",
    label: "滑走可能距離が長い順",
    shortLabel: "滑走可能距離順",
  },
  {
    value: "openLifts",
    label: "運行中リフトが多い順",
    shortLabel: "運行数順",
  },
  {
    value: "liftPrice",
    label: "リフト料金が安い順",
    shortLabel: "料金が安い順",
  },
] as const;

/** 都道府県別のときの県内の並び。既定は滑走距離が長い順（大きいスキー場から） */
export const PREFECTURE_INNER_ORDERS = [
  { value: "distance", label: "滑走距離順", description: "滑走距離が長い順" },
  { value: "name", label: "名前順", description: "あいうえお順" },
] as const;
export type PrefectureInnerOrder =
  (typeof PREFECTURE_INNER_ORDERS)[number]["value"];

export type ResortSortOrder = (typeof RESORT_SORT_OPTIONS)[number]["value"];
export type SortPosition = { latitude: number; longitude: number };

type SortableResort = Pick<
  MapSkiResort,
  "id" | "nameJa" | "latitude" | "longitude" | "operatingCounts"
> & {
  /** ふりがなを連結した読み。無いときは正式名で並べる */
  reading?: string | null;
};

const nameCollator = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
});

/** 名前順・同数の並びは「あいうえお順」。ひらがな・カタカナの違いは無視する */
export const compareResortNames = (a: SortableResort, b: SortableResort) =>
  nameCollator.compare(a.reading || a.nameJa, b.reading || b.nameJa) ||
  nameCollator.compare(a.nameJa, b.nameJa);

const compareKnownValues = (a: number | null, b: number | null) => {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a - b;
};

const resortDistance = (resort: SortableResort, position: SortPosition) => {
  if (
    !Number.isFinite(resort.latitude) ||
    !Number.isFinite(resort.longitude) ||
    Math.abs(resort.latitude) > 90 ||
    Math.abs(resort.longitude) > 180 ||
    (resort.latitude === 0 && resort.longitude === 0)
  ) {
    return null;
  }
  return distanceKm(position, resort);
};

const totalDistance = (resort: SortableResort) =>
  resort.operatingCounts.courseDistance?.total ?? null;

/**
 * 不明な数値は末尾、同数は読みの五十音順。元の検索結果の配列を変更しない。
 * 滑走可能距離が同じ（シーズン外で全て0など）ときは、総滑走距離が長い順にする。
 */
export function sortResorts<T extends SortableResort>(
  resorts: T[],
  order: ResortSortOrder,
  position: SortPosition | null = null,
  prefectureOrder: PrefectureInnerOrder = "distance",
  /** 料金が安い順のときの合計金額（スキー場ID→円）。金額が出ないスキー場は末尾 */
  prices: ReadonlyMap<string, number> | null = null,
): T[] {
  const values = new Map(
    resorts.map(resort => {
      const counts = resort.operatingCounts;
      const total = totalDistance(resort);
      const open = counts.courseDistance?.open ?? null;
      const value =
        order === "prefecture"
          ? prefectureOrder === "distance" && total !== null
            ? -total
            : null
          : order === "openDistance"
            ? open === null
              ? null
              : -open
            : order === "distance"
              ? position
                ? resortDistance(resort, position)
                : null
              : order === "totalDistance"
                ? total === null
                  ? null
                  : -total
                : order === "openLifts"
                  ? counts.lifts?.active == null
                    ? null
                    : -counts.lifts.active
                  : order === "liftPrice"
                    ? (prices?.get(resort.id) ?? null)
                    : null;
      const secondary =
        order === "openDistance" && total !== null ? -total : null;
      return [resort.id, { value, secondary }] as const;
    }),
  );
  return [...resorts].sort(
    (a, b) =>
      compareKnownValues(
        values.get(a.id)?.value ?? null,
        values.get(b.id)?.value ?? null,
      ) ||
      compareKnownValues(
        values.get(a.id)?.secondary ?? null,
        values.get(b.id)?.secondary ?? null,
      ) ||
      compareResortNames(a, b) ||
      a.id.localeCompare(b.id),
  );
}
