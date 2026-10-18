import { distanceKm } from "@/features/map/utils/distance";
import type { MapSkiResort } from "@/types/skiResorts";

export const RESORT_SORT_OPTIONS = [
  { value: "name", label: "名前順", shortLabel: "名前順" },
  { value: "prefecture", label: "都道府県別", shortLabel: "都道府県別" },
  {
    value: "distance",
    label: "現在地から近い順",
    shortLabel: "近い順",
  },
  {
    value: "courses",
    label: "コース数が多い順",
    shortLabel: "コース数順",
  },
  {
    value: "openCourses",
    label: "滑走可能コースが多い順",
    shortLabel: "滑走可能順",
  },
  {
    value: "openLifts",
    label: "運行中リフトが多い順",
    shortLabel: "運行数順",
  },
] as const;

export type ResortSortOrder = (typeof RESORT_SORT_OPTIONS)[number]["value"];
export type SortPosition = { latitude: number; longitude: number };

type SortableResort = Pick<
  MapSkiResort,
  | "id"
  | "nameJa"
  | "latitude"
  | "longitude"
  | "numberOfCourses"
  | "operatingCounts"
>;

const nameCollator = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
});

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

/** 不明な数値は末尾、同数は名前順。元の検索結果の配列を変更しない。 */
export function sortResorts<T extends SortableResort>(
  resorts: T[],
  order: ResortSortOrder,
  position: SortPosition | null = null,
): T[] {
  const values = new Map(
    resorts.map(resort => {
      const counts = resort.operatingCounts;
      const value =
        order === "distance"
          ? position
            ? resortDistance(resort, position)
            : null
          : order === "courses"
            ? -(counts.courses?.total ?? resort.numberOfCourses)
            : order === "openCourses"
              ? counts.courses?.active == null
                ? null
                : -counts.courses.active
              : order === "openLifts"
                ? counts.lifts?.active == null
                  ? null
                  : -counts.lifts.active
                : null;
      return [resort.id, value] as const;
    }),
  );
  return [...resorts].sort(
    (a, b) =>
      compareKnownValues(values.get(a.id) ?? null, values.get(b.id) ?? null) ||
      nameCollator.compare(a.nameJa, b.nameJa) ||
      a.id.localeCompare(b.id),
  );
}
