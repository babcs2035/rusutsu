import type { LngLat } from "@/features/slope-edit/types";
import { DETAIL_KEYS } from "../constants";
import type { EditorLift, LiftDetailEntry, LiftSourceData } from "../types";
import {
  createEmptyLiftDetail,
  mergeDetailEntry,
  toDetailString,
} from "./detailMerge";

const PROPERTY_KEYS_HANDLED = new Set<string>([
  "@id",
  "name",
  "aerialway",
  "midstation",
  ...DETAIL_KEYS,
]);

// midstation は [lng, lat] 形式（標高付きの [lng, lat, ele] もある）
const parseMidstation = (value: unknown): LngLat | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
};

export const createLiftId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `lift-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type LoadResult = {
  lifts: EditorLift[];
  // LineString 以外などで読み込めなかった feature 数
  skipped: number;
};

// lift_before + lift_detail を編集用のリフト配列へ変換する。
// lift_detail は「同名のリフト・エントリがちょうど 1 件ずつ」のときだけ
// 自動で結合し、曖昧な場合は結合せず画面での手動結合に回す。
export const sourceDataToLifts = (
  resortId: string,
  source: LiftSourceData,
): LoadResult => {
  const lifts: EditorLift[] = [];
  let skipped = 0;

  (source.geojson?.features ?? []).forEach((feature, index) => {
    if (feature.geometry?.type !== "LineString") {
      skipped++;
      return;
    }
    const coordinates = (
      Array.isArray(feature.geometry.coordinates)
        ? (feature.geometry.coordinates as unknown[])
        : []
    )
      .map(value => {
        if (!Array.isArray(value) || value.length < 2) return null;
        const lng = Number(value[0]);
        const lat = Number(value[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return [lng, lat] as LngLat;
      })
      .filter((coordinate): coordinate is LngLat => coordinate !== null);
    if (coordinates.length < 2) {
      skipped++;
      return;
    }

    const properties = feature.properties ?? {};
    const name = typeof properties.name === "string" ? properties.name : "";
    const aerialway =
      typeof properties.aerialway === "string" ? properties.aerialway : "";
    const osmId =
      typeof properties["@id"] === "string" ? properties["@id"] : null;
    const midstation = parseMidstation(properties.midstation);

    // 過去にこのツールで保存した詳細フィールドを properties から復元する
    const detail = createEmptyLiftDetail();
    for (const key of DETAIL_KEYS) {
      detail[key] = toDetailString(properties[key]);
    }

    const extras: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (!PROPERTY_KEYS_HANDLED.has(key)) extras[key] = value;
    }

    lifts.push({
      id: createLiftId(),
      sourceIndex: index,
      name,
      aerialway,
      osmId,
      skiId: resortId,
      coordinates,
      midstation,
      midstationRaw: "midstation" in properties ? properties.midstation : null,
      detail,
      extras,
      detailMatch: null,
      original: {
        skiId: resortId,
        name,
        aerialway,
        coordinates: coordinates.map(pair => [...pair] as LngLat),
        midstation: midstation ? ([...midstation] as LngLat) : null,
        detail: { ...detail },
      },
    });
  });

  // 名前 → リフト/エントリの対応を数え、1 対 1 のときだけ自動結合する
  const liftCountByName = new Map<string, number>();
  for (const lift of lifts) {
    if (lift.name === "") continue;
    liftCountByName.set(lift.name, (liftCountByName.get(lift.name) ?? 0) + 1);
  }
  const entries = source.details ?? [];
  const entryCountByName = new Map<string, number>();
  for (const entry of entries) {
    if (typeof entry.name !== "string" || entry.name === "") continue;
    entryCountByName.set(
      entry.name,
      (entryCountByName.get(entry.name) ?? 0) + 1,
    );
  }

  const entryByName = new Map<
    string,
    { entry: LiftDetailEntry; index: number }
  >();
  entries.forEach((entry, index) => {
    const name = typeof entry.name === "string" ? entry.name : "";
    if (
      name !== "" &&
      entryCountByName.get(name) === 1 &&
      liftCountByName.get(name) === 1
    ) {
      entryByName.set(name, { entry, index });
    }
  });

  const mergedLifts = lifts.map(lift => {
    const matched = lift.name !== "" ? entryByName.get(lift.name) : undefined;
    return matched
      ? mergeDetailEntry(lift, matched.entry, matched.index, "name")
      : lift;
  });

  return { lifts: mergedLifts, skipped };
};
