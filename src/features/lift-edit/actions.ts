"use server";

import {
  hashContent,
  isValidResortId,
  listLiftBeforeResortIds,
  parseLiftBeforeGeojson,
  readLiftBeforeRaw,
  readLiftDetailEntries,
  writeLiftBeforeGeojson,
  writeLiftConfirmed,
} from "./server/liftFiles";
import type {
  LiftBeforeFeature,
  LiftSourceData,
  SaveLiftPayload,
  SaveRequest,
  SaveResult,
} from "./types";

// 既存の lift_before / lift_detail をサーバー側で読み込む
export async function loadLiftSourceData(
  resortId: string,
): Promise<LiftSourceData> {
  const [raw, details] = await Promise.all([
    readLiftBeforeRaw(resortId),
    readLiftDetailEntries(resortId),
  ]);
  if (raw === null) return { geojson: null, details, fileHash: null };
  return {
    geojson: parseLiftBeforeGeojson(raw),
    details,
    fileHash: hashContent(raw),
  };
}

const isFinitePair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]);

const liftLabel = (lift: SaveLiftPayload, index: number): string => {
  const name = lift.properties?.name;
  return typeof name === "string" && name !== ""
    ? `「${name}」`
    : `${index + 1} 番目のリフト`;
};

// 保存前のサーバー側検証。クライアント側検証と独立に行う
const validateSaveRequest = (request: SaveRequest): string[] => {
  const errors: string[] = [];
  if (!isValidResortId(request.resortId)) {
    errors.push(`不正なスキー場IDです: ${request.resortId}`);
  }
  if (!Array.isArray(request.lifts)) {
    errors.push("リフトデータの形式が不正です。");
    return errors;
  }

  request.lifts.forEach((lift, index) => {
    const label = liftLabel(lift, index);
    if (!isValidResortId(lift.targetSkiId)) {
      errors.push(`${label}: 所属スキー場IDが不正です（${lift.targetSkiId}）`);
    }
    if (
      lift.properties === null ||
      typeof lift.properties !== "object" ||
      Array.isArray(lift.properties)
    ) {
      errors.push(`${label}: properties の形式が不正です。`);
    }
    if (
      !Array.isArray(lift.coordinates) ||
      lift.coordinates.length < 2 ||
      lift.coordinates.some(pair => !isFinitePair(pair))
    ) {
      errors.push(
        `${label}: 座標が不正です（2 点以上の [経度, 緯度] が必要）。`,
      );
    }
  });

  // 同じ移動先スキー場内での @id 重複を検出する
  const seen = new Map<string, number>();
  request.lifts.forEach((lift, index) => {
    const osmId = lift.properties?.["@id"];
    if (typeof osmId !== "string" || osmId === "") return;
    const key = `${lift.targetSkiId}:${osmId}`;
    const firstIndex = seen.get(key);
    if (firstIndex !== undefined) {
      errors.push(
        `${liftLabel(lift, index)} と ${liftLabel(request.lifts[firstIndex], firstIndex)} の @id が重複しています（${osmId}）。`,
      );
    } else {
      seen.set(key, index);
    }
  });

  return errors;
};

const toFeature = (lift: SaveLiftPayload): LiftBeforeFeature => ({
  type: "Feature",
  properties: lift.properties,
  geometry: {
    coordinates: lift.coordinates,
    type: "LineString",
  },
});

// 編集結果で lift_before を書き換える。
// 別スキー場へ移したリフトは移動先ファイルへ追記し、移動先の既存データは変更しない。
export async function saveLiftEdits(request: SaveRequest): Promise<SaveResult> {
  const errors = validateSaveRequest(request);
  if (errors.length > 0) return { ok: false, errors };

  // 読み込み時からファイルが変わっていないか確認する（他での編集の上書き防止）
  const currentRaw = await readLiftBeforeRaw(request.resortId);
  const currentHash = currentRaw === null ? null : hashContent(currentRaw);
  if (currentHash !== request.fileHash) {
    return {
      ok: false,
      errors: [
        "読み込み後に lift_before ファイルが変更されています。ページを再読み込みして、最新のデータから編集し直してください。",
      ],
    };
  }

  // 移動先ごとにグループ化し、書き込み内容を先にすべて組み立てる
  const movedByTarget = new Map<string, LiftBeforeFeature[]>();
  const sourceFeatures: LiftBeforeFeature[] = [];
  for (const lift of request.lifts) {
    if (lift.targetSkiId === request.resortId) {
      sourceFeatures.push(toFeature(lift));
    } else {
      const list = movedByTarget.get(lift.targetSkiId) ?? [];
      list.push(toFeature(lift));
      movedByTarget.set(lift.targetSkiId, list);
    }
  }

  const writes: Array<{
    resortId: string;
    geojson: { type: "FeatureCollection"; features: LiftBeforeFeature[] };
  }> = [
    {
      resortId: request.resortId,
      geojson: { type: "FeatureCollection", features: sourceFeatures },
    },
  ];
  for (const [targetId, features] of movedByTarget) {
    const targetRaw = await readLiftBeforeRaw(targetId);
    const targetGeojson =
      targetRaw === null ? null : parseLiftBeforeGeojson(targetRaw);
    if (targetRaw !== null && targetGeojson === null) {
      return {
        ok: false,
        errors: [
          `移動先 ${targetId} の lift_before を解析できないため保存を中止しました。`,
        ],
      };
    }
    writes.push({
      resortId: targetId,
      geojson: {
        type: "FeatureCollection",
        features: [...(targetGeojson?.features ?? []), ...features],
      },
    });
  }

  // 検証・組み立てがすべて成功してから書き込む
  const writtenFiles: string[] = [];
  for (const write of writes) {
    await writeLiftBeforeGeojson(write.resortId, write.geojson);
    writtenFiles.push(`lift_before/${write.resortId}.geojson`);
  }
  return { ok: true, writtenFiles };
}

// スキー場一覧に lift_before の有無を付与するためのIDリスト
export async function listLiftBeforeIds(): Promise<string[]> {
  return listLiftBeforeResortIds();
}

// スキー場の確認済みフラグを切り替える（lift_confirmed.json を更新）
export async function setLiftConfirmed(
  resortId: string,
  confirmed: boolean,
): Promise<{ confirmedAt: string | null }> {
  const map = await writeLiftConfirmed(resortId, confirmed);
  return { confirmedAt: map[resortId] ?? null };
}
