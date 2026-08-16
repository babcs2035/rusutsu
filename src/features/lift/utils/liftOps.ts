import { buildDefaultSearchWord } from "@/shared/utils/searchWord";
import type { EditorLift, LngLat } from "../types";
import { createEmptyLiftDetail } from "./detailMerge";

export const liftDisplayName = (lift: EditorLift, index?: number): string => {
  if (lift.name !== "") return lift.name;
  if (lift.osmId) return `（名前なし: ${lift.osmId}）`;
  if (lift.isNew) return "（名前未入力の新規リフト）";
  return `（名前なし: ${(index ?? lift.sourceIndex) + 1} 番目）`;
};

export const createLiftId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `lift-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const createEmptyLift = (resortId: string): EditorLift => ({
  id: createLiftId(),
  sourceIndex: -1,
  isNew: true,
  name: "",
  osmId: null,
  skiId: resortId,
  coordinates: [],
  midstation: null,
  midstationRaw: null,
  detail: createEmptyLiftDetail(),
  extras: {},
  detailMatch: null,
  original: {
    skiId: resortId,
    name: "",
    coordinates: [],
    midstation: null,
    detail: createEmptyLiftDetail(),
  },
});

export const fillEmptyLiftSearchWords = (
  lifts: EditorLift[],
  resortNamesById: ReadonlyMap<string, string>,
): EditorLift[] =>
  lifts.map(lift =>
    lift.detail.searchWord.trim() === ""
      ? {
          ...lift,
          detail: {
            ...lift.detail,
            searchWord: buildDefaultSearchWord(
              resortNamesById.get(lift.skiId) ?? lift.skiId,
              lift.name,
            ),
          },
        }
      : lift,
  );

export const isSameCoordinates = (a: LngLat[], b: LngLat[]): boolean =>
  a.length === b.length &&
  a.every((pair, index) => pair[0] === b[index][0] && pair[1] === b[index][1]);

export const isSameMidstation = (
  a: LngLat | null,
  b: LngLat | null,
): boolean => {
  if (a === null || b === null) return a === b;
  return a[0] === b[0] && a[1] === b[1];
};

export const hasLineChange = (lift: EditorLift): boolean =>
  !isSameCoordinates(lift.coordinates, lift.original.coordinates);

export const hasMidstationChange = (lift: EditorLift): boolean =>
  !isSameMidstation(lift.midstation, lift.original.midstation);

export const hasGeometryChange = (lift: EditorLift): boolean =>
  hasLineChange(lift) || hasMidstationChange(lift);

// 2 点間のおおよその距離（メートル）
export const distanceM = (a: LngLat, b: LngLat): number => {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export const formatDistanceM = (meters: number): string =>
  meters >= 1000 ? `${(meters / 1000).toFixed(2)}km` : `${Math.round(meters)}m`;
