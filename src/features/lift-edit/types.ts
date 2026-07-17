import type { LngLat } from "@/features/slope-edit/types";

export type { LngLat };

// lift_detail 由来の詳細情報。編集中はすべて文字列で保持し、
// 保存時に数値化できるものは数値へ戻す（既存データの形式に合わせる）
export type LiftDetail = {
  speed: string;
  type: string;
  hood: string;
  capacity: string;
  distance: string;
  vertical: string;
  top: string;
  bottom: string;
  footrest: string;
  towers: string;
  oilShield: string;
  maker: string;
  year: string;
  note: string;
  searchWord: string;
  morning: string;
  night: string;
};

export type LiftDetailKey = keyof LiftDetail;

// lift_detail のエントリをどうやって対応付けたか
export type DetailMatchMethod = "name" | "manual";

export type EditorLift = {
  id: string;
  // 読み込み時点の lift_before ファイル内でのインデックス（新規追加リフトは -1）
  sourceIndex: number;
  // このセッションで新規追加したリフト（削除可能なのは新規のみ）
  isNew?: boolean;
  name: string;
  aerialway: string;
  // OSM 由来の @id。ユーザーは変更しない
  osmId: string | null;
  // 現在の所属スキー場（編集対象）
  skiId: string;
  coordinates: LngLat[];
  // 中間駅の位置（無い場合は null）
  midstation: LngLat | null;
  // 読み込んだ properties.midstation の生の値。
  // 未変更のまま保存するときは（標高値付き配列などを壊さないよう）これを書き戻す
  midstationRaw: unknown;
  detail: LiftDetail;
  // name / aerialway / @id / 詳細フィールド以外の元 properties（そのまま保存へ引き継ぐ）
  extras: Record<string, unknown>;
  // lift_detail との結合情報
  detailMatch: {
    method: DetailMatchMethod;
    detailName: string;
    // 結合元エントリの lift_detail 配列内インデックス
    entryIndex: number;
    // lift_detail 側から取り込まれた値（確認画面用）
    mergedFields: Partial<LiftDetail>;
  } | null;
  // 読み込み時点の状態（変更差分・取り消し用）
  original: {
    skiId: string;
    name: string;
    aerialway: string;
    coordinates: LngLat[];
    midstation: LngLat | null;
    detail: LiftDetail;
  };
};

export type LiftDetailEntry = Record<string, unknown> & {
  resort?: string;
  name?: string;
};

export type LiftBeforeFeature = {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
};

export type LiftBeforeGeojson = {
  type: "FeatureCollection";
  features: LiftBeforeFeature[];
};

export type LiftSourceData = {
  geojson: LiftBeforeGeojson | null;
  details: LiftDetailEntry[] | null;
  // 読み込み時のファイル内容ハッシュ。保存時に競合検出へ使う
  fileHash: string | null;
};

export type ResortOption = {
  id: string;
  nameJa: string;
  nameEn: string;
  prefecture: string;
  latitude: number;
  longitude: number;
  hasLiftBefore: boolean;
  // lift_confirmed.json 由来。確認済みにした日時（未確認なら null）
  confirmedAt: string | null;
};

export type EditStep = "select" | "assign" | "geometry" | "details" | "confirm";

// 保存時にサーバーへ送る 1 リフト分のデータ
export type SaveLiftPayload = {
  targetSkiId: string;
  properties: Record<string, unknown>;
  coordinates: LngLat[];
};

export type SaveRequest = {
  resortId: string;
  // loadLiftSourceData が返したハッシュ。ファイルが書き換わっていたら保存を中止する
  fileHash: string | null;
  lifts: SaveLiftPayload[];
};

export type SaveResult =
  | { ok: true; writtenFiles: string[] }
  | { ok: false; errors: string[] };

export type LiftEditDraft = {
  version: 1;
  resortId: string;
  fileHash: string | null;
  lifts: EditorLift[];
  updatedAt: string;
  savedToServerAt: string | null;
};

export type DraftSummary = {
  resortId: string;
  updatedAt: string;
  liftCount: number;
};
